import { describe, it, expect } from "vitest";
import {
  buildComparePayload,
  computeCompareCross,
  visibleHoldingsForRole,
  type ComparePortfolioInput,
} from "@/lib/compare-overlap";
import { HOLDING_LIMITS } from "@/lib/access";

function portfolio(
  slug: string,
  holdings: { symbol: string; weight: number }[],
  overrides: Partial<ComparePortfolioInput> = {},
): ComparePortfolioInput {
  return {
    slug,
    name: slug.toUpperCase(),
    returnYtd: null,
    premium: false,
    holdings,
    ...overrides,
  };
}

/** Cartera de 12 posiciones ordenadas por peso descendente. */
const TWELVE = [
  { symbol: "SYM1", weight: 50 },
  ...Array.from({ length: 9 }, (_, i) => ({ symbol: `SYM${i + 2}`, weight: 4 })),
  { symbol: "SYM11", weight: 2 },
  { symbol: "SYM12", weight: 1 },
];

describe("visibleHoldingsForRole", () => {
  it("recorta las primeras N posiciones del rol", () => {
    const visible = visibleHoldingsForRole(TWELVE, "free");
    expect(visible).toHaveLength(HOLDING_LIMITS.free);
    expect(visible.map((h) => h.symbol)).not.toContain("SYM12");
  });

  it("normaliza símbolos y suma duplicados antes de recortar", () => {
    const visible = visibleHoldingsForRole(
      [
        { symbol: " aapl ", weight: 10 },
        { symbol: "AAPL", weight: 5 },
        { symbol: "MSFT", weight: 4 },
      ],
      "paid",
    );
    expect(visible).toEqual([
      { symbol: "AAPL", weight: 15 },
      { symbol: "MSFT", weight: 4 },
    ]);
  });
});

describe("computeCompareCross", () => {
  it("suma el menor peso de cada activo compartido", () => {
    const cross = computeCompareCross(
      [
        { symbol: "AAPL", weight: 30 },
        { symbol: "MSFT", weight: 20 },
      ],
      [
        { symbol: "aapl", weight: 10 },
        { symbol: "NVDA", weight: 15 },
      ],
    );

    expect(cross.overlapPct).toBe(10);
    expect(cross.shared).toEqual([
      { symbol: "AAPL", weightA: 30, weightB: 10, shared: true },
    ]);
    expect(cross.onlyA.map((r) => r.symbol)).toEqual(["MSFT"]);
    expect(cross.onlyB.map((r) => r.symbol)).toEqual(["NVDA"]);
  });
});

describe("buildComparePayload", () => {
  it("excluye portafolios premium para planes no pagos", () => {
    const input = {
      role: "free" as const,
      userHoldings: [{ symbol: "AAPL", weight: 100 }],
      portfolios: [
        portfolio("publico", [{ symbol: "AAPL", weight: 40 }]),
        portfolio("premium-slug", [{ symbol: "AAPL", weight: 60 }], { premium: true }),
      ],
    };

    const payload = buildComparePayload(input);

    expect(payload.portfolios.map((p) => p.slug)).toEqual(["publico"]);
    expect(payload.pairs).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("premium-slug");
  });

  it("un plan pagado sí recibe los portafolios premium", () => {
    const payload = buildComparePayload({
      role: "paid",
      userHoldings: [{ symbol: "AAPL", weight: 100 }],
      portfolios: [
        portfolio("publico", [{ symbol: "AAPL", weight: 40 }]),
        portfolio("premium-slug", [{ symbol: "AAPL", weight: 60 }], { premium: true }),
      ],
    });

    expect(payload.portfolios.map((p) => p.slug)).toEqual(["publico", "premium-slug"]);
    expect(payload.pairs).toHaveLength(1);
  });

  it("los símbolos en común salen solo de las primeras N posiciones del rol", () => {
    const payload = buildComparePayload({
      role: "free",
      userHoldings: [
        { symbol: "SYM1", weight: 10 },
        { symbol: "SYM12", weight: 10 },
      ],
      portfolios: [
        portfolio("uno", TWELVE),
        portfolio("dos", [
          { symbol: "SYM1", weight: 20 },
          { symbol: "SYM12", weight: 30 },
        ]),
      ],
    });

    // D55: Free no ve posiciones (HOLDING_LIMITS.free = 0): nada en común.
    const [uno] = payload.portfolios;
    expect(uno.holdingsCount).toBe(HOLDING_LIMITS.free);
    expect(uno.sharedSymbols).toEqual([]);
    expect(uno.alignment.missing.map((row) => row.symbol)).not.toContain("SYM12");

    for (const pair of payload.pairs) {
      expect(pair.shared.map((row) => row.symbol)).not.toContain("SYM12");
    }
  });

  it("un plan pagado recibe todas las posiciones y sus símbolos en común", () => {
    const payload = buildComparePayload({
      role: "paid",
      userHoldings: [
        { symbol: "SYM1", weight: 10 },
        { symbol: "SYM12", weight: 10 },
      ],
      portfolios: [portfolio("uno", TWELVE)],
    });

    const [uno] = payload.portfolios;
    expect(uno.holdingsCount).toBe(TWELVE.length);
    expect(uno.sharedSymbols).toEqual(expect.arrayContaining(["SYM1", "SYM12"]));
  });

  it("el payload no contiene pesos de posiciones fuera del límite", () => {
    const payload = buildComparePayload({
      role: "free",
      userHoldings: [{ symbol: "SYM1", weight: 100 }],
      portfolios: [portfolio("uno", TWELVE)],
    });

    // Las posiciones 11 y 12 quedan fuera del top 10: ni símbolo ni peso.
    expect(JSON.stringify(payload)).not.toContain("SYM11");
    expect(JSON.stringify(payload)).not.toContain("SYM12");

    const symbols = new Set<string>();
    for (const p of payload.portfolios) {
      p.sharedSymbols.forEach((symbol) => symbols.add(symbol));
      p.alignment.weightDiffs.forEach((row) => symbols.add(row.symbol));
      p.alignment.missing.forEach((row) => symbols.add(row.symbol));
      p.alignment.excess.forEach((row) => symbols.add(row.symbol));
    }
    for (const pair of payload.pairs) {
      pair.shared.forEach((row) => symbols.add(row.symbol));
      pair.onlyA.forEach((row) => symbols.add(row.symbol));
      pair.onlyB.forEach((row) => symbols.add(row.symbol));
    }

    expect(symbols.has("SYM11")).toBe(false);
    expect(symbols.has("SYM12")).toBe(false);
  });
});
