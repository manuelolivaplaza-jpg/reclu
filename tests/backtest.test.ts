import { describe, expect, it } from "vitest";
import {
  BACKTEST_DISCLAIMER,
  PUBLICATION_ENTRY_LABEL,
  TRADE_ENTRY_LABEL,
  runBacktest,
} from "@/lib/backtest";
import { computePerformanceMetrics, type SeriesPoint } from "@/lib/performance";

const MIX_DATES = ["2024-01-15", "2024-01-31", "2024-02-15", "2024-02-28"] as const;

/** A se duplica en enero y se queda. B se duplica recién a fin de febrero. */
const LEVEL_A = [100, 200, 200, 200];
const LEVEL_B = [100, 100, 100, 200];

function points(dates: readonly string[], values: number[]): SeriesPoint[] {
  return dates.map((date, index) => ({ date, value: values[index] }));
}

function cumulativePct(values: number[]): number[] {
  const base = values[0];
  return values.map((value) => (value / base - 1) * 100);
}

function mixInput(rebalance: "monthly" | "quarterly", scale: "level" | "cumulative_pct") {
  const valuesOf = scale === "level" ? (values: number[]) => values : cumulativePct;
  return {
    series: {
      a: points(MIX_DATES, valuesOf(LEVEL_A)),
      b: points(MIX_DATES, valuesOf(LEVEL_B)),
    },
    weights: { a: 1, b: 1 },
    rebalance,
    ...(scale === "level" ? { seriesScale: "level" as const } : {}),
    benchmark: points(MIX_DATES, [50, 50, 50, 55]),
    benchmarkSymbol: "SPY",
  };
}

describe("runBacktest", () => {
  it("por defecto lee retornos acumulados en % y los deja en la misma curva que los niveles", () => {
    const fromPct = runBacktest(mixInput("monthly", "cumulative_pct"));
    const fromLevel = runBacktest(mixInput("monthly", "level"));

    expect(fromPct.curve).toEqual(fromLevel.curve);
    expect(fromPct.curve.map((point) => point.value)).toEqual([100, 150, 150, 225]);
    expect(fromPct.targetWeights).toEqual({ a: 0.5, b: 0.5 });
    expect(fromPct.notes).toContain("Los pesos se normalizaron para sumar 1.");
    expect(fromPct.reasons).toEqual([]);
    expect(fromPct.start).toBe("2024-01-15");
    expect(fromPct.end).toBe("2024-02-28");
  });

  it("rebalancea al cierre del primer día del mes y no otra vez dentro del mes", () => {
    const monthly = runBacktest(mixInput("monthly", "level"));
    expect(monthly.rebalanceDates).toEqual(["2024-02-15"]);
    expect(monthly.rebalanceLabel).toBe("mensual");
    // Feb 15 vuelve a 50/50 con A en 200 y B en 100. Después B se duplica: 225.
    expect(monthly.curve[3].value).toBe(225);
    expect(monthly.metrics.totalReturnPct).toBe(125);
    expect(monthly.metrics.maxDrawdownPct).toBe(0);
  });

  it("el rebalanceo trimestral no toca el libro dentro del mismo trimestre", () => {
    const quarterly = runBacktest(mixInput("quarterly", "level"));
    expect(quarterly.rebalanceDates).toEqual([]);
    expect(quarterly.rebalanceLabel).toBe("trimestral");
    // Sin rebalanceo, A y B terminan otra vez 50/50 y la curva cierra en 200.
    expect(quarterly.curve.map((point) => point.value)).toEqual([100, 150, 150, 200]);
    expect(quarterly.metrics.totalReturnPct).toBe(100);
  });

  it("un 60/40 que ya suma 1 no se renormaliza y cierra distinto al 50/50", () => {
    const result = runBacktest({
      series: {
        a: points(MIX_DATES, LEVEL_A),
        b: points(MIX_DATES, LEVEL_B),
      },
      weights: { a: 0.6, b: 0.4 },
      rebalance: "monthly",
      seriesScale: "level",
    });
    expect(result.notes.some((note) => note.includes("normaliz"))).toBe(false);
    expect(result.targetWeights.a).toBeCloseTo(0.6, 8);
    expect(result.targetWeights.b).toBeCloseTo(0.4, 8);
    expect(result.curve[3].value).toBeCloseTo(224, 6);
  });

  it("una sola serie no cambia con el rebalanceo: la curva es el nivel en base 100", () => {
    const result = runBacktest({
      series: { a: points(MIX_DATES, LEVEL_A) },
      weights: { a: 1 },
      rebalance: "monthly",
      seriesScale: "level",
    });
    expect(result.curve.map((point) => point.value)).toEqual([100, 200, 200, 200]);
    expect(result.rebalanceDates).toEqual(["2024-02-15"]);
  });

  it("arrastra el último nivel y no abre la curva antes de que partan todas las series", () => {
    const result = runBacktest({
      series: {
        a: [
          { date: "2024-01-10", value: 100 },
          { date: "2024-03-31", value: 200 },
        ],
        b: [
          { date: "2024-01-31", value: 100 },
          { date: "2024-02-29", value: 100 },
          { date: "2024-03-31", value: 100 },
        ],
      },
      weights: { a: 0.5, b: 0.5 },
      rebalance: "monthly",
      seriesScale: "level",
    });
    expect(result.curve.map((point) => point.date)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
    ]);
    expect(result.curve.map((point) => point.value)).toEqual([100, 100, 150]);
    expect(result.rebalanceDates).toEqual(["2024-02-29", "2024-03-31"]);
    expect(result.notes).toContain(
      "En las fechas en que una serie no tiene punto, se mantiene su último nivel.",
    );
  });

  it("compara contra SPY reutilizando computePerformanceMetrics y normaliza el benchmark a base 100", () => {
    const input = mixInput("monthly", "level");
    const result = runBacktest(input);
    expect(result.benchmarkSymbol).toBe("SPY");
    expect(result.benchmarkCurve.map((point) => point.value)).toEqual([100, 100, 100, 110]);
    expect(result.metrics.excessReturnPct).toBe(115);
    expect(result.metrics.winRatePct).toBe(66.7);
    expect(result.metrics).toEqual(
      computePerformanceMetrics({
        portfolio: result.curve,
        benchmark: input.benchmark,
      }),
    );
  });

  it("acepta el proxy del IPSA como símbolo y como retorno acumulado", () => {
    const result = runBacktest({
      series: {
        a: [
          { date: "2024-01-02", value: 0 },
          { date: "2024-01-03", value: 10 },
        ],
      },
      weights: { a: 1 },
      rebalance: "quarterly",
      benchmark: [
        { date: "2024-01-02", value: 0 },
        { date: "2024-01-03", value: 5 },
      ],
      benchmarkScale: "cumulative_pct",
      benchmarkSymbol: "^IPSA",
    });
    expect(result.benchmarkSymbol).toBe("^IPSA");
    expect(result.curve.map((point) => point.value)).toEqual([100, 110]);
    expect(result.benchmarkCurve.map((point) => point.value)).toEqual([100, 105]);
    expect(result.metrics.excessReturnPct).toBe(5);
  });

  it("sin benchmark no inventa exceso ni alfa", () => {
    const result = runBacktest({
      series: { a: points(MIX_DATES, cumulativePct(LEVEL_A)) },
      weights: { a: 1 },
      rebalance: "monthly",
    });
    expect(result.benchmarkCurve).toEqual([]);
    expect(result.benchmarkSymbol).toBeNull();
    expect(result.metrics.excessReturnPct).toBeNull();
    expect(result.metrics.alphaPct).toBeNull();
    expect(result.metrics.winRatePct).toBeNull();
    expect(result.metrics.reasons.some((reason) => reason.toLowerCase().includes("benchmark"))).toBe(
      false,
    );
  });

  it("un benchmark vacío deja el motivo y no fabrica una curva de comparación", () => {
    const result = runBacktest({
      series: {
        a: [
          { date: "2024-01-02", value: 0 },
          { date: "2024-01-03", value: 10 },
        ],
      },
      weights: { a: 1 },
      rebalance: "monthly",
      benchmark: [],
      benchmarkSymbol: "SPY",
    });
    expect(result.benchmarkCurve).toEqual([]);
    expect(result.metrics.excessReturnPct).toBeNull();
    expect(result.metrics.reasons.some((reason) => reason.includes("benchmark"))).toBe(true);
  });

  it("pasa la tasa libre de riesgo a las métricas", () => {
    const start = Date.parse("2023-01-01T00:00:00Z");
    const series: SeriesPoint[] = [];
    let value = 100;
    for (let day = 0; day < 400; day++) {
      series.push({
        date: new Date(start + day * 86_400_000).toISOString().slice(0, 10),
        value,
      });
      value *= day % 5 === 0 ? 1.008 : 1.012;
    }
    const low = runBacktest({
      series: { a: series },
      weights: { a: 1 },
      rebalance: "monthly",
      seriesScale: "level",
      riskFreePct: 0,
    });
    const high = runBacktest({
      series: { a: series },
      weights: { a: 1 },
      rebalance: "monthly",
      seriesScale: "level",
      riskFreePct: 50,
    });
    expect(low.metrics.sharpe).not.toBeNull();
    expect(high.metrics.sharpe!).toBeLessThan(low.metrics.sharpe!);
    expect(low.metrics).toEqual(
      computePerformanceMetrics({ portfolio: low.curve, riskFreePct: 0 }),
    );
    expect(low.curve[low.curve.length - 1].value).toBeCloseTo(series[series.length - 1].value, 4);
    expect(low.rebalanceDates.length).toBeGreaterThan(3);
  });

  it("rotula la entrada a la fecha de publicación y no mueve la curva si se declara otra", () => {
    const published = runBacktest(mixInput("monthly", "level"));
    const traded = runBacktest({
      ...mixInput("monthly", "level"),
      entryLabel: TRADE_ENTRY_LABEL,
    });
    expect(published.entryLabel).toBe(PUBLICATION_ENTRY_LABEL);
    expect(published.methodLabel).toContain("Entrada a la fecha de publicación");
    expect(published.methodLabel).toContain("Sin comisiones ni dividendos");
    expect(traded.entryLabel).toBe(TRADE_ENTRY_LABEL);
    expect(traded.curve).toEqual(published.curve);
    expect(traded.metrics).toEqual(published.metrics);
    expect(published.disclaimer).toBe(BACKTEST_DISCLAIMER);
    expect(published.disclaimer).toContain("No ejecuta órdenes");
    expect(published.disclaimer).toContain("recomendación de inversión");
  });

  it("rechaza pesos negativos en lugar de simular un corto", () => {
    const result = runBacktest({
      series: {
        a: points(MIX_DATES, LEVEL_A),
        b: points(MIX_DATES, LEVEL_B),
      },
      weights: { a: 1, b: -0.2 },
      rebalance: "monthly",
      seriesScale: "level",
    });
    expect(result.curve).toEqual([]);
    expect(result.reasons).toEqual([
      "Hay pesos negativos. El backtest no simula posiciones cortas.",
    ]);
    expect(result.metrics.totalReturnPct).toBeNull();
    expect(result.disclaimer).toBe(BACKTEST_DISCLAIMER);
    expect(result.entryLabel).toBe(PUBLICATION_ENTRY_LABEL);
  });

  it("no arma la curva si una manga con peso no tiene puntos utilizables", () => {
    const result = runBacktest({
      series: {
        a: points(MIX_DATES, LEVEL_A),
        b: [{ date: "fecha-mala", value: 100 }],
      },
      weights: { a: 0.5, b: 0.5 },
      rebalance: "quarterly",
      seriesScale: "level",
    });
    expect(result.curve).toEqual([]);
    expect(result.reasons).toEqual(['La serie "b" no tiene puntos utilizables.']);
  });

  it("informa cuando las series no se solapan o el peso falta", () => {
    const apart = runBacktest({
      series: {
        a: [
          { date: "2024-01-02", value: 0 },
          { date: "2024-01-03", value: 1 },
        ],
        b: [
          { date: "2024-03-01", value: 0 },
          { date: "2024-03-02", value: 1 },
        ],
      },
      weights: { a: 1, b: 1, huérfano: 3 },
      rebalance: "monthly",
    });
    expect(apart.curve).toEqual([]);
    expect(apart.reasons).toEqual(["Las series no comparten un período común."]);
    expect(apart.notes).toContain('El peso de "huérfano" no tiene serie y se ignora.');
    expect(apart.notes).toContain("Los pesos se normalizaron para sumar 1.");

    const missingWeight = runBacktest({
      series: {
        a: points(MIX_DATES, LEVEL_A),
        b: points(MIX_DATES, LEVEL_B),
      },
      weights: { a: 1 },
      rebalance: "monthly",
      seriesScale: "level",
    });
    expect(missingWeight.sleeves).toEqual(["a"]);
    expect(missingWeight.notes).toContain('Sin peso para "b"; esa serie no entra.');
    expect(missingWeight.curve.map((point) => point.value)).toEqual([100, 200, 200, 200]);

    const empty = runBacktest({
      series: {},
      weights: {},
      rebalance: "quarterly",
    });
    expect(empty.reasons).toEqual(["No hay series para combinar."]);
    expect(empty.metrics.dataPoints).toBe(0);
  });

  it("una sola fecha en común no alcanza para medir un retorno", () => {
    const result = runBacktest({
      series: {
        a: [
          { date: "2024-01-02", value: 100 },
          { date: "2024-02-02", value: 110 },
        ],
        b: [{ date: "2024-02-02", value: 100 }],
      },
      weights: { a: 1, b: 1 },
      rebalance: "monthly",
      seriesScale: "level",
    });
    expect(result.curve).toEqual([]);
    expect(result.reasons[0]).toContain("una fecha");
    expect(result.start).toBe("2024-02-02");
    expect(result.end).toBe("2024-02-02");
  });
});
