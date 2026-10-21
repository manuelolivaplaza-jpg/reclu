import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * saveUserHoldings (F60): upsert por (user_id, symbol), tope del plan y
 * consentimiento. Sin Supabase real: se mockea el cliente de sesión.
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
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { saveUserHoldings } from "@/app/actions/holdings";
import { PORTFOLIO_CONSENT_VERSION } from "@/lib/portfolio-consent";

const ORIGINAL_FLAG = process.env.MY_PORTFOLIO_ENABLED;

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
  delete process.env.MY_PORTFOLIO_ENABLED;

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
    data: { consent_at: null },
    error: null,
  });
  mocks.existing = { data: [], error: null };
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.deleteEq.mockReturnValue({ in: mocks.deleteIn });
  mocks.deleteFn.mockReturnValue({ eq: mocks.deleteEq });
  mocks.deleteIn.mockResolvedValue({ error: null });
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.MY_PORTFOLIO_ENABLED;
  else process.env.MY_PORTFOLIO_ENABLED = ORIGINAL_FLAG;
});

describe("saveUserHoldings: cantidad y costo", () => {
  it("guarda cantidad, costo y moneda con upsert por (user_id, symbol)", async () => {
    const result = await saveUserHoldings([
      { symbol: "aapl", quantity: 10, avg_cost: 100, market: "US", broker: "Renta 4" },
    ]);

    expect(result.error).toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = mocks.upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_id,symbol" });
    expect(rows).toEqual([
      {
        user_id: "user-1",
        symbol: "AAPL",
        name: "",
        weight: 100,
        quantity: 10,
        avg_cost: 100,
        currency: "USD",
        market: "US",
        broker: "Renta 4",
        source: "csv",
      },
    ]);
    // No se borra toda la cartera para reinsertar.
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("calcula el peso por valor de costo cuando no viene weight", async () => {
    await saveUserHoldings([
      { symbol: "AAA", quantity: 1, avg_cost: 100 },
      { symbol: "BBB", quantity: 1, avg_cost: 300 },
    ]);

    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows[0].weight).toBe(25);
    expect(rows[1].weight).toBe(75);
  });
});

describe("saveUserHoldings: upsert incremental", () => {
  it("conserva las posiciones que no vienen y borra solo las quitadas", async () => {
    mocks.existing = { data: [{ symbol: "AAPL" }, { symbol: "MSFT" }], error: null };

    const result = await saveUserHoldings([
      { symbol: "AAPL", quantity: 2, avg_cost: 50 },
      { symbol: "NVDA", quantity: 1, avg_cost: 10 },
    ]);

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows.map((row: { symbol: string }) => row.symbol)).toEqual(["AAPL", "NVDA"]);
    expect(mocks.deleteEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.deleteIn).toHaveBeenCalledWith("symbol", ["MSFT"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/compare");
  });

  it("no borra nada si la cartera no se redujo", async () => {
    mocks.existing = { data: [{ symbol: "AAPL" }], error: null };

    await saveUserHoldings([{ symbol: "AAPL", weight: 100 }]);

    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("deduplica símbolos repetidos antes del upsert", async () => {
    await saveUserHoldings([
      { symbol: "AAPL", quantity: 10, avg_cost: 100 },
      { symbol: "aapl", quantity: 5, avg_cost: 100 },
    ]);

    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(15);
    expect(rows[0].weight).toBe(100);
  });
});

describe("saveUserHoldings: tope del plan", () => {
  it("rechaza una posición nueva cuando el plan Gratis ya tiene 10", async () => {
    mocks.existing = {
      data: Array.from({ length: 10 }, (_, i) => ({ symbol: `SYM${i}` })),
      error: null,
    };

    // saveUserHoldings recibe la cartera completa: las 10 actuales + AAPL = 11.
    const result = await saveUserHoldings([
      ...Array.from({ length: 10 }, (_, i) => ({ symbol: `SYM${i}`, quantity: 1, avg_cost: 10 })),
      { symbol: "AAPL", quantity: 1, avg_cost: 10 },
    ]);

    expect(result.error).toMatch(/límite de 10 posiciones/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("permite actualizar una posición existente aunque esté en el tope", async () => {
    mocks.existing = {
      data: Array.from({ length: 10 }, (_, i) => ({
        symbol: i === 0 ? "AAPL" : `SYM${i}`,
      })),
      error: null,
    };

    const result = await saveUserHoldings([{ symbol: "AAPL", quantity: 2, avg_cost: 10 }]);

    expect(result.error).toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("la prueba vigente usa el tope de Pro", async () => {
    mocks.existing = {
      data: Array.from({ length: 10 }, (_, i) => ({ symbol: `SYM${i}` })),
      error: null,
    };
    mocks.single.mockResolvedValue({
      data: { plan: "free", trial_ends_at: "2999-01-01T00:00:00Z" },
      error: null,
    });

    const result = await saveUserHoldings([{ symbol: "AAPL", quantity: 1, avg_cost: 10 }]);

    expect(result.error).toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("saveUserHoldings: consentimiento (MY_PORTFOLIO_ENABLED)", () => {
  it("exige consent_at cuando el flag está encendido", async () => {
    process.env.MY_PORTFOLIO_ENABLED = "true";

    const result = await saveUserHoldings([{ symbol: "AAPL", quantity: 1, avg_cost: 10 }]);

    expect(result.error).toMatch(/consentimiento/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("guarda si ya dio consentimiento", async () => {
    process.env.MY_PORTFOLIO_ENABLED = "true";
    mocks.maybeSingle.mockResolvedValue({
      data: {
        consent_at: "2026-10-20T12:00:00Z",
        consent_version: PORTFOLIO_CONSENT_VERSION,
      },
      error: null,
    });

    const result = await saveUserHoldings([{ symbol: "AAPL", quantity: 1, avg_cost: 10 }]);

    expect(result.error).toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("una versión vieja obliga a aceptar de nuevo y no guarda", async () => {
    process.env.MY_PORTFOLIO_ENABLED = "true";
    mocks.maybeSingle.mockResolvedValue({
      data: {
        consent_at: "2026-10-01T12:00:00Z",
        consent_version: "2026-10-01.v0",
      },
      error: null,
    });

    const result = await saveUserHoldings([{ symbol: "AAPL", quantity: 1, avg_cost: 10 }]);

    expect(result.error).toMatch(/de nuevo/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("con el flag apagado no consulta el consentimiento", async () => {
    const result = await saveUserHoldings([{ symbol: "AAPL", weight: 100 }]);

    expect(result.error).toBeUndefined();
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
});
