import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F70: job de análisis genérico cacheado (paso A).
 *
 * Supabase y `fetch` están mockeados: nunca se toca la base real ni
 * OpenRouter. Se verifica autenticación, bandera apagada, caché por par y que
 * las respuestas rechazadas (JSON inválido o con recomendaciones) NO se
 * guarden.
 */
const state = vi.hoisted(() => ({
  news: [] as unknown[],
  profiles: [] as unknown[],
  cache: [] as unknown[],
  upserts: [] as { table: string; row: Record<string, unknown> }[],
  upsertError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/admin", () => {
  interface QueryResult {
    data: unknown;
    error: { message: string } | null;
  }

  interface Builder extends PromiseLike<QueryResult> {
    select: (...args: unknown[]) => Builder;
    eq: (...args: unknown[]) => Builder;
    gte: (...args: unknown[]) => Builder;
    order: (...args: unknown[]) => Builder;
    limit: (...args: unknown[]) => Builder;
    in: (...args: unknown[]) => Builder;
    upsert: (row: Record<string, unknown>, options?: unknown) => Promise<QueryResult>;
  }

  const makeBuilder = (table: string): Builder => {
    const builder = {} as Builder;
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.gte = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.in = () => builder;
    builder.upsert = (row, options) => {
      state.upserts.push({ table, row });
      void options;
      return Promise.resolve({ data: null, error: state.upsertError });
    };
    builder.then = (resolve, reject) => {
      const result: QueryResult =
        table === "news_items"
          ? { data: state.news, error: null }
          : table === "ticker_profile"
            ? { data: state.profiles, error: null }
            : table === "ai_impact_cache"
              ? { data: state.cache, error: null }
              : { data: null, error: null };
      return Promise.resolve(result).then(resolve, reject);
    };
    return builder;
  };

  return {
    createAdminClient: vi.fn(() => ({
      from: (table: string) => makeBuilder(table),
    })),
  };
});

import { POST } from "@/app/api/impact/precompute/route";

const NEWS_ID = "11111111-1111-4111-8111-111111111111";

const VALID_ANALYSIS = {
  resumen: "La empresa informó resultados trimestrales.",
  canal_de_impacto: "Resultados y márgenes del negocio.",
  direccion_posible: "incierta",
  horizonte: "corto",
  incertidumbre: "media",
  que_mirar: "El detalle de márgenes y la guía de la compañía.",
};

const fetchMock = vi.fn();

function request(secret = "cron-secret"): Request {
  return new Request("http://localhost/api/impact/precompute", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
}

function modelReply(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  process.env.NEWS_IMPACT_ENABLED = "true";
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "test/model";
  delete process.env.IMPACT_MAX_CALLS;

  state.news = [
    {
      id: NEWS_ID,
      title: "NVDA reporta resultados trimestrales",
      summary: "La compañía publicó sus cifras del trimestre.",
      news_tickers: [
        { symbol: "NVDA", relation: "direct" },
        { symbol: "AMD", relation: "sector" },
      ],
    },
  ];
  state.profiles = [
    {
      symbol: "NVDA",
      sector: "Semiconductores",
      industry: "Procesadores",
      country: "US",
      peers: ["AMD"],
      suppliers: [],
      macro_factors: ["tasas"],
    },
  ];
  state.cache = [];
  state.upserts = [];
  state.upsertError = null;

  fetchMock.mockResolvedValue(modelReply(JSON.stringify(VALID_ANALYSIS)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CRON_SECRET;
  delete process.env.NEWS_IMPACT_ENABLED;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.IMPACT_MAX_CALLS;
});

describe("POST /api/impact/precompute", () => {
  it("secreto incorrecto => 401 y no llama al modelo", async () => {
    const res = await POST(request("otro-secreto"));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("bandera apagada => 404 y no llama al modelo", async () => {
    process.env.NEWS_IMPACT_ENABLED = "false";

    const res = await POST(request());

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("sin modelo configurado => 503 sin consultar ni llamar", async () => {
    delete process.env.OPENROUTER_MODEL;

    const res = await POST(request());

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("respuesta válida => se cachea con prompt_version v1", async () => {
    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.analyzed).toBe(1);
    expect(json.rejected).toBe(0);
    expect(json.cached).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].table).toBe("ai_impact_cache");
    expect(state.upserts[0].row).toMatchObject({
      news_id: NEWS_ID,
      symbol: "NVDA",
      model: "test/model",
      prompt_version: "v1",
      analysis: VALID_ANALYSIS,
    });
  });

  it("par ya cacheado => no se vuelve a llamar al modelo", async () => {
    state.cache = [{ news_id: NEWS_ID, symbol: "NVDA" }];

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.cached).toBe(1);
    expect(json.analyzed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("respuesta con recomendación ('compra') => no se cachea", async () => {
    fetchMock.mockResolvedValue(
      modelReply(
        JSON.stringify({
          ...VALID_ANALYSIS,
          resumen: "Recomiendo comprar NVDA antes de los resultados.",
        }),
      ),
    );

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.rejected).toBe(1);
    expect(json.analyzed).toBe(0);
    expect(state.upserts).toHaveLength(0);
  });

  it("JSON inválido => no se cachea", async () => {
    fetchMock.mockResolvedValue(modelReply("esto no es JSON"));

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.rejected).toBe(1);
    expect(json.analyzed).toBe(0);
    expect(state.upserts).toHaveLength(0);
  });
});
