import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F69: cliente LLM compartido. Sin `OPENROUTER_API_KEY` **y**
 * `OPENROUTER_MODEL` no hay IA (503, sin modelo por defecto). El fetch a
 * OpenRouter está mockeado: nunca se llama a la red real.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(),
    rpc: vi.fn(),
  })),
}));

vi.mock("@/lib/chat-guard", () => ({
  enforceAnonQuota: vi.fn(async () => ({ ok: true, headers: {} })),
  enforceSignedInQuota: vi.fn(async () => ({ ok: true, headers: {} })),
  portfolioSystemContext: vi.fn(async () => null),
}));

import { POST as chatPOST } from "@/app/api/chat/route";
import { POST as explainPOST } from "@/app/api/explain-alert/route";
import { completeChat, llmConfig, streamChat } from "@/lib/llm";

const MODEL = "anthropic/claude-test";
const ALERT_ID = "11111111-1111-4111-8111-111111111111";

const fetchMock = vi.fn();

function chatRequest(): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "¿Qué pasó con NVDA?" }] }),
  });
}

function explainRequest(): Request {
  return new Request("http://localhost/api/explain-alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alertId: ALERT_ID }),
  });
}

function sentBody(call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: "Respuesta de prueba." } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

describe("llmConfig", () => {
  it("sin key queda deshabilitada y reporta la variable faltante", () => {
    process.env.OPENROUTER_MODEL = MODEL;
    const config = llmConfig();
    expect(config.enabled).toBe(false);
    if (!config.enabled) expect(config.missing).toEqual(["OPENROUTER_API_KEY"]);
  });

  it("sin modelo queda deshabilitada aunque haya key", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const config = llmConfig();
    expect(config.enabled).toBe(false);
    if (!config.enabled) expect(config.missing).toEqual(["OPENROUTER_MODEL"]);
  });

  it("con las dos variables usa el modelo configurado (sin default)", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = MODEL;
    const config = llmConfig();
    expect(config).toEqual({ enabled: true, apiKey: "test-key", model: MODEL });
  });
});

describe("completeChat", () => {
  it("sin configuración responde 503 y no llama a fetch", async () => {
    const result = await completeChat({ messages: [{ role: "user", content: "hola" }] });

    expect(result).toMatchObject({ ok: false, status: 503 });
    if (!result.ok) expect(result.error).toContain("OPENROUTER_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("usa el modelo de OPENROUTER_MODEL y devuelve el contenido", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = MODEL;

    const result = await completeChat({
      messages: [{ role: "user", content: "describe la alerta" }],
      maxTokens: 123,
      temperature: 0.1,
    });

    expect(result).toEqual({ ok: true, content: "Respuesta de prueba." });
    const body = sentBody();
    expect(body.model).toBe(MODEL);
    expect(body.model).not.toBe("google/gemini-2.0-flash-001");
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(123);
    expect(body.temperature).toBe(0.1);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("traduce un error HTTP de OpenRouter a 502", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = MODEL;
    fetchMock.mockResolvedValue(new Response("nope", { status: 429 }));

    const result = await completeChat({ messages: [{ role: "user", content: "hola" }] });

    expect(result).toMatchObject({ ok: false, status: 502 });
  });

  it("traduce una caída de red a 502", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = MODEL;
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await completeChat({ messages: [{ role: "user", content: "hola" }] });

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      error: "No se pudo contactar a OpenRouter.",
    });
  });
});

describe("streamChat", () => {
  it("pide stream=true y entrega el cuerpo", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = MODEL;
    fetchMock.mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"hola"}}]}\n\n', { status: 200 }),
    );

    const result = await streamChat({ messages: [{ role: "user", content: "hola" }] });

    expect(result.ok).toBe(true);
    expect(sentBody().stream).toBe(true);
    expect(sentBody().model).toBe(MODEL);
  });

  it("sin configuración responde 503", async () => {
    const result = await streamChat({ messages: [{ role: "user", content: "hola" }] });

    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rutas: la IA se apaga sin key o sin modelo", () => {
  it("POST /api/chat responde 503 sin key y no llama a OpenRouter", async () => {
    process.env.OPENROUTER_MODEL = MODEL;

    const res = await chatPOST(chatRequest());

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("OPENROUTER_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST /api/chat responde 503 sin modelo", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    const res = await chatPOST(chatRequest());

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("OPENROUTER_MODEL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST /api/chat usa el modelo de la variable", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = MODEL;
    fetchMock.mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"hola"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const res = await chatPOST(chatRequest());

    expect(res.status).toBe(200);
    expect(sentBody().model).toBe(MODEL);
    expect(sentBody().stream).toBe(true);
  });

  it("POST /api/explain-alert responde 503 sin modelo (antes de la base)", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";

    const res = await explainPOST(explainRequest());

    expect(res.status).toBe(503);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
