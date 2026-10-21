import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F80 — punto 5: tope global de entregas por corrida en el job de alertas
 * de cartera (correos + Telegram, entre todos los usuarios).
 *
 * Supabase y `fetch` están mockeados: nunca se toca la base real ni se envía
 * un correo. Se verifica que la corrida se corta en 200 entregas, que lo que
 * sobra queda diferido (sin marcar como enviado) y que el log solo trae el
 * conteo de diferidos (nunca la lista de avisos).
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
import { PORTFOLIO_CONSENT_VERSION } from "@/lib/portfolio-consent";

const fetchMock = vi.fn();

/** Máximo global de entregas por corrida (debe calzar con la ruta). */
const MAX_DELIVERIES_PER_RUN = 200;

/** Cuántos avisos entrega cada usuario Elite en tiempo real. */
const ALERTS_PER_ELITE = 20;

function request(): Request {
  return new Request("http://localhost/api/impact/alerts", {
    method: "POST",
    headers: { Authorization: "Bearer cron-secret" },
  });
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function uuid(index: number): string {
  return `${String(index).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
}

function news(index: number): Record<string, unknown> {
  return {
    id: uuid(1000 + index),
    source: "sec_8k",
    url: `https://www.sec.gov/archives/edgar/${index}`,
    title: `NVDA anuncia hecho ${index}`,
    published_at: "2026-10-20T12:00:00.000Z",
    news_tickers: [{ symbol: "NVDA", relation: "direct", confidence: 1 }],
  };
}

function eliteUser(index: number): {
  settings: Record<string, unknown>;
  profile: Record<string, unknown>;
  holding: Record<string, unknown>;
} {
  const userId = uuid(index);
  return {
    settings: {
      user_id: userId,
      auto_alerts: true,
      min_relevance: 0.3,
      alert_channel: "email",
      consent_at: "2026-10-01T00:00:00.000Z",
      consent_version: PORTFOLIO_CONSENT_VERSION,
    },
    profile: {
      id: userId,
      email: `elite${index}@example.com`,
      plan: "elite",
      trial_ends_at: null,
      email_unsubscribed: false,
      telegram_chat_id: null,
      unsubscribe_token: `token-${index}`,
    },
    holding: { user_id: userId, symbol: "NVDA", weight: 50 },
  };
}

let consoleWarn: ReturnType<typeof vi.spyOn>;

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
  state.news = Array.from({ length: 25 }, (_, index) => news(index));
  state.sent = [];
  state.today = [];
  state.upserts = [];
  state.upsertError = null;

  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleWarn.mockRestore();
  delete process.env.CRON_SECRET;
  delete process.env.NEWS_IMPACT_ENABLED;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("F80: tope global de entregas por corrida", () => {
  it("la corrida se corta en 200 entregas y el resto queda diferido", async () => {
    // 12 usuarios Elite: cada uno entrega 20 avisos (tope diario de Elite).
    // 12 x 20 = 240 candidatos, pero la corrida solo entrega 200.
    const users = Array.from({ length: 12 }, (_, index) => eliteUser(index));
    state.settings = users.map((user) => user.settings);
    state.profiles = users.map((user) => user.profile);
    state.holdings = users.map((user) => user.holding);

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    // Entregadas (correos) == tope global, nunca más.
    expect(json.emails).toBe(MAX_DELIVERIES_PER_RUN);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_DELIVERIES_PER_RUN);
    // Lo que sobró queda diferido y NO se marca como entregado.
    expect(json.deferred).toBe(40);
    expect(json.delivered).toBe(MAX_DELIVERIES_PER_RUN);

    const written = state.upserts.flatMap((upsert) => upsert.rows);
    expect(written).toHaveLength(MAX_DELIVERIES_PER_RUN);
  });

  it("sin tope alcanzado no hay diferidos", async () => {
    const users = Array.from({ length: 2 }, (_, index) => eliteUser(index));
    state.settings = users.map((user) => user.settings);
    state.profiles = users.map((user) => user.profile);
    state.holdings = users.map((user) => user.holding);

    const res = await POST(request());
    const json = await body(res);

    expect(res.status).toBe(200);
    expect(json.deferred).toBe(0);
    expect(json.emails).toBe(2 * ALERTS_PER_ELITE);
  });

  it("el log de diferidos trae solo el conteo, sin datos de cartera", async () => {
    const users = Array.from({ length: 12 }, (_, index) => eliteUser(index));
    state.settings = users.map((user) => user.settings);
    state.profiles = users.map((user) => user.profile);
    state.holdings = users.map((user) => user.holding);

    await POST(request());

    const text = consoleWarn.mock.calls
      .map((call) => call.map((value) => String(value)).join(" "))
      .join("\n");

    expect(text).toContain("40");
    // Nunca la lista de símbolos, noticias ni usuarios.
    expect(text).not.toContain("NVDA");
    expect(text).not.toContain("sec_8k");
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("aaaa-4aaa");
  });
});
