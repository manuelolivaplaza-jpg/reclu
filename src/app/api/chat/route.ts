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
import { filterChatAdvice } from "@/lib/chat-advice";
import { chatRequestSchema, firstZodMessage } from "@/lib/validation";
import { llmConfig, llmUnavailableResponse, streamChat } from "@/lib/llm";

const SYSTEM_PROMPT = `Eres el asistente de reclu.cl: explicas datos públicos sobre portafolios de políticos del Congreso de EE.UU., hedge funds 13F (como Warren Buffett y Michael Burry), ETFs de ARK y corredoras chilenas como Renta 4.

No eres experto en inversiones ni entregas asesoría. Describes información pública y sus fuentes para que cada persona decida por su cuenta: no das recomendaciones de compra, venta ni mantención, ni sugieres cuánto invertir en un instrumento.

Respondes en español de Chile, con tono profesional y conciso, en un máximo de 3 párrafos.

Si la pregunta pide una recomendación —qué comprar, vender, mantener o cuánto poner en un instrumento— declínalo con elegancia y recuerda que reclu.cl muestra datos públicos para que cada persona decida por su cuenta.`;

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

/**
 * Persists the assistant reply once the filtered stream finishes. The stored
 * text never includes the disclaimer: the UI renders it under every answer.
 */
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

  // F69B: el texto del modelo pasa por el filtro de recomendaciones antes de
  // salir por SSE. Si aparece una recomendación se corta y se reemplaza; en
  // toda respuesta se emite el descargo como evento aparte.
  const responseBody = filterChatAdvice(result.stream, {
    route: "/api/chat",
    onComplete: user
      ? (content) => insertChatMessage(supabase, user.id, "assistant", content)
      : undefined,
  });

  return new Response(responseBody, { headers: streamHeaders });
}
