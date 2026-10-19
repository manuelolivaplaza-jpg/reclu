/**
 * POST /api/publish/draft — redacta borradores a partir de alertas.
 *
 * Toma las alertas publicadas de las últimas 24 h con severidad high/medium,
 * de portafolios con fuente pública, y crea un borrador por canal
 * (`x`, `telegram`, `newsletter`) con estado `draft`.
 *
 * No envía nada: solo inserta en `publish_drafts`. El envío sigue dependiendo
 * de la aprobación manual y de los flags de F17.
 *
 * AUTENTICACIÓN: `Authorization: Bearer ${CRON_SECRET}`. Sin secreto
 * configurado responde 503 y no consulta ni escribe nada.
 */

import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { composeFromAlert, draftLink } from "@/lib/publish/compose";
import type { Channel } from "@/lib/publish/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Alert } from "@/lib/types";

const CHANNELS: readonly Channel[] = ["x", "telegram", "newsletter"] as const;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ALERTS = 100;

/**
 * Fuentes que no son públicas: carteras modelo propias, carga manual o datos
 * de demostración. Todo lo demás viene de un scraper sobre una fuente pública.
 */
const NON_PUBLIC_SOURCES = new Set(["model", "manual", "demo", "internal"]);

interface AlertRow extends Alert {
  is_published?: boolean;
}

interface PortfolioRow {
  id: string;
  slug: string;
  name: string;
  source: string;
  category?: string;
}

/** Comparación en tiempo constante, igual que /api/run-pipeline. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = 0;
  for (let i = 0; i < maxLen; i++) {
    const ai = i < aBytes.length ? aBytes[i] : 0;
    const bi = i < bBytes.length ? bBytes[i] : 0;
    diff |= ai ^ bi;
  }
  return diff === 0 && aBytes.length === bBytes.length;
}

function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET no está configurado. No se pueden generar borradores sin él.",
      },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(auth, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function isPublicSource(source: string | null | undefined): boolean {
  const value = (source ?? "").trim().toLowerCase();
  return value.length > 0 && !NON_PUBLIC_SOURCES.has(value);
}

/**
 * Id determinista por alerta+canal: el upsert es idempotente sin necesitar
 * un índice único nuevo. Si el borrador ya existe no se pisa (por ejemplo,
 * uno ya aprobado).
 */
function draftId(alertId: string, channel: Channel): string {
  const hex = createHash("sha256")
    .update(`publish-draft:${alertId}:${channel}`)
    .digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

interface DraftRow {
  id: string;
  channel: Channel;
  body: string;
  payload: Record<string, unknown>;
  source_alert_id: string;
  status: "draft";
  preview_url: string;
}

export async function POST(request: NextRequest) {
  const denied = checkAuth(request);
  if (denied) return denied;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. No se pueden generar borradores.",
      },
      { status: 503 },
    );
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data: alertData, error: alertError } = await supabase
    .from("alerts")
    .select("id, portfolio_id, type, severity, title, summary, payload, created_at")
    .eq("is_published", true)
    .in("severity", ["high", "medium"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ALERTS);

  if (alertError) {
    return NextResponse.json(
      { error: `No se pudieron leer las alertas: ${alertError.message}` },
      { status: 500 },
    );
  }

  const alerts = ((alertData ?? []) as AlertRow[]).filter(
    (alert) => alert.type !== "scraper_error",
  );

  if (alerts.length === 0) {
    return NextResponse.json({
      ok: true,
      window_hours: 24,
      alerts: 0,
      drafts_created: 0,
      reason: "No hay alertas relevantes en las últimas 24 horas.",
    });
  }

  const portfolioIds = [...new Set(alerts.map((alert) => alert.portfolio_id))];
  const { data: portfolioData, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, slug, name, source, category")
    .in("id", portfolioIds);

  if (portfolioError) {
    return NextResponse.json(
      { error: `No se pudieron leer los portafolios: ${portfolioError.message}` },
      { status: 500 },
    );
  }

  const portfolios = new Map<string, PortfolioRow>(
    ((portfolioData ?? []) as PortfolioRow[]).map((row) => [row.id, row]),
  );

  const relevant = alerts.filter((alert) => {
    const portfolio = portfolios.get(alert.portfolio_id);
    return !!portfolio && isPublicSource(portfolio.source);
  });

  if (relevant.length === 0) {
    return NextResponse.json({
      ok: true,
      window_hours: 24,
      alerts: 0,
      drafts_created: 0,
      reason: "Ninguna alerta reciente viene de una fuente pública.",
    });
  }

  const { data: existingData, error: existingError } = await supabase
    .from("publish_drafts")
    .select("source_alert_id, channel")
    .in(
      "source_alert_id",
      relevant.map((alert) => alert.id),
    );

  if (existingError) {
    return NextResponse.json(
      {
        error: `No se pudieron leer los borradores existentes: ${existingError.message}`,
      },
      { status: 500 },
    );
  }

  const existing = new Set(
    ((existingData ?? []) as { source_alert_id: string | null; channel: string }[]).map(
      (row) => `${row.source_alert_id}:${row.channel}`,
    ),
  );

  const generatedAt = new Date().toISOString();
  const rows: DraftRow[] = [];

  for (const alert of relevant) {
    const portfolio = portfolios.get(alert.portfolio_id);
    if (!portfolio) continue;

    for (const channel of CHANNELS) {
      if (existing.has(`${alert.id}:${channel}`)) continue;

      const body = composeFromAlert(alert, portfolio, channel);
      const link = draftLink(portfolio.slug, channel);

      rows.push({
        id: draftId(alert.id, channel),
        channel,
        body,
        payload: {
          alert_id: alert.id,
          alert_type: alert.type,
          severity: alert.severity,
          portfolio_id: portfolio.id,
          portfolio_slug: portfolio.slug,
          source: portfolio.source,
          link,
          generated_at: generatedAt,
        },
        source_alert_id: alert.id,
        status: "draft" as const,
        preview_url: link,
      });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      window_hours: 24,
      alerts: relevant.length,
      drafts_created: 0,
      reason: "Todas las alertas relevantes ya tienen borrador.",
    });
  }

  // Upsert idempotente por id determinista: si otra corrida alcanzó a
  // insertar, no se duplica ni se pisa el borrador existente.
  const { data: inserted, error: insertError } = await supabase
    .from("publish_drafts")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select("id, channel");

  if (insertError) {
    return NextResponse.json(
      { error: `No se pudieron guardar los borradores: ${insertError.message}` },
      { status: 500 },
    );
  }

  const created = (inserted ?? []) as { id: string; channel: Channel }[];
  const byChannel = { x: 0, telegram: 0, newsletter: 0 };
  for (const row of created) byChannel[row.channel] += 1;

  return NextResponse.json({
    ok: true,
    window_hours: 24,
    alerts: relevant.length,
    drafts_created: created.length,
    skipped_existing: rows.length - created.length,
    by_channel: byChannel,
    ran_at: generatedAt,
  });
}
