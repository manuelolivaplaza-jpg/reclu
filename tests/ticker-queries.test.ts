import { describe, it, expect } from "vitest";
import {
  normalizeSymbol,
  summarizeHolders,
  filterAlertsBySymbol,
  topSymbolsByCount,
  type RawHoldingRow,
} from "@/lib/ticker-queries";
import type { Alert, Portfolio } from "@/lib/types";

const meta = (id: string, name: string): TickerPortfolio => ({
  id,
  slug: id,
  name,
  category: "political_us",
  country: "US",
  manager: null,
  followers: 100,
});

type TickerPortfolio = Parameters<typeof summarizeHolders>[1] extends Map<
  string,
  infer V
>
  ? V
  : never;

function row(over: Partial<RawHoldingRow>): RawHoldingRow {
  return {
    portfolioId: "p1",
    asOf: "2026-10-10",
    weight: 10,
    previousWeight: null,
    name: null,
    priceCurrent: null,
    returnPct: null,
    currency: null,
    ...over,
  };
}

describe("normalizeSymbol", () => {
  it("trim y mayúsculas", () => {
    expect(normalizeSymbol("  nvda ")).toBe("NVDA");
    expect(normalizeSymbol("sqm-b")).toBe("SQM-B");
  });

  it("símbolo vacío se mantiene vacío", () => {
    expect(normalizeSymbol("   ")).toBe("");
  });
});

describe("summarizeHolders", () => {
  const portfolios = new Map<string, TickerPortfolio>([
    ["p1", meta("p1", "Pelosi Tracker")],
    ["p2", meta("p2", "Berkshire Hathaway")],
  ]);

  it("deduplica por cartera usando la fila más reciente y registra firstSeen", () => {
    const rows = [
      row({ portfolioId: "p1", asOf: "2026-08-01", weight: 5 }),
      row({ portfolioId: "p1", asOf: "2026-10-01", weight: 9 }),
      row({ portfolioId: "p1", asOf: "2026-09-01", weight: 7 }),
    ];
    const { holders, avgWeight, maxWeight } = summarizeHolders(rows, portfolios);
    expect(holders).toHaveLength(1);
    expect(holders[0].weight).toBe(9);
    expect(holders[0].firstSeen).toBe("2026-08-01");
    expect(avgWeight).toBe(9);
    expect(maxWeight).toBe(9);
  });

  it("ordena por peso descendente y promedia entre carteras", () => {
    const rows = [
      row({ portfolioId: "p1", weight: 4, asOf: "2026-10-01" }),
      row({ portfolioId: "p2", weight: 12, asOf: "2026-10-02" }),
    ];
    const { holders, avgWeight } = summarizeHolders(rows, portfolios);
    expect(holders.map((h) => h.portfolio.id)).toEqual(["p2", "p1"]);
    expect(avgWeight).toBe(8);
  });

  it("ignora filas de carteras desconocidas (inactivas)", () => {
    const rows = [row({ portfolioId: "ghost" })];
    const { holders } = summarizeHolders(rows, portfolios);
    expect(holders).toHaveLength(0);
  });

  it("captura nombre, precio y moneda del primer holder con dato", () => {
    const rows = [
      row({ portfolioId: "p1", name: "NVIDIA", priceCurrent: 135.4, currency: "USD" }),
    ];
    const { displayName, price, currency } = summarizeHolders(rows, portfolios);
    expect(displayName).toBe("NVIDIA");
    expect(price).toBe(135.4);
    expect(currency).toBe("USD");
  });

  it("descarta pesos inválidos o negativos", () => {
    const rows = [
      row({ portfolioId: "p1", weight: Number.NaN }),
      row({ portfolioId: "p2", weight: -3 }),
    ];
    const { holders } = summarizeHolders(rows, portfolios);
    expect(holders).toHaveLength(0);
  });

  it("lista vacía → agregados en cero y displayName null", () => {
    const { holders, avgWeight, maxWeight, displayName } = summarizeHolders(
      [],
      portfolios,
    );
    expect(holders).toHaveLength(0);
    expect(avgWeight).toBe(0);
    expect(maxWeight).toBe(0);
    expect(displayName).toBeNull();
  });
});

describe("filterAlertsBySymbol", () => {
  const alert = (over: Partial<Alert>): Alert => ({
    id: "a1",
    portfolio_id: "p1",
    type: "new_trade",
    severity: "medium",
    title: "Titulo base",
    summary: null,
    payload: {},
    created_at: "2026-10-01T00:00:00Z",
    portfolio: { id: "p1", slug: "pelosi-tracker", name: "Pelosi Tracker" },
    ...over,
  });

  it("matchea por payload.symbol", () => {
    const alerts = [
      alert({ payload: { symbol: "NVDA" } }),
      alert({ payload: { symbol: "AAPL" } }),
    ];
    expect(filterAlertsBySymbol(alerts, "nvda")).toHaveLength(1);
  });

  it("matchea por título con límite de palabra", () => {
    const alerts = [
      alert({ title: "Pelosi compró NVDA esta semana" }),
      alert({ title: "NVDAX no es lo mismo" }), // no debe matchear
    ];
    const out = filterAlertsBySymbol(alerts, "NVDA");
    expect(out).toHaveLength(1);
    expect(out[0].title).toContain("compró");
  });

  it("símbolos cortos solo por payload (sin falsos positivos por título)", () => {
    const alerts = [
      alert({ title: "Barcelona y Barcelona otra vez" }), // sin BA como palabra
      alert({ payload: { symbol: "BA" } }),
    ];
    expect(filterAlertsBySymbol(alerts, "BA")).toHaveLength(1);
  });

  it("escapa caracteres de regex en el símbolo", () => {
    const alerts = [
      alert({ payload: { symbol: "BRK-B" } }),
      alert({ title: "Otra cosa BRK B" }),
    ];
    expect(filterAlertsBySymbol(alerts, "BRK-B")).toHaveLength(1);
  });
});

describe("topSymbolsByCount", () => {
  it("cuenta por cartera distinta y ordena", () => {
    const out = topSymbolsByCount(
      [
        { portfolioId: "p1", symbols: ["NVDA", "MSFT", "nvda"] },
        { portfolioId: "p2", symbols: ["NVDA", "AAPL"] },
        { portfolioId: "p3", symbols: ["MSFT", "NVDA"] },
      ],
      2,
    );
    expect(out[0]).toEqual({ symbol: "NVDA", count: 3 });
    expect(out[1]).toEqual({ symbol: "MSFT", count: 2 });
  });

  it("respeta el límite y deduplica dentro de la misma cartera", () => {
    const out = topSymbolsByCount(
      [{ portfolioId: "p1", symbols: ["A", "A", "B"] }],
      5,
    );
    expect(out).toEqual([
      { symbol: "A", count: 1 },
      { symbol: "B", count: 1 },
    ]);
  });
});
