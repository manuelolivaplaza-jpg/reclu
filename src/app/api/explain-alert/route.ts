/**
 * POST /api/explain-alert — "Explícame esta alerta" (F44).
 *
 * Body: { alertId: uuid } (M8). El contenido se lee de `alerts` con
 * `is_published = true` en el servidor: nunca se explica texto que manda el
 * cliente, para que la respuesta no pueda llevar la marca de la plataforma
 * sobre contenido arbitrario.
 *
 * Reutiliza la cuota del asistente (chat) y OpenRouter. La respuesta NO es
 * asesoría: el prompt prohíbe recomendaciones personalizadas (Ley Fintec).
 * Sin OPENROUTER_API_KEY responde 503 con un mensaje claro, sin romper la UI.
 */

import { enforceAnonQuota, enforceSignedInQuota } from "@/lib/chat-guard";
import {
  EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserPrompt,
  explainAlertIdSchema,
  explainAlertRequestSchema,
  explainSources,
  normalizeExplanation,
  type ExplainAlertInput,
} from "@/lib/explain-prompt";
import { FINTEC_NOTICE } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import { firstZodMessage } from "@/lib/validation";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
/** Body acotado: la alerta es pequeña; el payload se resume en el servidor. */
const MAX_BODY_BYTES = 24_000;

/**
 * Convierte la fila de `alerts` (con su portafolio) en la entrada que ya
 * consumían los prompts. Valida en el servidor; si la fila no calza, no se
 * explica (mejor 404 que filtrar datos raros al modelo).
 */
function explainInputFromRow(row: unknown): ExplainAlertInput | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (!record.portfolio || typeof record.portfolio !== "object") return null;
  const portfolio = record.portfolio as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : {};

  const parsed = explainAlertRequestSchema.safeParse({
    alert: {
      type: record.type,
      severity: record.severity,
      title: record.title,
      summary: record.summary,
      createdAt: record.created_at,
      payload,
      portfolio: {
        slug: portfolio.slug,
        name: portfolio.name,
        manager: portfolio.manager,
        category: portfolio.category,
      },
    },
  });

  return parsed.success ? parsed.data.alert : null;
}

function completionText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (!first || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  return normalizeExplanation((message as { content?: unknown }).content);
}

export async function POST(request: Request) {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "No pudimos leer la solicitud." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "La alerta enviada es demasiado grande." }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const parsed = explainAlertIdSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: firstZodMessage(parsed.error) }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row, error: lookupError } = await supabase
    .from("alerts")
    .select(
      "id, type, severity, title, summary, payload, created_at, portfolio:portfolios!inner(slug, name, manager, category)",
    )
    .eq("id", parsed.data.alertId)
    .eq("is_published", true)
    .maybeSingle();

  if (lookupError) {
    console.warn("[reclu] explain-alert lookup:", lookupError.message);
    return Response.json({ error: "No pudimos leer la alerta." }, { status: 500 });
  }

  const alert = explainInputFromRow(row);
  if (!alert) {
    return Response.json({ error: "Alerta no encontrada." }, { status: 404 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "La explicación con IA no está disponible en este entorno (falta OPENROUTER_API_KEY).",
      },
      { status: 503 },
    );
  }

  // Misma cuota que el asistente: sesión vía RPC, anónimo por IP.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const quota = user
    ? await enforceSignedInQuota(user.id)
    : await enforceAnonQuota(request.headers);
  if (!quota.ok) {
    return Response.json(quota.body, { status: quota.status });
  }

  const sources = explainSources(alert);
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
          { role: "user", content: buildExplainUserPrompt(alert) },
        ],
        max_tokens: 600,
        temperature: 0.2,
        stream: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return Response.json({ error: "No se pudo contactar a OpenRouter." }, { status: 502 });
  }

  if (!upstream.ok) {
    console.warn("[reclu] explain-alert OpenRouter:", upstream.status);
    return Response.json(
      { error: "OpenRouter no devolvió una respuesta válida." },
      { status: 502 },
    );
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return Response.json(
      { error: "OpenRouter no devolvió una respuesta válida." },
      { status: 502 },
    );
  }

  const explanation = completionText(data);
  if (!explanation) {
    return Response.json(
      { error: "La IA no entregó una explicación. Intenta de nuevo." },
      { status: 502 },
    );
  }

  return Response.json(
    {
      explanation,
      sources,
      notice: FINTEC_NOTICE,
    },
    {
      headers: {
        ...quota.headers,
        "Cache-Control": "no-store",
      },
    },
  );
}
