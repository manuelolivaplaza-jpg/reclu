import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F73: alertas automáticas de la cartera (opt-in).
 *
 * Supabase y `fetch` están mockeados: nunca se toca la base real ni se envía
 * un correo/Telegram. Se verifica el opt-in, el plan, el consentimiento, el
 * resumen diario de Pro, el tope diario de Elite y los duplicados.
 */
const state = vi.hoisted(() => ({
  settings: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
  holdings: [] as Record<string, unknown>[],
  tickers: [] as Record<string, unknown>[],
  news: [] as Record<string, unknown>[],
  sent: [] as Record<string, unknown>[],
  today: [] as Record<string, unknown>[],
  upserts: [] as { table: string; rows: Record<string, unknown>[] }[],
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
    upsert: (rows: Record<string, unknown>[], options?: unknown) => Promise<QueryResult>;
  }

  const tableData = (table: string, hasGte: boolean): unknown => {
    switch (table) {
      case "user_portfolio_settings":
        return state.settings;
      case "profiles":
        return state.profiles;
      case "user_holdings":
        return state.holdings;
      case "ticker_profile":
        return state.tickers;
      case "news_items":
        return state.news;
      case "user_portfolio_alerts":
        return hasGte ? state.today : state.sent;
      default:
        return null;
    }
  };

  const makeBuilder = (table: string): Builder => {
    const builder = {} as Builder;
    let hasGte = false;
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.gte = () => {
      hasGte = true;
      return builder;
    };
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.in = () => builder;
    builder.upsert = (rows, options) => {
      state.upserts.push({ table, rows });
      void options;
      return Promise.resolve({ data: null, error: state.upsertError });
    };
    builder.then = (resolve, reject) => {
      const result: QueryResult = { data: tableData(table, hasGte), error: null };
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

import { POST } from "@/app/api/impact/alerts/route";

const PRO_ID = "11111111-1111-4111-8111-111111111111";
const ELITE_ID = "22222222-2222-4222-8222-222222222222";
const FREE_ID = "33333333-3333-4333-8333-333333333333";
const NEWS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const fetchMock = vi.fn();

function request(secret = "cron-secret"): Request {
  return new Request("http://localhost/api/impact/alerts", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function news(index: number, symbol = "NVDA"): Record<string, unknown> {
  const id =
    index === 0
      ? NEWS_ID
      : `${String(index).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
  return {
    id,
    source: "sec_8k",
    url: `https://www.sec.gov/archives/edgar/${index}`,
    title: index === 0 ? "NVDA reporta resultados trimestrales" : `NVDA anuncia hecho ${index}`,
    published_at: "2026-10-20T12:00:00.000Z",
    news_tickers: [{ symbol, relation: "direct", confidence: 1 }],
  };
}

function userProfile(
  id: string,
  plan: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    email: `${plan}@example.com`,
    plan,
    trial_ends_at: null,
    email_unsubscribed: false,
    telegram_chat_id: null,
    unsubscribe_token: "token-123",
    ...overrides,
  };
}

function settingsFor(
  userId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    user_id: userId,
    auto_alerts: true,
    min_relevance: 0.3,
    alert_channel: "email",
    consent_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function holding(userId: string): Record<string, unknown> {
  return { user_id: userId, symbol: "NVDA", weight: 50 };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  process.env.NEWS_IMPACT_ENABLED = "true";
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "reclu <alertas@reclu.test>";
  process.env.NEXT_PUBLIC_SITE_URL = "https://reclu.test";
  delete process.env.TELEGRAM_BOT_TOKEN;

  state.settings = [];
  state.profiles = [];
  state.holdings = [];
  state.tickers = [
    {
      symbol: "NVDA",
      sector: "Semiconductores",
      industry: "Procesadores",
      peers: [],
      suppliers: [],
      macro_factors: [],
    },
  ];
  state.news = [news(0)];
  state.sent = [];
  state.today = [];
  state.upserts = [];
  state.upsertError = null;

  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CRON_SECRET;
  delete process.env.NEWS_IMPACT_ENABLED;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("POST /api/impact/alerts", () => {
  it("secreto incorrecto => 401 y no envía", async () => {
    state.settings = [settingsFor(PRO_ID)];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];

    const res = await POST(request("otro-secreto"));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("bandera apagada => 404 y no envía", async () => {
    process.env.NEWS_IMPACT_ENABLED = "false";
    state.settings = [settingsFor(PRO_ID)];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];

    const res = await POST(request());

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("usuario Gratis no recibe alertas", async () => {
    state.settings = [settingsFor(FREE_ID)];
    state.profiles = [userProfile(FREE_ID, "free")];
    state.holdings = [holding(FREE_ID)];

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.delivered).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("Pro recibe un solo resumen diario con todas las noticias", async () => {
    state.settings = [settingsFor(PRO_ID)];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];
    state.news = [news(0), news(1)];

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.delivered).toBe(2);
    expect(json.emails).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(init.body)) as {
      to: string;
      subject: string;
      html: string;
    };
    expect(payload.to).toBe("pro@example.com");
    expect(payload.subject).toContain("Noticias que tocan tu cartera");
    expect(payload.html).toContain("NVDA reporta resultados trimestrales");
    expect(payload.html).toContain("NVDA anuncia hecho 1");
    expect(payload.html).toContain("50% de tu cartera");
    expect(payload.html).toContain("https://www.sec.gov/archives/edgar/0");
    expect(payload.html).toContain("Información, no recomendación");

    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].table).toBe("user_portfolio_alerts");
    expect(state.upserts[0].rows).toHaveLength(2);
    expect(state.upserts[0].rows[0]).toMatchObject({
      user_id: PRO_ID,
      news_id: NEWS_ID,
      symbol: "NVDA",
      channel: "email",
    });
  });

  it("Pro no repite un resumen si ya recibió uno hoy", async () => {
    state.settings = [settingsFor(PRO_ID)];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];
    state.today = [{ user_id: PRO_ID, sent_at: new Date().toISOString() }];

    const res = await POST(request());
    const json = await body(res);

    expect(json.delivered).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("Elite respeta el tope de 20 alertas por día", async () => {
    state.settings = [settingsFor(ELITE_ID)];
    state.profiles = [userProfile(ELITE_ID, "elite")];
    state.holdings = [holding(ELITE_ID)];
    state.news = Array.from({ length: 25 }, (_, index) => news(index));

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.delivered).toBe(20);
    expect(json.emails).toBe(20);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].rows).toHaveLength(20);
  });

  it("Elite descuenta lo ya enviado hoy del tope", async () => {
    state.settings = [settingsFor(ELITE_ID)];
    state.profiles = [userProfile(ELITE_ID, "elite")];
    state.holdings = [holding(ELITE_ID)];
    state.news = Array.from({ length: 5 }, (_, index) => news(index));
    state.today = Array.from({ length: 18 }, () => ({
      user_id: ELITE_ID,
      sent_at: new Date().toISOString(),
    }));

    const res = await POST(request());
    const json = await body(res);

    expect(json.delivered).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(state.upserts[0].rows).toHaveLength(2);
  });

  it("sin consentimiento vigente no recibe nada", async () => {
    state.settings = [settingsFor(PRO_ID, { consent_at: null })];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];

    const res = await POST(request());
    const json = await body(res);

    expect(json.delivered).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("con auto_alerts=false no recibe nada", async () => {
    state.settings = [settingsFor(PRO_ID, { auto_alerts: false })];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];

    const res = await POST(request());
    const json = await body(res);

    expect(json.delivered).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });

  it("no reenvía una noticia ya registrada para el mismo usuario y ticker", async () => {
    state.settings = [settingsFor(PRO_ID)];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];
    state.news = [news(0), news(1)];
    state.sent = [{ user_id: PRO_ID, news_id: NEWS_ID, symbol: "NVDA" }];

    const res = await POST(request());
    const json = await body(res);

    expect(json.delivered).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.upserts[0].rows).toHaveLength(1);
    expect(state.upserts[0].rows[0].news_id).not.toBe(NEWS_ID);
  });

  it("si Resend falla no registra la alerta como enviada", async () => {
    state.settings = [settingsFor(PRO_ID)];
    state.profiles = [userProfile(PRO_ID, "pro")];
    state.holdings = [holding(PRO_ID)];
    fetchMock.mockResolvedValue(new Response("error", { status: 500 }));

    const res = await POST(request());
    const json = await body(res);

    expect(json.delivered).toBe(0);
    expect(state.upserts).toHaveLength(0);
  });

  it("Pro recibe el resumen por Telegram si eligió ese canal", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "tg-token";
    state.settings = [settingsFor(PRO_ID, { alert_channel: "telegram" })];
    state.profiles = [userProfile(PRO_ID, "pro", { telegram_chat_id: "999" })];
    state.holdings = [holding(PRO_ID)];

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.telegrams).toBe(1);
    expect(json.emails).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bottg-token/sendMessage");
    const payload = JSON.parse(String(init.body)) as { chat_id: string; text: string };
    expect(payload.chat_id).toBe("999");
    expect(payload.text).toContain("NVDA reporta resultados trimestrales");
    expect(payload.text).toContain("50% de tu cartera");
    expect(payload.text).toContain("https://www.sec.gov/archives/edgar/0");
    expect(payload.text).toContain("Información, no recomendación");

    expect(state.upserts[0].rows[0].channel).toBe("telegram");
  });
});
