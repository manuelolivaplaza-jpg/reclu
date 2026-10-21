import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F71: "Pregunta a la IA" (paso B). Sin Supabase real ni OpenRouter real:
 * se mockean el cliente de sesión, el service role y la cuota; el fetch a
 * OpenRouter se intercepta para inspeccionar el body enviado al LLM.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  sessionFrom: vi.fn(),
  serviceFrom: vi.fn(),
  enforceSignedInQuota: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.sessionFrom,
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));

vi.mock("@/lib/chat-guard", () => ({
  enforceSignedInQuota: mocks.enforceSignedInQuota,
}));

import { POST } from "@/app/api/impact/route";
import { AI_DISCLAIMER, NEUTRAL_ADVICE_REPLACEMENT } from "@/lib/advice-filter";
import { PORTFOLIO_CONSENT_VERSION } from "@/lib/portfolio-consent";

const NEWS_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-secret-1";
const EMAIL = "ana@example.com";
const BROKER = "Fintual";

interface DbRow {
  data: unknown;
  error: null | { message: string };
}

const db: {
  settings: DbRow;
  holdings: DbRow;
  news: DbRow;
  tickers: DbRow;
  cache: DbRow;
  inserted: unknown[];
} = {
  settings: { data: null, error: null },
  holdings: { data: null, error: null },
  news: { data: null, error: null },
  tickers: { data: null, error: null },
  cache: { data: null, error: null },
  inserted: [],
};

function sessionTable(name: string) {
  if (name === "user_portfolio_settings") {
    return { select: () => ({ eq: () => ({ maybeSingle: async () => db.settings }) }) };
  }
  if (name === "user_holdings") {
    return { select: () => ({ eq: async () => db.holdings }) };
  }
  if (name === "user_impact_requests") {
    return {
      insert: async (row: unknown) => {
        db.inserted.push(row);
        return { error: null };
      },
    };
  }
  throw new Error(`tabla de sesión inesperada: ${name}`);
}

function serviceTable(name: string) {
  if (name === "news_items") {
    return { select: () => ({ eq: () => ({ maybeSingle: async () => db.news }) }) };
  }
  if (name === "news_tickers") {
    return { select: () => ({ eq: async () => db.tickers }) };
  }
  if (name === "ai_impact_cache") {
    return { select: () => ({ eq: async () => db.cache }) };
  }
  throw new Error(`tabla de servicio inesperada: ${name}`);
}

const fetchMock = vi.fn();

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/impact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function completionResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sentBody(): string {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return String(init?.body ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEWS_IMPACT_ENABLED = "true";
  process.env.MY_PORTFOLIO_ENABLED = "true";
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "test/model";

  db.settings = {
    data: { consent_at: "2026-10-01T00:00:00Z", consent_version: PORTFOLIO_CONSENT_VERSION },
    error: null,
  };
  db.holdings = {
    data: [
      {
        symbol: "NVDA",
        weight: 25,
        // Campos sensibles que NUNCA deben llegar al LLM.
        name: "Ana Pérez",
        quantity: 100,
        avg_cost: 123.45,
        broker: BROKER,
      },
    ],
    error: null,
  };
  db.news = {
    data: {
      id: NEWS_ID,
      source: "sec_8k",
      url: "https://www.sec.gov/Archives/nvda-8k",
      title: "NVDA presenta un 8-K por cambio de directivos",
      summary: "La compañía informó cambios en su plana directiva.",
      published_at: "2026-10-19T12:00:00Z",
    },
    error: null,
  };
  db.tickers = { data: [{ symbol: "NVDA", relation: "direct", confidence: 1 }], error: null };
  db.cache = {
    data: [
      {
        symbol: "NVDA",
        analysis: { resumen: "cambio de mando", direccion_posible: "incierta" },
        created_at: "2026-10-19T13:00:00Z",
      },
    ],
    error: null,
  };
  db.inserted = [];

  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } }, error: null });
  mocks.sessionFrom.mockImplementation(sessionTable);
  mocks.serviceFrom.mockImplementation(serviceTable);
  mocks.enforceSignedInQuota.mockResolvedValue({ ok: true, headers: { "X-Chat-Plan": "free" } });

  fetchMock.mockResolvedValue(completionResponse("La noticia describe un cambio de directivos."));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEWS_IMPACT_ENABLED;
  delete process.env.MY_PORTFOLIO_ENABLED;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

describe("POST /api/impact: acceso y consentimiento", () => {
  it("flag apagado => 404 aunque haya sesión", async () => {
    delete process.env.NEWS_IMPACT_ENABLED;

    const res = await post({ newsId: NEWS_ID });

    expect(res.status).toBe(404);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("con MY_PORTFOLIO_ENABLED apagado => 404 (F77 M4)", async () => {
    delete process.env.MY_PORTFOLIO_ENABLED;

    const res = await post({ newsId: NEWS_ID, question: "x" });

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.enforceSignedInQuota).not.toHaveBeenCalled();
  });

  it("sin sesión => 401", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await post({ newsId: NEWS_ID });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cuerpo inválido => 400 y no toca la base", async () => {
    const res = await post({ newsId: "no-es-uuid" });

    expect(res.status).toBe(400);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it("sin consentimiento => 403", async () => {
    db.settings = { data: null, error: null };

    const res = await post({ newsId: NEWS_ID });

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consentimiento de una versión vieja => 403", async () => {
    db.settings = {
      data: { consent_at: "2025-01-01T00:00:00Z", consent_version: "2025-01" },
      error: null,
    };

    const res = await post({ newsId: NEWS_ID });

    expect(res.status).toBe(403);
  });

  it("sin cupo => 429", async () => {
    mocks.enforceSignedInQuota.mockResolvedValue({
      ok: false,
      status: 429,
      body: { error: "Alcanzaste las 5 preguntas de hoy." },
    });

    const res = await post({ newsId: NEWS_ID, question: "¿Qué cambia?" });

    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin pregunta no descuenta cupo: el análisis cacheado se ve aunque el cupo esté agotado", async () => {
    mocks.enforceSignedInQuota.mockResolvedValue({
      ok: false,
      status: 429,
      body: { error: "Alcanzaste las 5 preguntas de hoy." },
    });

    const res = await post({ newsId: NEWS_ID });

    expect(res.status).toBe(200);
    expect(mocks.enforceSignedInQuota).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("noticia inexistente => 404", async () => {
    db.news = { data: null, error: null };

    const res = await post({ newsId: NEWS_ID });

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/impact: camino sin LLM", () => {
  it("sin pregunta responde con análisis cacheado, exposición y fuente", async () => {
    const res = await post({ newsId: NEWS_ID });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.enforceSignedInQuota).not.toHaveBeenCalled();

    expect(body.exposurePct).toBe(25);
    expect(body.answer).toBeNull();
    expect(body.disclaimer).toBe(AI_DISCLAIMER);

    const source = body.source as { url: string };
    expect(source.url).toBe("https://www.sec.gov/Archives/nvda-8k");

    const matches = body.matches as Array<{ symbol: string; analysis: unknown }>;
    expect(matches).toHaveLength(1);
    expect(matches[0].symbol).toBe("NVDA");
    expect(matches[0].analysis).toEqual({
      resumen: "cambio de mando",
      direccion_posible: "incierta",
    });
  });

  it("registra la consulta en user_impact_requests como web", async () => {
    await post({ newsId: NEWS_ID });

    expect(db.inserted).toEqual([
      { user_id: USER_ID, news_id: NEWS_ID, delivered_via: "web" },
    ]);
  });

  it("sin posiciones tocadas la exposición es 0", async () => {
    db.holdings = {
      data: [{ symbol: "AAPL", weight: 40, quantity: 10, avg_cost: 999, broker: BROKER }],
      error: null,
    };

    const res = await post({ newsId: NEWS_ID });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.exposurePct).toBe(0);
    expect(body.matches).toEqual([]);
  });
});

describe("POST /api/impact: camino con LLM", () => {
  it("con pregunta llama al LLM y devuelve respuesta saneada", async () => {
    const res = await post({ newsId: NEWS_ID, question: "¿Cómo afecta a mi cartera?" });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.enforceSignedInQuota).toHaveBeenCalledTimes(1);
    expect(mocks.enforceSignedInQuota).toHaveBeenCalledWith(USER_ID);
    expect(body.answer).toBe("La noticia describe un cambio de directivos.");
    expect(body.disclaimer).toBe(AI_DISCLAIMER);
  });

  it("el body enviado al LLM no lleva datos sensibles del usuario", async () => {
    await post({ newsId: NEWS_ID, question: "¿Cómo afecta a mi cartera?" });

    const body = sentBody();
    // Sí viaja lo permitido: título, ticker y peso en %.
    expect(body).toContain("NVDA");
    expect(body).toContain("25.0%");
    expect(body).toContain("8-K");
    // Nunca viaja lo sensible.
    expect(body).not.toContain(EMAIL);
    expect(body).not.toContain(USER_ID);
    expect(body).not.toContain("Ana Pérez");
    expect(body).not.toContain(BROKER);
    expect(body).not.toContain("123.45");
    expect(body).not.toContain('"quantity"');
    expect(body).not.toContain('"avg_cost"');
    expect(body).not.toContain('"broker"');
  });

  it("si el modelo recomienda, la respuesta se reemplaza por el texto neutro", async () => {
    fetchMock.mockResolvedValue(
      completionResponse("Deberías comprar más NVDA ahora mismo."),
    );

    const res = await post({ newsId: NEWS_ID, question: "¿Qué hago?" });
    const body = (await res.json()) as { answer: string };

    expect(body.answer).toContain(NEUTRAL_ADVICE_REPLACEMENT);
    expect(body.answer).toContain(AI_DISCLAIMER);
    expect(body.answer).not.toContain("Deberías comprar");
  });

  it("con pregunta y sin modelo configurado => 503 sin gastar cupo", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const res = await post({ newsId: NEWS_ID, question: "¿Qué hago?" });

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.enforceSignedInQuota).not.toHaveBeenCalled();
  });

  it("sin pregunta y sin modelo configurado igual funciona", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const res = await post({ newsId: NEWS_ID });

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
