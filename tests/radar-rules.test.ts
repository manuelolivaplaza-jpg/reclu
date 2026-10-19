import { describe, it, expect } from "vitest";
import { buildRadar, RADAR_WEIGHT_STEPS, type RadarRow } from "@/lib/radar-rules";

function rows(list: [string, string, number, number | null][]): RadarRow[] {
  return list.map(([portfolioId, symbol, weight, returnPct]) => ({
    portfolioId,
    symbol,
    weight,
    returnPct,
  }));
}

describe("buildRadar — reglas del Radar IA", () => {
  it("requiere consenso mínimo de carteras (regla 1)", () => {
    const out = buildRadar(
      rows([
        ["a", "RARE", 5, 500], // solo 1 cartera → fuera
        ["a", "NVDA", 10, 30],
        ["b", "NVDA", 12, 25],
        ["c", "NVDA", 8, 40],
      ]),
    );
    expect(out.map((p) => p.symbol)).toEqual(["NVDA"]);
  });

  it("empataje de consenso → decide el momentum (regla 2)", () => {
    const out = buildRadar(
      rows([
        ["a", "MSFT", 9, 12],
        ["b", "MSFT", 7, 10],
        ["d", "MSFT", 5, 11],
        ["a", "AAPL", 9, 2],
        ["b", "AAPL", 7, 1],
        ["d", "AAPL", 5, 3],
      ]),
    );
    expect(out[0].symbol).toBe("MSFT"); // momentum medio mayor
  });

  it("pesos suman 100 y decrecen con el ranking", () => {
    const base = rows([
      ["a", "S1", 10, 1], ["b", "S1", 10, 1], ["c", "S1", 10, 1],
      ["a", "S2", 10, 1], ["b", "S2", 10, 1], ["c", "S2", 10, 0],
      ["a", "S3", 10, 1], ["b", "S3", 10, 1], ["c", "S3", 10, -1],
    ]);
    const out = buildRadar(base);
    const total = out.reduce((s, p) => s + p.weight, 0);
    expect(Math.round(total)).toBe(100);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].weight).toBeLessThanOrEqual(out[i - 1].weight);
    }
  });

  it("sin símbolos con consenso → lista vacía, sin NaN", () => {
    const out = buildRadar(rows([["a", "X", 5, 10]]));
    expect(out).toEqual([]);
  });

  it("ignora pesos <= 0 y filas con símbolo vacío", () => {
    const out = buildRadar(
      rows([
        ["a", "NVDA", 0, 10], // peso 0: no suma consenso
        ["b", "", 10, 10], // símbolo vacío: se ignora
        ["c", "NVDA", 10, 10],
        ["d", "NVDA", 10, 10],
        ["e", "NVDA", 10, 10],
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].holderCount).toBe(3); // c, d, e (a tenía peso 0)
  });

  it("returnPct nulo cuenta como momentum 0, no descarta el símbolo", () => {
    const out = buildRadar(
      rows([
        ["a", "NORET", 5, null],
        ["b", "NORET", 5, null],
        ["c", "NORET", 5, null],
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("NORET");
    expect(out[0].score).toBe(0); // z-score de un solo símbolo con stdev 0
  });

  it("normaliza símbolos (mayúsculas y espacios)", () => {
    const out = buildRadar(
      rows([
        ["a", " nvda ", 5, 1],
        ["b", "NVDA", 5, 1],
        ["c", "nvda", 5, 1],
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("NVDA");
    expect(out[0].holderCount).toBe(3);
  });

  it("los pasos de peso base suman 100", () => {
    expect(RADAR_WEIGHT_STEPS.reduce((s, v) => s + v, 0)).toBe(100);
  });
});
