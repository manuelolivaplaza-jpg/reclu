/**
 * llm.ts — cliente compartido de OpenRouter (F69).
 *
 * Lo usan `/api/chat` (streaming SSE) y `/api/explain-alert` (respuesta
 * completa). Sin `OPENROUTER_API_KEY` **y** `OPENROUTER_MODEL` la IA queda
 * deshabilitada: no hay modelo por defecto y las rutas responden 503 con un
 * mensaje en español. Nunca se registran prompts ni claves en los logs.
 *
 * Solo servidor: las rutas leen variables de entorno sin `NEXT_PUBLIC_`.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const COMPLETE_TIMEOUT_MS = 25_000;
const STREAM_TIMEOUT_MS = 60_000;

export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmChatOptions {
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Si se pasa, se combina con el timeout interno. */
  signal?: AbortSignal;
  /** Solo para pruebas o procesos puntuales. */
  timeoutMs?: number;
}

export type LlmConfig =
  | { enabled: true; apiKey: string; model: string }
  | { enabled: false; missing: LlmEnvVar[] };

export type LlmEnvVar = "OPENROUTER_API_KEY" | "OPENROUTER_MODEL";

export type LlmCompletion =
  | { ok: true; content: string }
  | { ok: false; status: number; error: string };

export type LlmStream =
  | { ok: true; stream: ReadableStream<Uint8Array> }
  | { ok: false; status: number; error: string };

/**
 * Lee la configuración en cada llamada (no al importar el módulo) para que
 * las pruebas y los cambios de entorno en caliente funcionen.
 *
 * Regla F69: sin las dos variables no hay IA. No se fija ningún modelo.
 */
export function llmConfig(): LlmConfig {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  const model = (process.env.OPENROUTER_MODEL ?? "").trim();

  const missing: LlmEnvVar[] = [];
  if (!apiKey) missing.push("OPENROUTER_API_KEY");
  if (!model) missing.push("OPENROUTER_MODEL");

  if (missing.length > 0) return { enabled: false, missing };
  return { enabled: true, apiKey, model };
}

/** Mensaje 503 compartido, en español y sin exponer valores del entorno. */
export function llmUnavailableMessage(missing: readonly LlmEnvVar[]): string {
  return `La IA no está disponible en este entorno: falta configurar ${missing.join(" y ")}.`;
}

/** Respuesta 503 lista para las rutas. */
export function llmUnavailableResponse(missing: readonly LlmEnvVar[]): Response {
  return Response.json({ error: llmUnavailableMessage(missing) }, { status: 503 });
}

/**
 * Timeout interno + señal opcional del llamador. `AbortSignal.any` existe en
 * Node 20+; si no está, el timeout propio sigue protegiendo la llamada.
 */
function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
  return signal;
}

function completionContent(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first: unknown = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function buildPayload(
  model: string,
  options: LlmChatOptions,
  stream: boolean,
): Record<string, unknown> {
  return {
    model,
    messages: options.messages,
    ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    stream,
  };
}

async function openRouterFetch(
  config: Extract<LlmConfig, { enabled: true }>,
  options: LlmChatOptions,
  stream: boolean,
): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(config.model, options, stream)),
    signal: requestSignal(options.signal, options.timeoutMs ?? (stream ? STREAM_TIMEOUT_MS : COMPLETE_TIMEOUT_MS)),
  });
}

/**
 * Una respuesta completa (no streaming). Devuelve el texto crudo del modelo;
 * cada ruta decide cómo normalizarlo.
 */
export async function completeChat(options: LlmChatOptions): Promise<LlmCompletion> {
  const config = llmConfig();
  if (!config.enabled) {
    return {
      ok: false,
      status: 503,
      error: llmUnavailableMessage(config.missing),
    };
  }

  let upstream: Response;
  try {
    upstream = await openRouterFetch(config, options, false);
  } catch {
    return { ok: false, status: 502, error: "No se pudo contactar a OpenRouter." };
  }

  if (!upstream.ok) {
    console.warn("[reclu] llm OpenRouter:", upstream.status);
    return {
      ok: false,
      status: 502,
      error: "OpenRouter no devolvió una respuesta válida.",
    };
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return {
      ok: false,
      status: 502,
      error: "OpenRouter no devolvió una respuesta válida.",
    };
  }

  return { ok: true, content: completionContent(data) };
}

/**
 * Respuesta en streaming SSE. Devuelve el cuerpo de OpenRouter tal cual para
 * que la ruta lo reenvíe (y pueda envolverlo para guardar el mensaje).
 */
export async function streamChat(options: LlmChatOptions): Promise<LlmStream> {
  const config = llmConfig();
  if (!config.enabled) {
    return {
      ok: false,
      status: 503,
      error: llmUnavailableMessage(config.missing),
    };
  }

  let upstream: Response;
  try {
    upstream = await openRouterFetch(config, options, true);
  } catch {
    return { ok: false, status: 502, error: "No se pudo contactar a OpenRouter." };
  }

  if (!upstream.ok || !upstream.body) {
    console.warn("[reclu] llm OpenRouter:", upstream.status);
    return {
      ok: false,
      status: 502,
      error: "OpenRouter no devolvió una respuesta válida.",
    };
  }

  return { ok: true, stream: upstream.body };
}
