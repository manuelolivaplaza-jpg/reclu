import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_DISCLAIMER, NEUTRAL_ADVICE_REPLACEMENT } from "@/lib/advice-filter";
import { filterChatAdvice } from "@/lib/chat-advice";

/**
 * F69B: el chat no puede emitir recomendaciones. El upstream de OpenRouter
 * está mockeado (nunca hay red) y se verifica el SSE que sale del filtro.
 */
const encoder = new TextEncoder();

function upstream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function openRouterChunks(text: string, size = 7): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    const part = text.slice(i, i + size);
    chunks.push(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
  }
  chunks.push("data: [DONE]\n\n");
  return chunks;
}

interface ParsedEvent {
  delta?: string;
  reclu?: { type: string; text: string };
  done?: boolean;
}

async function run(
  text: string,
  options: { holdBackChars?: number; onComplete?: (content: string) => void } = {},
): Promise<{ raw: string; events: ParsedEvent[]; streamed: string }> {
  const stream = filterChatAdvice(upstream(openRouterChunks(text)), {
    route: "/api/chat",
    holdBackChars: options.holdBackChars,
    onComplete: options.onComplete,
  });
  const raw = await new Response(stream).text();
  const events: ParsedEvent[] = [];
  for (const block of raw.split("\n\n")) {
    const line = block.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") {
      events.push({ done: true });
      continue;
    }
    const parsed = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[];
      reclu?: { type: string; text: string };
    };
    if (parsed.reclu) events.push({ reclu: parsed.reclu });
    const delta = parsed.choices?.[0]?.delta?.content;
    if (typeof delta === "string") events.push({ delta });
  }
  const streamed = events
    .filter((event) => event.delta !== undefined)
    .map((event) => event.delta)
    .join("");
  return { raw, events, streamed };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("filterChatAdvice: respuesta limpia", () => {
  it("deja pasar todo el texto y emite el descargo al final", async () => {
    const texto =
      "Pelosi declaró un cambio de ponderación en NVDA durante el trimestre. La posición sigue siendo la mayor del portafolio.";
    const onComplete = vi.fn();
    const { events, streamed } = await run(texto, { onComplete });

    expect(streamed).toBe(texto);
    expect(events.filter((event) => event.reclu?.type === "disclaimer")).toHaveLength(1);
    expect(events.find((event) => event.reclu?.type === "disclaimer")?.reclu?.text).toBe(
      AI_DISCLAIMER,
    );
    expect(events.at(-1)?.done).toBe(true);
    expect(events.some((event) => event.reclu?.type === "replacement")).toBe(false);
    expect(onComplete).toHaveBeenCalledWith(texto);
  });

  it("mantiene el formato delta que ya lee el cliente", async () => {
    const { events } = await run("Hola, esta es una respuesta informativa.");
    const deltas = events.filter((event) => event.delta !== undefined);

    expect(deltas.length).toBeGreaterThan(0);
    for (const event of deltas) expect(typeof event.delta).toBe("string");
  });
});

describe("filterChatAdvice: recomendación", () => {
  it("corta y reemplaza 'te recomiendo comprar'", async () => {
    const onComplete = vi.fn();
    const { events, streamed } = await run(
      "Te recomiendo comprar NVDA ahora mismo porque va a subir.",
      { onComplete },
    );

    expect(streamed).not.toContain("te recomiendo comprar");
    expect(streamed).not.toContain("va a subir");
    expect(events.find((event) => event.reclu?.type === "replacement")?.reclu?.text).toBe(
      NEUTRAL_ADVICE_REPLACEMENT,
    );
    expect(events.find((event) => event.reclu?.type === "disclaimer")?.reclu?.text).toBe(
      AI_DISCLAIMER,
    );
    expect(events.at(-1)?.done).toBe(true);
    expect(onComplete).toHaveBeenCalledWith(NEUTRAL_ADVICE_REPLACEMENT);
  });

  it("no reenvía la recomendación aunque venga después de un preámbulo largo", async () => {
    const preambulo =
      "La declaración pública muestra varias posiciones y sus ponderaciones, con el atraso propio de la fuente. ";
    const { events, streamed } = await run(
      `${preambulo.repeat(3)}Deberías comprar este ETF antes del cierre.`,
      { holdBackChars: 40 },
    );

    expect(streamed).not.toContain("deberias comprar");
    expect(streamed).not.toContain("Deberías comprar");
    expect(events.some((event) => event.reclu?.type === "replacement")).toBe(true);
  });

  it("registra ruta y regla sin el texto del usuario", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await run("Mi pregunta privada: te recomiendo comprar NVDA.");

    const salida = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(salida).toContain("/api/chat");
    expect(salida).toContain("advice-filter blocked");
    expect(salida).toContain("rule");
    expect(salida).not.toContain("Mi pregunta privada");
    expect(salida).not.toContain("NVDA");
  });
});
