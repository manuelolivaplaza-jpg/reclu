import { describe, it, expect } from "vitest";
import {
  computeAlignment,
  shouldAlertAlignment,
  normalizeHoldings,
  DEFAULT_ALIGNMENT_ALERT_THRESHOLD,
  type WeightedHolding,
} from "@/lib/alignment";

const h = (symbol: string, weight: number): WeightedHolding => ({ symbol, weight });

describe("normalizeHoldings", () => {
  it("normaliza símbolos y suma duplicados", () => {
    const map = normalizeHoldings([
      h(" aapl ", 10),
      h("AAPL", 5),
      h("msft", 20),
      h("", 50),
      h("bad", Number.NaN),
    ]);
    expect(map.get("AAPL")).toBe(15);
    expect(map.get("MSFT")).toBe(20);
    expect(map.has("")).toBe(false);
    expect(map.get("BAD")).toBe(0);
  });
});

describe("computeAlignment", () => {
  it("carteras idénticas => 100% de similitud, sin faltantes ni sobrantes", () => {
    const user = [h("AAPL", 50), h("MSFT", 50)];
    const target = [h("AAPL", 50), h("MSFT", 50)];
    const result = computeAlignment(user, target);
    expect(result.similarityPct).toBe(100);
    expect(result.missing).toHaveLength(0);
    expect(result.excess).toHaveLength(0);
    expect(result.sharedCount).toBe(2);
    expect(result.reasons).toHaveLength(0);
  });

  it("mitad compartida => ~50% de similitud", () => {
    const user = [h("AAPL", 100)];
    const target = [h("AAPL", 50), h("NVDA", 50)];
    const result = computeAlignment(user, target);
    expect(result.similarityPct).toBe(50);
    expect(result.missing.map((m) => m.symbol)).toEqual(["NVDA"]);
    expect(result.excess.map((e) => e.symbol)).toEqual(["AAPL"]);
  });

  it("carteras sin intersección => 0%", () => {
    const user = [h("AAPL", 100)];
    const target = [h("NVDA", 100)];
    const result = computeAlignment(user, target);
    expect(result.similarityPct).toBe(0);
    expect(result.missing.map((m) => m.symbol)).toEqual(["NVDA"]);
    expect(result.excess.map((e) => e.symbol)).toEqual(["AAPL"]);
  });

  it("normaliza pesos aunque el CSV no sume 100", () => {
    // Usuario: AAPL 30, MSFT 70 => 30/70. Objetivo: AAPL 2, MSFT 2 => 50/50.
    // overlap = min(30,50) + min(70,50) = 30+50 = 80.
    const user = [h("AAPL", 30), h("MSFT", 70)];
    const target = [h("AAPL", 2), h("MSFT", 2)];
    const result = computeAlignment(user, target);
    expect(result.similarityPct).toBe(80);
    // Con los mismos pesos relativos sí llega a 100:
    const same = computeAlignment([h("AAPL", 3), h("MSFT", 7)], [h("AAPL", 30), h("MSFT", 70)]);
    expect(same.similarityPct).toBe(100);
  });

  it("detecta falta y sobra con deltas correctos", () => {
    // Usuario: AAPL 80, TSLA 20. Objetivo: AAPL 40, NVDA 40, MSFT 20.
    const user = [h("AAPL", 80), h("TSLA", 20)];
    const target = [h("AAPL", 40), h("NVDA", 40), h("MSFT", 20)];
    const result = computeAlignment(user, target);
    // overlap = min(40, 80) = 40 => 40%
    expect(result.similarityPct).toBe(40);
    expect(result.missing.map((m) => m.symbol).sort()).toEqual(["MSFT", "NVDA"]);
    // Sobra: AAPL (80 vs 40) y TSLA (fuera del objetivo).
    expect(result.excess.map((e) => e.symbol).sort()).toEqual(["AAPL", "TSLA"]);
    const aapl = result.weightDiffs.find((d) => d.symbol === "AAPL")!;
    expect(aapl.targetWeight).toBe(40);
    expect(aapl.userWeight).toBe(80);
    expect(aapl.delta).toBe(-40);
  });

  it("objetivo vacío => motivo explicativo y 0%", () => {
    const result = computeAlignment([h("AAPL", 100)], []);
    expect(result.similarityPct).toBe(0);
    expect(result.reasons[0]).toContain("objetivo");
  });

  it("usuario vacío => motivo explicativo y 0%", () => {
    const result = computeAlignment([], [h("AAPL", 100)]);
    expect(result.similarityPct).toBe(0);
    expect(result.reasons[0]).toContain("vacía");
  });

  it("pesos con NaN en el usuario no rompen el cálculo", () => {
    const result = computeAlignment(
      [h("AAPL", Number.NaN), h("MSFT", 100)],
      [h("MSFT", 100)],
    );
    // AAPL cae a peso 0 => todo MSFT => 100%.
    expect(result.similarityPct).toBe(100);
  });

  it("umbral de diferencia configurable: deltas menores no se listan", () => {
    const user = [h("AAPL", 51), h("MSFT", 49)];
    const target = [h("AAPL", 50), h("MSFT", 50)];
    // Delta AAPL = -1, MSFT = +1. Con umbral 5 ninguno aparece como falta/sobra.
    const result = computeAlignment(user, target, { diffThresholdPp: 5 });
    expect(result.similarityPct).toBe(99);
    expect(result.excess).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });
});

describe("shouldAlertAlignment", () => {
  it("alerta cuando la similitud cae bajo el umbral por defecto (60)", () => {
    expect(shouldAlertAlignment({ similarityPct: 40 }).alert).toBe(true);
    expect(shouldAlertAlignment({ similarityPct: 80 }).alert).toBe(false);
  });

  it("respeta el umbral entregado", () => {
    expect(shouldAlertAlignment({ similarityPct: 70, threshold: 75 }).alert).toBe(true);
    expect(shouldAlertAlignment({ similarityPct: 70, threshold: 50 }).alert).toBe(false);
  });

  it("devuelve el umbral efectivo usado", () => {
    expect(shouldAlertAlignment({ similarityPct: 10 }).threshold).toBe(
      DEFAULT_ALIGNMENT_ALERT_THRESHOLD,
    );
  });
});
