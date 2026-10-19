// Supabase Edge Function: send alert emails (Resend) + Telegram messages.
// Deploy: supabase functions deploy send-alerts
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, EMAIL_FROM
//   SITE_URL o NEXT_PUBLIC_SITE_URL (base de enlaces de baja)
//   TELEGRAM_BOT_TOKEN (opcional; se omite sin error si falta)
//   DIGEST_SPONSOR_HTML (opcional; bloque HTML del resumen semanal)
//
// Sincronización: la lógica de routing replicada aquí debe coincidir con
// `src/lib/plans.ts` + `src/lib/alert-routing.ts` (Deno no puede importar
// desde src/). Si cambian planes o frecuencias, cambia ambas copias.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface AlertWithPortfolio {
  id: string;
  portfolio_id: string;
  type: string;
  severity: string;
  title: string;
  summary: string | null;
  /** Datos crudos del cambio (alert.payload): usado para el desfase. */
  payload?: Record<string, unknown> | null;
  created_at: string;
  portfolio: { id: string; slug: string; name: string };
}

// ---- Copia mínima de plans.ts + alert-routing.ts (ver comentario arriba) ----

const ALL_FREQUENCIES = ["realtime", "daily", "weekly"] as const;

function isPaidPlan(plan?: string | null): boolean {
  return plan === "pro" || plan === "elite";
}

function isTrialPro(plan?: string | null, trialEndsAt?: string | null): boolean {
  if (isPaidPlan(plan) || typeof trialEndsAt !== "string" || trialEndsAt.length === 0) {
    return false;
  }
  const ends = Date.parse(trialEndsAt);
  return Number.isFinite(ends) && ends > Date.now();
}

function canUseRealtime(plan?: string | null, trialEndsAt?: string | null): boolean {
  return isPaidPlan(plan) || isTrialPro(plan, trialEndsAt);
}

/** Normaliza la frecuencia pedida a una válida para el plan (cae a daily). */
function normalizeFrequency(
  plan: string,
  requested: string | null | undefined,
  trialEndsAt?: string | null,
): (typeof ALL_FREQUENCIES)[number] {
  const wanted = ALL_FREQUENCIES.includes(requested as (typeof ALL_FREQUENCIES)[number])
    ? (requested as (typeof ALL_FREQUENCIES)[number])
    : "daily";
  if (wanted === "realtime" && !canUseRealtime(plan, trialEndsAt)) return "daily";
  return wanted;
}

interface ProfileRoute {
  plan: string;
  trial_ends_at?: string | null;
  alert_frequency: string;
  alert_channel?: string | null;
  email_unsubscribed?: boolean | null;
  telegram_chat_id?: string | null;
  weekly_digest?: boolean | null;
}

interface FollowerProfile extends ProfileRoute {
  email: string;
  full_name: string | null;
  unsubscribe_token?: string | null;
}

type Mode = "instant" | "daily" | "weekly";

/** Equivalente a routeAlert() de src/lib/alert-routing.ts. */
function routeAlert(
  profile: ProfileRoute,
  mode: Mode,
): { email: boolean; telegram: boolean; frequency: string } {
  const frequency = normalizeFrequency(profile.plan, profile.alert_frequency, profile.trial_ends_at);
  const unsubscribed = profile.email_unsubscribed === true;
  const telegramReady =
    (profile.alert_channel === "telegram" || profile.alert_channel === "both") &&
    typeof profile.telegram_chat_id === "string" &&
    profile.telegram_chat_id.length > 0 &&
    canUseRealtime(profile.plan, profile.trial_ends_at);

  if (mode === "weekly") {
    const weeklyOk = profile.weekly_digest !== false;
    return {
      email: weeklyOk && !unsubscribed,
      telegram: telegramReady && weeklyOk && !unsubscribed,
      frequency,
    };
  }
  if (mode === "daily") {
    // El digest agrupa lo no entregado: el correo va para todas las
    // frecuencias; Telegram solo para quienes NO son realtime (ya avisados).
    return { email: !unsubscribed, telegram: telegramReady && frequency !== "realtime", frequency };
  }
  // instant: solo quienes eligieron (y pueden) tiempo real.
  if (frequency !== "realtime") {
    return { email: false, telegram: false, frequency };
  }
  return { email: !unsubscribed, telegram: telegramReady, frequency };
}

/** Bloque HTML opcional de patrocinador del resumen semanal (vacío = nada). */
const DIGEST_SPONSOR_HTML = Deno.env.get("DIGEST_SPONSOR_HTML") ?? "";

/** URL base del sitio para enlaces de baja/administración. */
function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://reclu.cl")
    .replace(/\/+$/, "");
}

/** Enlace de baja. Vacío si el perfil no trae token (no inventamos un host). */
function unsubscribeLink(token?: string | null): string | undefined {
  if (!token) return undefined;
  return `${siteUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("EMAIL_FROM") ?? "reclu.cl <alertas@reclu.cl>";
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    // Sin ?mode el cron diario manda instantáneas y el digest de lo no entregado.
    // ?mode=weekly es solo el resumen "Lo que movieron los grandes".
    const requested = new URL(req.url).searchParams.get("mode");
    const modes: Mode[] =
      requested === "weekly" ? ["weekly"] : requested === "daily" ? ["daily"] : ["instant", "daily"];

    if (!resendKey) {
      return Response.json(
        { error: "RESEND_API_KEY not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    // 1. Find published alerts that haven't been delivered to anyone yet
    const { data: pendingAlerts, error: alertsErr } = await supabase
      .from("alerts")
      .select("*, portfolio:portfolios!inner(id, slug, name)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (alertsErr) throw alertsErr;
    if (!pendingAlerts || pendingAlerts.length === 0) {
      return Response.json({ sent: 0, message: "No pending alerts" }, { headers: corsHeaders });
    }

    let totalSent = 0;
    const alerts = pendingAlerts as AlertWithPortfolio[];

    // Followers con perfil ampliado (plans.ts: plan, trial, frecuencia, canal).
    const { data: follows, error: followsErr } = await supabase
      .from("follows")
      .select(
        "user_id, portfolio_id, profiles!inner(email, full_name, plan, trial_ends_at, " +
          "alert_frequency, alert_channel, email_unsubscribed, telegram_chat_id, " +
          "weekly_digest, unsubscribe_token)",
      )
      .in("portfolio_id", [...new Set(alerts.map((a) => a.portfolio_id))]);
    if (followsErr) throw followsErr;

    const deliveredRows = follows?.length
      ? await supabase
          .from("alert_deliveries")
          .select("alert_id, user_id")
          .in("alert_id", alerts.map((a) => a.id))
      : { data: null };
    const deliveredKeys = new Set(
      ((deliveredRows.data ?? []) as { alert_id: string; user_id: string }[]).map(
        (d) => `${d.alert_id}:${d.user_id}`,
      ),
    );

    const alertsByPortfolio = new Map<string, AlertWithPortfolio[]>();
    for (const alert of alerts) {
      const list = alertsByPortfolio.get(alert.portfolio_id) ?? [];
      list.push(alert);
      alertsByPortfolio.set(alert.portfolio_id, list);
    }

    // Un correo (o un mensaje) por usuario, no por fila de follow.
    // alert_deliveries no distingue canal: la misma fila vale para email y Telegram.
    for (const mode of modes) {
      const buckets = new Map<string, {
        userId: string;
        profile: FollowerProfile;
        route: { email: boolean; telegram: boolean };
        alerts: AlertWithPortfolio[];
        seen: Set<string>;
      }>();

      for (const row of follows ?? []) {
        const profile = firstProfile(row.profiles);
        if (!profile) continue;
        const route = routeAlert(profile, mode);
        if (!route.email && !route.telegram) continue;

        const portfolioAlerts = (alertsByPortfolio.get(row.portfolio_id) ?? []).filter(
          (alert) => !deliveredKeys.has(`${alert.id}:${row.user_id}`),
        );
        if (portfolioAlerts.length === 0) continue;

        let bucket = buckets.get(row.user_id);
        if (!bucket) {
          bucket = { userId: row.user_id, profile, route, alerts: [], seen: new Set() };
          buckets.set(row.user_id, bucket);
        }
        for (const alert of portfolioAlerts) {
          if (bucket.seen.has(alert.id)) continue;
          bucket.seen.add(alert.id);
          bucket.alerts.push(alert);
        }
      }

      for (const bucket of buckets.values()) {
        const { profile, route, userId } = bucket;
        const pending = bucket.alerts;
        const unsub = unsubscribeLink(profile.unsubscribe_token);
        const byEmail = typeof profile.email === "string" && profile.email.trim() !== "";

        if (route.email && byEmail) {
          if (mode === "instant") {
            for (const alert of pending) {
              const res = await sendEmail(
                resendKey,
                from,
                profile.email,
                `reclu.cl — ${alert.portfolio.name}: ${alert.title}`,
                renderEmail(alert, profile, profile.unsubscribe_token),
                unsub,
              );
              if (res) {
                totalSent++;
                await markDelivery(supabase, alert.id, userId);
                deliveredKeys.add(`${alert.id}:${userId}`);
              }
            }
          } else {
            const name = profile.full_name?.trim() || "Hola";
            const html = mode === "weekly"
              ? buildWeekly(profile, pending)
              : buildDigest(pending, name, { token: profile.unsubscribe_token });
            const subject = mode === "weekly"
              ? "reclu.cl — Lo que movieron los grandes"
              : "Tu resumen reclu";
            const res = html
              ? await sendEmail(resendKey, from, profile.email, subject, html, unsub)
              : null;
            if (res) {
              totalSent++;
              for (const alert of pending) {
                await markDelivery(supabase, alert.id, userId);
                deliveredKeys.add(`${alert.id}:${userId}`);
              }
            }
          }
        }

        if (route.telegram && telegramToken) {
          for (const alert of pending) {
            const ok = await sendTelegram(
              telegramToken,
              profile.telegram_chat_id ?? "",
              telegramText(alert, siteUrl()),
            );
            if (ok) {
              totalSent++;
              await markDelivery(supabase, alert.id, userId);
              deliveredKeys.add(`${alert.id}:${userId}`);
            }
          }
        }
      }
    }

    return Response.json({ modes, sent: totalSent }, { headers: corsHeaders });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500, headers: corsHeaders },
    );
  }
});

/** One email per alert: realtime, pro/elite or in-trial. */
async function sendEmail(
  resendKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  unsubscribeUrl?: string,
): Promise<boolean> {
  const payload: Record<string, unknown> = { from, to, subject, html };
  if (unsubscribeUrl) {
    payload.headers = {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

/** Canal Telegram vía Bot API. Sin token configurado devuelve false (sin error). */
async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  if (!token || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  return res.ok;
}

/** Texto corto de alerta para Telegram (parse_mode HTML). */
function telegramText(alert: AlertWithPortfolio, siteUrlBase: string): string {
  const detail = tradeTimingNote(alert);
  return [
    `<b>${escapeHtml(alert.portfolio.name)}</b>`,
    escapeHtml(alert.title),
    detail,
    `<a href="${siteUrlBase}/portfolio/${alert.portfolio.slug}">Ver portafolio</a>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Desfase entre la operación y su declaración (negocio de transparencia).
 * Usa alert.payload: { tx_date, disclosed } o { traded_at, filed_at }.
 */
function tradeTimingNote(alert: AlertWithPortfolio): string {
  const payload = (alert.payload ?? {}) as Record<string, unknown>;
  const tx = payload.tx_date ?? payload.traded_at;
  const filed = payload.disclosed ?? payload.filed_at;
  if (typeof tx !== "string" || typeof filed !== "string") return "";
  const txTime = Date.parse(tx);
  const filedTime = Date.parse(filed);
  if (!Number.isFinite(txTime) || !Number.isFinite(filedTime)) return "";
  const days = Math.max(0, Math.floor((filedTime - txTime) / 86_400_000));
  if (days === 0) return "Declarado el mismo día de la operación.";
  if (days === 1) return "Se declaró 1 día después de la operación.";
  return `Se declaró ${days} días después de la operación.`;
}

/** Marca la alerta como entregada a este usuario (alert_deliveries no distingue canal). */
async function markDelivery(
  supabase: SupabaseClient,
  alertId: string,
  userId: string,
): Promise<void> {
  await supabase.from("alert_deliveries").upsert(
    { alert_id: alertId, user_id: userId, email_sent: true, sent_at: new Date().toISOString() },
    { onConflict: "alert_id,user_id" },
  );
}

const FONT =
  "'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

/** Color a return only. Positive is green, negative is red, zero stays ink. */
function colorizeReturns(escaped: string): string {
  return escaped.replace(/[+\u2212-]?\d+(?:[.,]\d+)?\s*%/g, (match) => {
    const value = Number.parseFloat(
      match.replace("%", "").replace(/\s/g, "").replace(",", ".").replace("\u2212", "-"),
    );
    if (!Number.isFinite(value) || value === 0) return match;
    const color = value > 0 ? "#0f7a32" : "#c81e1e";
    return `<span style="color:${color};font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1;">${match}</span>`;
  });
}

/** Render the alert email: white, 1px rules, black pill. No brand blue. */
function renderEmail(alert: AlertWithPortfolio, _profile: ProfileRoute, token?: string | null): string {
  const portfolioUrl = `${siteUrl()}/portfolio/${alert.portfolio.slug}`;
  const title = colorizeReturns(escapeHtml(alert.title));
  const timing = tradeTimingNote(alert);
  const timingBlock = timing
    ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#6b6b6b;">⏱ ${escapeHtml(timing)}</p>`
    : "";
  const summaryBlock = alert.summary
    ? `<div style="margin:20px 0 0;padding:0 0 0 14px;border-left:2px solid #0a0a0a;background:#ffffff;">
         <p style="margin:0 0 6px;font-size:13px;font-weight:400;line-height:1.4;color:#6b6b6b;">Resumen AI</p>
         <p style="margin:0;font-size:15px;line-height:1.5;color:#0a0a0a;">${colorizeReturns(escapeHtml(alert.summary))}</p>
       </div>`
    : `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b6b6b;">Actualiza a Pro para recibir resúmenes con análisis AI.</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap">
<style>
  a.reclu-manage { color: #0a0a0a; text-decoration: none; }
  a.reclu-manage:hover { text-decoration: underline; }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:${FONT};">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.04em;line-height:1;color:#0a0a0a;">reclu</p>
    <div style="background:#ffffff;border:1px solid #e6e6e6;border-radius:0;box-shadow:none;padding:24px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:400;line-height:1.4;color:#6b6b6b;">${escapeHtml(alert.portfolio.name)}</p>
      <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-0.03em;line-height:1.2;color:#0a0a0a;">${title}</h1>
      ${timingBlock}
      ${summaryBlock}
      <a href="${portfolioUrl}" style="display:inline-block;margin-top:24px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;line-height:1;padding:14px 22px;border-radius:999px;">Ver portafolio</a>
    </div>
    <p style="margin:24px 0 0;font-size:11px;line-height:1.6;color:#6b6b6b;">
      Información pública con fines informativos. No constituye asesoría de inversión.
      <a class="reclu-manage" href="${siteUrl()}/settings" style="color:#0a0a0a;text-decoration:none;">Administrar alertas</a>${token ? ` · <a class="reclu-manage" href="${siteUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}" style="color:#0a0a0a;text-decoration:none;">Dejar de recibir estos correos</a>` : ""}
    </p>
  </div>
</body>
</html>`;
}

/** Supabase may type an inner join as one row or as an array. */
function firstProfile(
  profiles: FollowerProfile | FollowerProfile[] | null | undefined,
): FollowerProfile | null {
  if (!profiles) return null;
  return Array.isArray(profiles) ? profiles[0] ?? null : profiles;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Un correo agrupado por portafolio (digest diario o semanal).
 * Entrada vacía devuelve "" para que el caller no envíe nada.
 */
function buildDigest(
  alerts: AlertWithPortfolio[],
  name: string,
  opts?: { title?: string; lede?: string; token?: string | null; sponsor?: string },
): string {
  if (alerts.length === 0) return "";

  const groups = new Map<string, { portfolio: AlertWithPortfolio["portfolio"]; alerts: AlertWithPortfolio[] }>();
  for (const alert of alerts) {
    const key = alert.portfolio.id;
    const group = groups.get(key) ?? { portfolio: alert.portfolio, alerts: [] };
    group.alerts.push(alert);
    groups.set(key, group);
  }

  const sections = [...groups.values()].map((group) => {
    const items = group.alerts.map((alert) => {
      const summary = alert.summary
        ? `<p style="margin:6px 0 0;font-size:15px;line-height:1.5;color:#0a0a0a;">${colorizeReturns(escapeHtml(alert.summary))}</p>`
        : "";
      const timing = tradeTimingNote(alert);
      const timingHtml = timing
        ? `<p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:#6b6b6b;">${escapeHtml(timing)}</p>`
        : "";
      return `<div style="padding:14px 0;border-top:1px solid #e6e6e6;">
        <p style="margin:0;font-size:16px;font-weight:500;letter-spacing:-0.03em;line-height:1.3;color:#0a0a0a;">${colorizeReturns(escapeHtml(alert.title))}</p>
        ${timingHtml}
        ${summary}
      </div>`;
    }).join("");

    const portfolioUrl = `${siteUrl()}/portfolio/${group.portfolio.slug}`;
    return `<section style="margin-top:28px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:400;line-height:1.4;color:#6b6b6b;">${escapeHtml(group.portfolio.name)}</p>
      ${items}
      <a href="${portfolioUrl}" style="display:inline-block;margin-top:12px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;line-height:1;padding:14px 22px;border-radius:999px;">Ver portafolio</a>
    </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap">
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:${FONT};">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.04em;line-height:1;color:#0a0a0a;">reclu</p>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:500;letter-spacing:-0.04em;line-height:1;color:#0a0a0a;">${escapeHtml(opts?.title ?? "Tu resumen reclu")}</h1>
    <p style="margin:0;font-size:15px;line-height:1.5;color:#6b6b6b;">${escapeHtml(opts?.lede ?? `Hola ${name}, estos son los cambios en los portafolios que sigues.`)}</p>
    ${opts?.sponsor ?? ""}
    ${sections}
    <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e6e6e6;font-size:11px;line-height:1.6;color:#6b6b6b;">
      Información pública con fines informativos. No constituye asesoría de inversión.
      <a href="${siteUrl()}/settings" style="color:#0a0a0a;text-decoration:none;">Administrar alertas</a>${opts?.token ? ` · <a href="${unsubscribeLink(opts.token)}" style="color:#0a0a0a;text-decoration:none;">Dejar de recibir estos correos</a>` : ""}
    </p>
  </div>
</body>
</html>`;
}

/** Bloque opcional de patrocinador del resumen semanal (env var, vacío = nada). */
function sponsorBlock(): string {
  return DIGEST_SPONSOR_HTML;
}

/** Resumen semanal "Lo que movieron los grandes": mismo correo, otro título. */
function buildWeekly(profile: FollowerProfile, alerts: AlertWithPortfolio[]): string {
  const name = profile.full_name?.trim() || "Hola";
  return buildDigest(alerts, name, {
    title: "Lo que movieron los grandes",
    lede: "Resumen semanal de los cambios en los portafolios que sigues.",
    token: profile.unsubscribe_token,
    sponsor: sponsorBlock(),
  });
}
