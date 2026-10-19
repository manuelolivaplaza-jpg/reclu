import { describe, expect, it } from "vitest";
import {
  MAX_BACKTEST_SLEEVES,
  clampSelection,
  decimalWeights,
  defaultBenchmarkSymbol,
  equalWeights,
  runBacktestFromForm,
  toggleSelection,
  truncateSeriesToDays,
  type BacktestBenchmark,
  type BacktestPortfolio,
} from "@/components/backtest-form";

const DATES = ["2024-01-15", "2024-01-31", "2024-02-15", "2024-02-28"] as const;

function pctSeries(values: number[]): { date: string; value: number }[] {
  return DATES.map((date, index) => ({ date, value: values[index] }));
}

function portfolio(
  id: string,
  country: "US" | "CL" | "Global" = "US",
  values = [0, 10, 5, 20],
): BacktestPortfolio {
  return {
    id,
    slug: id,
    name: `Portafolio ${id}`,
    country,
    returnYtd: values[values.length - 1] ?? null,
    series: pctSeries(values),
  };
}

const BENCHMARKS: BacktestBenchmark[] = [
  {
    symbol: "^GSPC",
    label: "S&P 500",
    series: DATES.map((date, index) => ({ date, value: [100, 102, 101, 105][index] })),
  },
  {
    symbol: "^IPSA",
    label: "IPSA",
    series: DATES.map((date, index) => ({ date, value: [100, 101, 100, 103][index] })),
  },
];

describe("formulario de backtest", () => {
  it("acepta como máximo cinco portafolios y elimina duplicados", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "a"];
    expect(clampSelection(ids)).toEqual(["a", "b", "c", "d", "e"]);
    expect(MAX_BACKTEST_SLEEVES).toBe(5);

    let selected: string[] = [];
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      selected = toggleSelection(selected, id);
    }
    expect(selected).toHaveLength(5);
    expect(toggleSelection(selected, "a")).toEqual(["b", "c", "d", "e"]);
  });

  it("reparte pesos enteros que suman 100", () => {
    expect(equalWeights(["a", "b"])).toEqual({ a: 50, b: 50 });
    expect(equalWeights(["a", "b", "c"])).toEqual({ a: 34, b: 33, c: 33 });
    const three = equalWeights(["a", "b", "c"]);
    expect(Object.values(three).reduce((total, value) => total + value, 0)).toBe(100);
  });

  it("convierte porcentajes a decimales y descarta pesos vacíos o negativos", () => {
    expect(decimalWeights(["a", "b", "c"], { a: 60, b: 40, c: 0 })).toEqual({
      a: 0.6,
      b: 0.4,
    });
    expect(decimalWeights(["a"], { a: -10 })).toEqual({});
    expect(decimalWeights(["a"], { a: Number.NaN })).toEqual({});
  });

  it("sugiere IPSA para una selección chilena y S&P 500 para el resto", () => {
    const portfolios = [portfolio("cl", "CL"), portfolio("us", "US")];
    expect(defaultBenchmarkSymbol(["cl"], portfolios, BENCHMARKS)).toBe("^IPSA");
    expect(defaultBenchmarkSymbol(["us"], portfolios, BENCHMARKS)).toBe("^GSPC");
    expect(defaultBenchmarkSymbol(["cl", "us"], portfolios, BENCHMARKS)).toBe("^GSPC");
    expect(defaultBenchmarkSymbol(["cl"], portfolios, [])).toBeNull();
  });

  it("recorta la ventana gratuita y conserva al menos dos puntos", () => {
    const series = [
      { date: "2024-01-01", value: 0 },
      { date: "2024-03-01", value: 5 },
      { date: "2024-03-15", value: 8 },
      { date: "2024-04-01", value: 12 },
    ];
    expect(truncateSeriesToDays(series, 45).map((point) => point.date)).toEqual([
      "2024-03-01",
      "2024-03-15",
      "2024-04-01",
    ]);
    expect(truncateSeriesToDays(series, null)).toEqual(series);
    expect(
      truncateSeriesToDays(
        [
          { date: "2024-01-01", value: 0 },
          { date: "2024-06-01", value: 5 },
        ],
        10,
      ),
    ).toHaveLength(2);
  });

  it("corre la combinación con pesos normalizados y benchmark elegido", () => {
    const result = runBacktestFromForm({
      portfolios: [portfolio("a"), portfolio("b")],
      benchmarks: BENCHMARKS,
      selected: ["a", "b"],
      weightsPct: { a: 60, b: 40 },
      rebalance: "monthly",
      benchmarkSymbol: "^GSPC",
    });

    expect(result.curve.length).toBe(4);
    expect(result.targetWeights).toEqual({ a: 0.6, b: 0.4 });
    expect(result.sleeves).toEqual(["a", "b"]);
    expect(result.benchmarkSymbol).toBe("^GSPC");
    expect(result.benchmarkCurve.length).toBeGreaterThanOrEqual(2);
    expect(result.reasons).toEqual([]);
    expect(result.methodLabel).toContain("rebalanceo mensual");
  });

  it("normaliza pesos que no suman 1 y no simula una selección vacía", () => {
    const result = runBacktestFromForm({
      portfolios: [portfolio("a"), portfolio("b")],
      benchmarks: BENCHMARKS,
      selected: ["a", "b"],
      weightsPct: { a: 1, b: 1 },
      rebalance: "quarterly",
      benchmarkSymbol: "^IPSA",
    });
    expect(result.targetWeights).toEqual({ a: 0.5, b: 0.5 });
    expect(result.notes).toContain("Los pesos se normalizaron para sumar 1.");
    expect(result.rebalanceLabel).toBe("trimestral");

    const empty = runBacktestFromForm({
      portfolios: [portfolio("a")],
      benchmarks: BENCHMARKS,
      selected: [],
      weightsPct: {},
      rebalance: "monthly",
      benchmarkSymbol: "^GSPC",
    });
    expect(empty.curve).toEqual([]);
    expect(empty.reasons.length).toBeGreaterThan(0);
  });

  it("ignora una selección de más de cinco portafolios", () => {
    const portfolios = ["a", "b", "c", "d", "e", "f"].map((id) => portfolio(id));
    const result = runBacktestFromForm({
      portfolios,
      benchmarks: BENCHMARKS,
      selected: ["a", "b", "c", "d", "e", "f"],
      weightsPct: equalWeights(["a", "b", "c", "d", "e", "f"]),
      rebalance: "monthly",
      benchmarkSymbol: "^GSPC",
    });
    expect(result.sleeves).toEqual(["a", "b", "c", "d", "e"]);
  });
});
