/**
 * POST /api/chat — conversational assistant for reclu.cl.
 * Body: { messages: { role: "user" | "assistant", content: string }[] }
 * Streams the model reply as Server-Sent Events (OpenRouter chat completions).
 *
 * Signed-in users hit `check_chat_quota` before OpenRouter.
 * Anonymous callers hit `check_anon_chat_quota` (memory fallback, 2/day).
 */

import { createClient } from "@/lib/supabase/server";
import { enforceAnonQuota, enforceSignedInQuota, portfolioSystemContext } from "@/lib/chat-guard";
import { chatRequestSchema, firstZodMessage } from "@/lib/validation";
import { llmConfig, llmUnavailableResponse, streamChat } from "@/lib/llm";

const SYSTEM_PROMPT = `Eres el asistente de reclu.cl, experto en inversiones y en los portafolios de la plataforma: políticos del Congreso de EE.UU., hedge funds 13F (como Warren Buffett y Michael Burry), ETFs de ARK y corredoras chilenas como Renta 4.

Respondes en español de Chile, con tono profesional y conciso, en un máximo de 3 párrafos.

Entregas información con fines informativos. Nunca das consejos de inversión personalizados. Si la pregunta roza la asesoría —qué comprar, vender o cuánto poner en un instrumento— declínalo con elegancia y recuerda que reclu.cl muestra datos públicos para que cada persona decida por su cuenta.`;

type ChatRole = "user" | "assistant";
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

interface ChatMessage {
  role: ChatRole;
  content: string;
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

export async function POST(request: Request) {
  const config = llmConfig();
  if (!config.enabled) {
    return llmUnavailableResponse(config.missing);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: firstZodMessage(parsed.error) }, { status: 400 });
  }

  const { messages, slug } = parsed.data;
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

  const streamHeaders: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    ...quota.headers,
  };

  if (user) {
    const question = latestUserContent(messages);
    if (question) await insertChatMessage(supabase, user.id, "user", question);
  }

  let system = SYSTEM_PROMPT;
  if (slug) {
    try {
      const context = await portfolioSystemContext(supabase, slug);
      if (context) system = `${SYSTEM_PROMPT}\n\n${context}`;
    } catch (error) {
      console.warn("[reclu] contexto de portafolio:", error);
    }
  }

  const result = await streamChat({
    messages: [{ role: "system", content: system }, ...messages],
    maxTokens: 700,
    temperature: 0.3,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const responseBody = user
    ? result.stream.pipeThrough(
        createAssistantCapture((content) =>
          insertChatMessage(supabase, user.id, "assistant", content),
        ),
      )
    : result.stream;

  return new Response(responseBody, { headers: streamHeaders });
}
