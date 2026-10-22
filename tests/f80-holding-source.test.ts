import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F80 — punto 2: el origen de la cartera (`user_holdings.source`) se declara
 * y se valida en el servidor contra la lista cerrada
 * ("manual" | "csv" | "cartola"), igual que el CHECK de la migración 050.
 *
 * Antes el guardado escribía siempre "csv", aunque la cartera se ingressara a
 * mano: el dato era falso.
 */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  insert: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { importHoldings, saveUserHoldings } from "@/app/actions/holdings";
import {
  CSV_SOURCE,
  DEFAULT_HOLDING_SOURCE,
  HOLDING_SOURCES,
  normalizeHoldingSource,
} from "@/lib/holding-source";
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
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      upsert: mocks.upsert,
      insert: mocks.insert,
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
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
    data: {
      consent_at: "2026-10-20T12:00:00Z",
      consent_version: PORTFOLIO_CONSENT_VERSION,
    },
    error: null,
  });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
});

describe("F80: normalizeHoldingSource valida contra la lista cerrada", () => {
  it("acepta los tres orígenes de la migración 050", () => {
    expect(HOLDING_SOURCES).toEqual(["manual", "csv", "cartola"]);
    for (const source of HOLDING_SOURCES) {
      expect(normalizeHoldingSource(source)).toBe(source);
    }
  });

  it("rechaza cualquier otro valor", () => {
    expect(normalizeHoldingSource("sql")).toBeNull();
    expect(normalizeHoldingSource("")).toBeNull();
    expect(normalizeHoldingSource(undefined)).toBeNull();
    expect(normalizeHoldingSource(42)).toBeNull();
  });

  it("el origen por defecto es manual", () => {
    expect(DEFAULT_HOLDING_SOURCE).toBe("manual");
    expect(CSV_SOURCE).toBe("csv");
  });
});

describe("F80: saveUserHoldings graba el origen declarado", () => {
  it("sin origen explícito graba manual", async () => {
    const result = await saveUserHoldings([{ symbol: "AAPL", weight: 100 }]);

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows[0].source).toBe("manual");
  });

  it("con origen csv graba csv", async () => {
    const result = await saveUserHoldings(
      [{ symbol: "AAPL", weight: 100 }],
      "csv",
    );

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows[0].source).toBe("csv");
  });

  it("con origen cartola graba cartola", async () => {
    const result = await saveUserHoldings(
      [{ symbol: "AAPL", weight: 100 }],
      "cartola",
    );

    expect(result.error).toBeUndefined();
    const [rows] = mocks.upsert.mock.calls[0];
    expect(rows[0].source).toBe("cartola");
  });

  it("un origen inválido se rechaza y no se escribe nada", async () => {
    const result = await saveUserHoldings(
      [{ symbol: "AAPL", weight: 100 }],
      "hack; drop table user_holdings",
    );

    expect(result.error).toMatch(/origen de cartera/i);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("F80: importHoldings graba el origen csv", () => {
  it("la importación desde archivo guarda source csv", async () => {
    const result = await importHoldings("symbol,quantity\nAAPL,10\nMSFT,5\n");

    expect(result.error).toBeUndefined();
    const [rows] = mocks.insert.mock.calls[0];
    expect(rows.every((row: { source: string }) => row.source === "csv")).toBe(true);
  });
});
