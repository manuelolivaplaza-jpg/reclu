import { describe, expect, it } from "vitest";
import { buildComposition, groupBySymbol, latestSnapshot, normalizeWeights } from "@/lib/composition";

// Lo que servía producción para trump-dice (3 snapshots mezclados).
const TRUMP = [
  { symbol: "DELL", name: "Dell Technologies", weight: 46.37, as_of: "2026-10-23" },
  { symbol: "DELL", name: "Dell Technologies", weight: 40.05, as_of: "2026-10-22" },
  { symbol: "DELL", name: "Dell Technologies", weight: 39.18, as_of: "2026-10-16" },
  { symbol: "INTC", name: "Intel", weight: 30.16, as_of: "2026-10-23" },
  { symbol: "INTC", name: "Intel", weight: 26.73, as_of: "2026-10-16" },
  { symbol: "SPY", name: "SPDR S&P 500", weight: 23.47, as_of: "2026-10-23" },
];

const sum = (r: { weight: number }[]) => Math.round(r.reduce((s, x) => s + x.weight, 0) * 100) / 100;

describe("composición (D39)", () => {
  it("usa solo el último snapshot", () => {
    expect(latestSnapshot(TRUMP).map((r) => r.symbol)).toEqual(["DELL", "INTC", "SPY"]);
  });

  it("trump-dice: DELL una sola vez y suma 100", () => {
    const c = buildComposition(TRUMP, { complete: true });
    expect(c.filter((r) => r.symbol === "DELL")).toHaveLength(1);
    expect(sum(c)).toBe(100);
    expect(c[0]).toEqual({ symbol: "DELL", name: "Dell Technologies", weight: 46.37 });
  });

  it("agrupa símbolos repetidos en el mismo snapshot", () => {
    const g = groupBySymbol([
      { symbol: "dell ", weight: 30, as_of: "x" },
      { symbol: "DELL", weight: 30, as_of: "x" },
      { symbol: "INTC", weight: 40, as_of: "x" },
    ]);
    expect(g.map((r) => [r.symbol.trim().toUpperCase(), r.weight])).toEqual([["DELL", 60], ["INTC", 40]]);
  });

  it("normaliza a 100 si la lista está completa o si pasa de 100", () => {
    expect(sum(normalizeWeights([{ weight: 60 }, { weight: 60 }], { complete: false }))).toBe(100);
    expect(sum(normalizeWeights([{ weight: 33.3 }, { weight: 33.3 }, { weight: 33.3 }], { complete: true }))).toBe(100);
  });

  it("no infla un top-N recortado por el muro", () => {
    const r = normalizeWeights([{ weight: 46.37 }, { weight: 30.16 }], { complete: false });
    expect(sum(r)).toBe(76.53);
  });
});
