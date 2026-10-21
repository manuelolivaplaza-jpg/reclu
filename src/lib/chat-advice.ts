/**
 * chat-advice.ts — filtro de recomendaciones para el chat en streaming (F69B).
 *
 * El chat reenvía SSE de OpenRouter. Este módulo envuelve ese stream y:
 *  - acumula el texto del modelo y lo revisa con `adviceRule`;
 *  - si aparece lenguaje de recomendación, deja de reenviar tokens y emite un
 *    evento `reclu` de reemplazo con `NEUTRAL_ADVICE_REPLACEMENT`;
 *  - al terminar una respuesta limpia, emite un evento `reclu` de descargo;
 *  - cierra siempre con `data: [DONE]`.
 *
 * Los tokens de contenido mantienen la forma de OpenRouter
 * (`choices[0].delta.content`) para no romper clientes existentes. Los eventos
 * `reclu` son aditivos: el cliente que no los entiende los ignora.
 *
 * Nunca se registra el texto del modelo ni del usuario: solo la marca de
 * tiempo, la ruta y la regla que saltó.
 */
import { adviceRule, AI_DISCLAIMER, NEUTRAL_ADVICE_REPLACEMENT } from "@/lib/advice-filter";

/** Evento SSE propio del filtro: `{ reclu: { type, text } }`. */
export type RecluStreamEventType = "disclaimer" | "replacement";

export interface ChatAdviceOptions {
  /** Ruta que se registra en el log de bloqueos (sin datos del usuario). */
  route: string;
  /** Texto final visible, sin el descargo. Se usa para persistir el mensaje. */
  onComplete?: (content: string) => Promise<void> | void;
  /** Caracteres que se retienen antes de reenviar (evita filtrar la frase). */
  holdBackChars?: number;
}

/** Cuánto texto se retiene para detectar una recomendación antes de emitirla. */
const DEFAULT_HOLD_BACK = 80;

/** Pulls `delta.content` out of one OpenRouter SSE line. Incomplete lines yield "". */
export function deltaFromSseLine(line: string): string {
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

function contentEvent(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function recluEvent(type: RecluStreamEventType, text: string): string {
  return `data: ${JSON.stringify({ reclu: { type, text } })}\n\n`;
}

const DONE_EVENT = "data: [DONE]\n\n";

/** Log acotado: timestamp, ruta y regla. Sin texto del usuario ni del modelo. */
function logBlocked(route: string, rule: string): void {
  console.warn(
    "[reclu] advice-filter blocked",
    JSON.stringify({ ts: new Date().toISOString(), route, rule }),
  );
}

/**
 * Envuelve el stream SSE de OpenRouter. No lanza por errores del upstream:
 * si algo falla, el consumidor recibe un stream cerrado.
 */
export function filterChatAdvice(
  upstream: ReadableStream<Uint8Array>,
  options: ChatAdviceOptions,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.getReader();
  const holdBack = Math.max(0, options.holdBackChars ?? DEFAULT_HOLD_BACK);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let sseBuffer = "";
      let seen = "";
      let pending = "";
      let blockedBy: string | null = null;

      const processLine = (line: string): void => {
        if (blockedBy) return;
        const delta = deltaFromSseLine(line);
        if (!delta) return;

        seen += delta;
        pending += delta;

        const rule = adviceRule(seen);
        if (rule) {
          blockedBy = rule;
          return;
        }

        if (pending.length > holdBack) {
          const safe = pending.slice(0, pending.length - holdBack);
          pending = pending.slice(-holdBack);
          controller.enqueue(encoder.encode(contentEvent(safe)));
        }
      };

      try {
        while (!blockedBy) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";
          for (const line of lines) {
            processLine(line);
            if (blockedBy) break;
          }
        }

        if (!blockedBy) {
          sseBuffer += decoder.decode();
          if (sseBuffer) processLine(sseBuffer);
        }

        let finalContent: string;
        if (blockedBy) {
          logBlocked(options.route, blockedBy);
          controller.enqueue(encoder.encode(recluEvent("replacement", NEUTRAL_ADVICE_REPLACEMENT)));
          finalContent = NEUTRAL_ADVICE_REPLACEMENT;
        } else {
          if (pending) controller.enqueue(encoder.encode(contentEvent(pending)));
          finalContent = seen.trim();
        }

        controller.enqueue(encoder.encode(recluEvent("disclaimer", AI_DISCLAIMER)));
        controller.enqueue(encoder.encode(DONE_EVENT));

        if (finalContent && options.onComplete) {
          try {
            await options.onComplete(finalContent);
          } catch (error) {
            console.warn("[reclu] chat persist failed:", error);
          }
        }
      } catch (error) {
        console.warn("[reclu] chat stream failed:", error);
      } finally {
        try {
          await reader.cancel();
        } catch {
          /* upstream ya cerrado */
        }
        controller.close();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}
