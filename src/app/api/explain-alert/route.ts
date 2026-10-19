/**
 * POST /api/explain-alert — "Explícame esta alerta" (F44).
 *
 * Body: { alert: ExplainAlertInput }
 * Reutiliza la cuota del asistente (chat) y OpenRouter. La respuesta NO es
 * asesoría: el prompt prohíbe recomendaciones personalizadas (Ley Fintec).
 * Sin OPENROUTER_API_KEY responde 503 con un mensaje claro, sin romper la UI.
 */

import { enforceAnonQuota, enforceSignedInQuota } from "@/lib/chat-guard";
import {
  EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserPrompt,
  explainAlertRequestSchema,
  explainSources,
  normalizeExplanation,
} from "@/lib/explain-prompt";
import { FINTEC_NOTICE } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import { firstZodMessage } from "@/lib/validation";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
/** Body acotado: la alerta es pequeña; el payload se resume en el servidor. */
const MAX_BODY_BYTES = 24_000;

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

  const parsed = explainAlertRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: firstZodMessage(parsed.error) }, { status: 400 });
  }

  const { alert } = parsed.data;

  // Misma cuota que el asistente: sesión vía RPC, anónimo por IP.
  const supabase = await createClient();
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
