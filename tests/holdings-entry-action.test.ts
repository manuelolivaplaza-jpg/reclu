import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * saveHoldingsByMode (F78): guardado de la cartera por cantidad de acciones,
 * monto en dinero o porcentaje. Sin Supabase real: se mockea el cliente de
 * sesión y la lectura de precios.
 */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  deleteFn: vi.fn(),
  deleteEq: vi.fn(),
  deleteIn: vi.fn(),
  existing: { data: [] as Array<{ symbol: string }>, error: null as null | { message: string } },
  revalidatePath: vi.fn(),
  /** Precios por símbolo; null = sin precio. */
  prices: {} as Record<string, { close: number; currency: string }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/holdings-prices", async () => {
  const actual = await vi.importActual<typeof import("@/lib/holdings-prices")>(
    "@/lib/holdings-prices",
  );
  return {
    ...actual,
    loadHoldingPrices: vi.fn(async (items: Array<{ symbol: string }>) => {
      const map = new Map<
        string,
        { symbol: string; close: number; currency: "USD" | "CLP"; date: string }
      >();
      for (const item of items) {
        const price = mocks.prices[item.symbol];
        if (!price) continue;
        map.set(item.symbol, {
          symbol: item.symbol,
          close: price.close,
          currency: price.currency as "USD" | "CLP",
          date: "2026-10-20",
        });
      }
      return map;
    }),
  };
});

import { saveHoldingsByMode } from "@/app/actions/holdings-entry";
import { PORTFOLIO_CONSENT_VERSION } from "@/lib/portfolio-consent";

function table(name: string) {
  if (name === "profiles") {
    return { select: () => ({ eq: () => ({ single: mocks.single }) }) };
  }
  if (name === "user_portfolio_settings") {
    return { select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) };
  }
  if (name === "user_holdings") {
    return {
      select: () => ({ eq: () => Promise.resolve(mocks.existing) }),
      upsert: mocks.upsert,
      delete: mocks.deleteFn,
    };
  }
  throw new Error(`tabla inesperada: ${name}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.from.mockImplementation(table);
  mocks.single.mockResolvedValue({
    data: { plan: "free", trial_ends_at: null },
    error: null,
  });
  mocks.maybeSingle.mockResolvedValue({
    data: { consent_at: "2026-10-20T12:00:00Z", consent_version: PORTFOLIO_CONSENT_VERSION },
    error: null,
  });
  mocks.existing = { data: [], error: null };
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.deleteEq.mockReturnValue({ in: mocks.deleteIn });
  mocks.deleteFn.mockReturnValue({ eq: mocks.deleteEq });
  mocks.deleteIn.mockResolvedValue({ error: null });
  mocks.prices = {};
});

describe("saveHoldingsByMode: porcentaje", () => {
  it("normaliza los pesos a 100 y no necesita precios", async () => {
    const result = await saveHoldingsByMode({
      mode: "percentage",
      rows: [
        { symbol: "AAPL", value: 30 },
        { symbol: "MSFT", value: 10 },
      ],
    });

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows.map((row: { weight: number }) => row.weight)).toEqual([75, 25]);
    expect(rows[0].quantity).toBeUndefined();
  });
});

describe("saveHoldingsByMode: cantidad de acciones", () => {
  it("guarda la cantidad y calcula el peso con el precio", async () => {
    mocks.prices = {
      AAPL: { close: 100, currency: "USD" },
      MSFT: { close: 200, currency: "USD" },
    };

    const result = await saveHoldingsByMode({
      mode: "shares",
      rows: [
        { symbol: "AAPL", value: 10 },
        { symbol: "MSFT", value: 5 },
      ],
    });

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows[0]).toMatchObject({
      symbol: "AAPL",
      quantity: 10,
      weight: 50,
      currency: "USD",
    });
    expect(rows[1].weight).toBe(50);
  });

  it("falla por símbolo cuando no hay precio y no guarda nada", async () => {
    mocks.prices = { AAPL: { close: 100, currency: "USD" } };

    const result = await saveHoldingsByMode({
      mode: "shares",
      rows: [
        { symbol: "AAPL", value: 10 },
        { symbol: "NOPRICE", value: 5 },
      ],
    });

    expect(result.holdings).toBeUndefined();
    expect(result.error).toMatch(/precio/i);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].symbol).toBe("NOPRICE");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("saveHoldingsByMode: monto en dinero", () => {
  it("deriva la cantidad dividiendo el monto por el precio", async () => {
    mocks.prices = { AAPL: { close: 150, currency: "USD" } };

    const result = await saveHoldingsByMode({
      mode: "amount",
      rows: [{ symbol: "AAPL", value: 1500 }],
    });

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows[0].quantity).toBe(10);
    expect(rows[0].weight).toBe(100);
  });

  it("rechaza mezclar USD y CLP sin tipo de cambio", async () => {
    mocks.prices = {
      AAPL: { close: 100, currency: "USD" },
      "SQM-B": { close: 950, currency: "CLP" },
    };

    const result = await saveHoldingsByMode({
      mode: "amount",
      rows: [
        { symbol: "AAPL", value: 100 },
        { symbol: "SQM-B", value: 95000 },
      ],
    });

    expect(result.error).toMatch(/tipo de cambio/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("convierte con el tipo de cambio cuando se entrega", async () => {
    mocks.prices = {
      AAPL: { close: 100, currency: "USD" },
      "SQM-B": { close: 950, currency: "CLP" },
    };

    const result = await saveHoldingsByMode({
      mode: "amount",
      rows: [
        { symbol: "AAPL", value: 100 },
        { symbol: "SQM-B", value: 95000 },
      ],
      fx: 950,
    });

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows[0].weight).toBe(50);
    expect(rows[1].weight).toBe(50);
    // La cantidad usa el precio en la moneda de la posición.
    expect(rows[1].quantity).toBe(100);
    expect(rows[1].currency).toBe("CLP");
  });
});

describe("saveHoldingsByMode: consentimientos y límites", () => {
  it("exige consentimiento vigente", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await saveHoldingsByMode({
      mode: "percentage",
      rows: [{ symbol: "AAPL", value: 100 }],
    });

    expect(result.error).toMatch(/consentimiento/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rechaza una cartera que excede el tope del plan", async () => {
    const result = await saveHoldingsByMode({
      mode: "percentage",
      rows: Array.from({ length: 11 }, (_, index) => ({
        symbol: `SYM${index}`,
        value: 10,
      })),
    });

    expect(result.error).toMatch(/límite de 10 posiciones/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("borra solo las posiciones que el usuario quitó", async () => {
    mocks.existing = { data: [{ symbol: "AAPL" }, { symbol: "MSFT" }], error: null };

    await saveHoldingsByMode({
      mode: "percentage",
      rows: [{ symbol: "AAPL", value: 100 }],
    });

    expect(mocks.deleteIn).toHaveBeenCalledWith("symbol", ["MSFT"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/compare");
  });

  it("rechaza una sesión sin autenticar", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await saveHoldingsByMode({
      mode: "percentage",
      rows: [{ symbol: "AAPL", value: 100 }],
    });

    expect(result.error).toMatch(/No autenticado/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
