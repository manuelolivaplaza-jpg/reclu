/**
 * POST /api/chat — conversational assistant for reclu.cl.
 * Body: { messages: { role: "user" | "assistant", content: string }[] }
 * Streams the model reply as Server-Sent Events (OpenRouter chat completions).
 *
 * Signed-in users have a server quota and a stored transcript.
 * Anonymous callers are not blocked here; the client tracks their own limit.
 */

import { createClient } from "@/lib/supabase/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_DAILY_LIMIT = 5;
const PRO_LOW_REMAINING = 10;

const SYSTEM_PROMPT = `Eres el asistente de reclu.cl, experto en inversiones y en los portafolios de la plataforma: políticos del Congreso de EE.UU., hedge funds 13F (como Warren Buffett y Michael Burry), ETFs de ARK y corredoras chilenas como Renta 4.

Respondes en español de Chile, con tono profesional y conciso, en un máximo de 3 párrafos.

Entregas información con fines informativos. Nunca das consejos de inversión personalizados. Si la pregunta roza la asesoría —qué comprar, vender o cuánto poner en un instrumento— declínalo con elegancia y recuerda que reclu.cl muestra datos públicos para que cada persona decida por su cuenta.`;

type ChatRole = "user" | "assistant";
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatQuotaProfile {
  plan: string;
  chat_quota_used: number;
  chat_reset_at: string;
  chat_quota_limit: number;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as { role?: unknown; content?: unknown };
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function asQuotaProfile(value: unknown): ChatQuotaProfile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const used = Number(row.chat_quota_used);
  const limit = Number(row.chat_quota_limit);
  if (typeof row.plan !== "string") return null;
  if (typeof row.chat_reset_at !== "string") return null;
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
  return {
    plan: row.plan,
    chat_quota_used: used,
    chat_reset_at: row.chat_reset_at,
    chat_quota_limit: limit,
  };
}

function latestUserContent(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].content;
  }
  return null;
}

/** Pulls `delta.content` out of one OpenRouter SSE line. Incomplete lines yield "". */
function deltaFromSseLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return "";
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";

  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object") return "";
    const choices = (parsed as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return "";
    const first: unknown = choices[0];
    if (!first || typeof first !== "object") return "";
    const delta = (first as { delta?: unknown }).delta;
    if (!delta || typeof delta !== "object") return "";
    const content = (delta as { content?: unknown }).content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

/**
 * Forwards the upstream SSE bytes and, when the stream closes, stores the
 * accumulated assistant text.
 */
function createAssistantCapture(
  onDone: (content: string) => Promise<void>,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let assistant = "";

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) assistant += deltaFromSseLine(line);
    },
    async flush() {
      buffer += decoder.decode();
      if (buffer) assistant += deltaFromSseLine(buffer);
      const content = assistant.trim();
      if (!content) return;
      try {
        await onDone(content);
      } catch (error) {
        console.warn("[reclu] assistant message insert failed:", error);
      }
    },
  });
}

async function insertChatMessage(
  supabase: ServerSupabase,
  userId: string,
  role: ChatRole,
  content: string,
): Promise<void> {
  const { error } = await supabase.from("chat_messages").insert({
    user_id: userId,
    role,
    content,
  });
  if (error) {
    console.warn(`[reclu] chat_messages insert (${role}):`, error.message);
  }
}

/**
 * Free: 5 questions per rolling day. Pro: `chat_quota_limit` (default 100) per rolling week.
 * The weekly stale check is `chat_reset_at < now - 7 days`. Free also resets after 24 hours
 * on the same columns. Pro responses never include the numeric remainder.
 */
async function enforceChatQuota(
  supabase: ServerSupabase,
  userId: string,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; headers: Record<string, string> }
> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan, chat_quota_used, chat_reset_at, chat_quota_limit")
    .eq("id", userId)
    .single();

  const profile = asQuotaProfile(data);
  if (error || !profile) {
    return {
      ok: false,
      response: Response.json(
        { error: "No pudimos verificar tu cupo del asistente." },
        { status: 500 },
      ),
    };
  }

  const isPro = profile.plan === "pro";
  const plan = isPro ? "pro" : "free";
  const now = Date.now();
  const resetAt = Date.parse(profile.chat_reset_at);
  const weeklyStale = Number.isNaN(resetAt) || resetAt < now - WEEK_MS;
  const dailyStale = !isPro && (Number.isNaN(resetAt) || resetAt < now - DAY_MS);
  const stale = weeklyStale || dailyStale;

  let used = profile.chat_quota_used;
  if (stale) {
    used = 0;
    const { error: resetError } = await supabase
      .from("profiles")
      .update({
        chat_quota_used: 0,
        chat_reset_at: new Date(now).toISOString(),
      })
      .eq("id", userId);
    if (resetError) {
      return {
        ok: false,
        response: Response.json(
          { error: "No pudimos renovar tu cupo del asistente." },
          { status: 500 },
        ),
      };
    }
  }

  const limit = isPro ? Math.max(0, profile.chat_quota_limit) : FREE_DAILY_LIMIT;

  if (used >= limit) {
    const message = isPro
      ? "Alcanzaste el límite semanal del asistente. Podrás usarlo de nuevo cuando se renueve tu cupo."
      : "Alcanzaste el límite de 5 preguntas por día. Pasa a Pro para continuar.";
    return {
      ok: false,
      response: Response.json(
        { error: message, upgrade: true, plan },
        { status: 429 },
      ),
    };
  }

  const nextUsed = used + 1;
  const { error: incrementError } = await supabase
    .from("profiles")
    .update({ chat_quota_used: nextUsed })
    .eq("id", userId);

  if (incrementError) {
    return {
      ok: false,
      response: Response.json(
        { error: "No pudimos actualizar tu cupo del asistente." },
        { status: 500 },
      ),
    };
  }

  const remaining = Math.max(0, limit - nextUsed);
  const headers: Record<string, string> = {
    "X-Chat-Plan": plan,
    "X-Chat-Remaining": isPro ? "limited" : String(remaining),
  };
  if (isPro) {
    headers["X-Chat-Quedan-Pocas"] = remaining <= PRO_LOW_REMAINING ? "true" : "false";
  }
  return { ok: true, headers };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Falta OPENROUTER_API_KEY. Configura esa variable en el servidor para usar el asistente.",
      },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json(
      { error: "messages es requerido y no puede venir vacío." },
      { status: 400 },
    );
  }

  if (!body.messages.every(isChatMessage)) {
    return Response.json(
      { error: "Cada mensaje debe tener role (user o assistant) y content de texto." },
      { status: 400 },
    );
  }

  const messages = body.messages;

  const streamHeaders: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Chat-Plan": "anonymous",
  };

  if (user) {
    const quota = await enforceChatQuota(supabase, user.id);
    if (!quota.ok) return quota.response;
    Object.assign(streamHeaders, quota.headers);

    const question = latestUserContent(messages);
    if (question) {
      await insertChatMessage(supabase, user.id, "user", question);
    }
  }

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
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 700,
        temperature: 0.3,
        stream: true,
      }),
    });
  } catch {
    return Response.json(
      { error: "No se pudo contactar a OpenRouter." },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "OpenRouter no devolvió una respuesta válida." },
      { status: 502 },
    );
  }

  const responseBody = user
    ? upstream.body.pipeThrough(
        createAssistantCapture((content) =>
          insertChatMessage(supabase, user.id, "assistant", content),
        ),
      )
    : upstream.body;

  return new Response(responseBody, { headers: streamHeaders });
}
