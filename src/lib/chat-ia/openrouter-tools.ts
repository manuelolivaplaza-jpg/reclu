/**
 * Llamadas a OpenRouter con herramientas (D52). Solo servidor.
 * Modelo: CHAT_IA_MODEL si existe; si no, OPENROUTER_MODEL (el que ya usa el
 * proyecto). Nunca hay modelo por defecto en el código.
 * Cada pedido lleva provider.data_collection = "deny".
 */
const URL_OR = "https://openrouter.ai/api/v1/chat/completions";

export type ChatIaEnvVar = "OPENROUTER_API_KEY" | "CHAT_IA_MODEL|OPENROUTER_MODEL";

export function chatIaConfig():
  | { enabled: true; apiKey: string; model: string }
  | { enabled: false; missing: ChatIaEnvVar[] } {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  const model = ((process.env.CHAT_IA_MODEL ?? "").trim() || (process.env.OPENROUTER_MODEL ?? "").trim());
  const missing: ChatIaEnvVar[] = [];
  if (!apiKey) missing.push("OPENROUTER_API_KEY");
  if (!model) missing.push("CHAT_IA_MODEL|OPENROUTER_MODEL");
  if (/longcat|nemotron/i.test(model)) missing.push("CHAT_IA_MODEL|OPENROUTER_MODEL");
  return missing.length ? { enabled: false, missing } : { enabled: true, apiKey, model };
}

export interface OrToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type OrMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OrToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export async function orComplete(
  cfg: { apiKey: string; model: string },
  messages: OrMessage[],
  tools: unknown[],
): Promise<{ ok: true; content: string; toolCalls: OrToolCall[] } | { ok: false; status: number }> {
  let res: Response;
  try {
    res = await fetch(URL_OR, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        tools,
        tool_choice: "auto",
        parallel_tool_calls: true,
        temperature: 0.2,
        max_tokens: 900,
        provider: { data_collection: "deny" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, status: 502 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: OrToolCall[] } }>;
  } | null;
  const msg = data?.choices?.[0]?.message;
  return {
    ok: true,
    content: typeof msg?.content === "string" ? msg.content : "",
    toolCalls: Array.isArray(msg?.tool_calls) ? msg.tool_calls.slice(0, 6) : [],
  };
}

export async function orStream(
  cfg: { apiKey: string; model: string },
  messages: OrMessage[],
): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const res = await fetch(URL_OR, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 900,
        provider: { data_collection: "deny" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    return res.ok && res.body ? res.body : null;
  } catch {
    return null;
  }
}

/** Convierte un texto completo en un stream SSE con forma OpenRouter (trozos). */
export function textAsSse(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const parts = text.match(/[\s\S]{1,24}/g) ?? [];
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
}
