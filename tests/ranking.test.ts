import { describe, expect, it } from "vitest";
import {
  BENCHMARK_LABEL_CL,
  BENCHMARK_LABEL_US,
  SMALL_SAMPLE_LABEL,
  SMALL_SAMPLE_MIN_POINTS,
  benchmarkLabelForCountry,
  benchmarkLabelForSymbol,
  computeExcessPct,
  rankSources,
  splitByOutcome,
  type RankingSourceInput,
} from "@/lib/ranking";
import { RESEARCH_RESULTS, researchExcess } from "@/lib/research-results";

function source(overrides: Partial<RankingSourceInput> = {}): RankingSourceInput {
  return {
    id: "id",
    name: "Fuente",
    kind: "portfolio",
    country: "US",
    returnPct: 10,
    benchmarkReturnPct: 5,
    dataPoints: 120,
    asOf: "2026-10-16",
    ...overrides,
  };
}

describe("rankSources", () => {
  it("ordena por exceso de retorno de mayor a menor, incluidos los negativos", () => {
    const rows = rankSources([
      source({ id: "pierde", name: "Pierde", returnPct: -2, benchmarkReturnPct: 8 }),
      source({ id: "gana", name: "Gana", returnPct: 12, benchmarkReturnPct: 8 }),
      source({ id: "empata", name: "Empata", returnPct: 8, benchmarkReturnPct: 8 }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["gana", "empata", "pierde"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.excessReturnPct)).toEqual([4, 0, -10]);
  });

  it("no esconde a los perdedores: todos quedan en la lista", () => {
    const rows = rankSources([
      source({ id: "a", returnPct: -20, benchmarkReturnPct: 10 }),
      source({ id: "b", returnPct: 1, benchmarkReturnPct: 10 }),
      source({ id: "c", returnPct: 30, benchmarkReturnPct: 10 }),
    ]);

    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => (row.excessReturnPct ?? 0) < 0)).toHaveLength(2);
  });

  it("manda al final las filas sin retorno o sin benchmark, sin inventar cero", () => {
    const rows = rankSources([
      source({ id: "sin-bench", returnPct: 10, benchmarkReturnPct: null }),
      source({ id: "sin-ret", returnPct: null, benchmarkReturnPct: 5 }),
      source({ id: "ok", returnPct: 7, benchmarkReturnPct: 5 }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["ok", "sin-bench", "sin-ret"]);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBeNull();
    expect(rows[1].excessReturnPct).toBeNull();
    expect(rows[2].rank).toBeNull();
  });

  it("rotula muestra chica con menos de 30 puntos y no con 30 o más", () => {
    const rows = rankSources([
      source({ id: "corta", dataPoints: SMALL_SAMPLE_MIN_POINTS - 1 }),
      source({ id: "justa", dataPoints: SMALL_SAMPLE_MIN_POINTS }),
      source({ id: "larga", dataPoints: 500 }),
      source({ id: "sin-puntos", dataPoints: null }),
    ]);

    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("corta")?.smallSample).toBe(true);
    expect(byId.get("corta")?.smallSampleLabel).toBe(SMALL_SAMPLE_LABEL);
    expect(byId.get("justa")?.smallSample).toBe(false);
    expect(byId.get("justa")?.smallSampleLabel).toBeNull();
    expect(byId.get("larga")?.smallSample).toBe(false);
    expect(byId.get("sin-puntos")?.smallSample).toBe(false);
  });

  it("no muta la lista de entrada", () => {
    const input = [
      source({ id: "a", returnPct: 1 }),
      source({ id: "b", returnPct: 9 }),
    ];
    rankSources(input);
    expect(input.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("etiquetas de benchmark", () => {
  it("rotula SPY para EE.UU. y ECH en CLP para Chile", () => {
    expect(benchmarkLabelForCountry("US")).toBe(BENCHMARK_LABEL_US);
    expect(benchmarkLabelForCountry("Global")).toBe(BENCHMARK_LABEL_US);
    expect(benchmarkLabelForCountry("CL")).toBe(BENCHMARK_LABEL_CL);
    expect(benchmarkLabelForCountry(null)).toBe(BENCHMARK_LABEL_US);
    expect(BENCHMARK_LABEL_US).toContain("SPY");
    expect(BENCHMARK_LABEL_CL).toContain("ECH");
  });

  it("traduce los símbolos guardados en portfolio_metrics", () => {
    expect(benchmarkLabelForSymbol("^GSPC")).toBe(BENCHMARK_LABEL_US);
    expect(benchmarkLabelForSymbol("SPY")).toBe(BENCHMARK_LABEL_US);
    expect(benchmarkLabelForSymbol("^IPSA")).toBe(BENCHMARK_LABEL_CL);
    expect(benchmarkLabelForSymbol("ECH")).toBe(BENCHMARK_LABEL_CL);
    expect(benchmarkLabelForSymbol("")).toBe(BENCHMARK_LABEL_US);
    expect(benchmarkLabelForSymbol("OTRO")).toBe("OTRO");
  });
});

describe("computeExcessPct", () => {
  it("resta y redondea a dos decimales", () => {
    expect(computeExcessPct(0.07, -0.44)).toBe(0.51);
    expect(computeExcessPct(33.79, 33.09)).toBe(0.7);
    expect(computeExcessPct(8.11, -1.8)).toBe(9.91);
  });

  it("devuelve null si falta un dato o no es finito", () => {
    expect(computeExcessPct(null, 5)).toBeNull();
    expect(computeExcessPct(5, null)).toBeNull();
    expect(computeExcessPct(Number.NaN, 5)).toBeNull();
  });
});

describe("splitByOutcome", () => {
  it("separa ganadores, perdedores, empates y sin datos", () => {
    const rows = rankSources([
      source({ id: "gana", returnPct: 10, benchmarkReturnPct: 5 }),
      source({ id: "pierde", returnPct: 1, benchmarkReturnPct: 5 }),
      source({ id: "empata", returnPct: 5, benchmarkReturnPct: 5 }),
      source({ id: "nada", returnPct: null, benchmarkReturnPct: 5 }),
    ]);
    const { winners, losers, ties, noData } = splitByOutcome(rows);

    expect(winners.map((row) => row.id)).toEqual(["gana"]);
    expect(losers.map((row) => row.id)).toEqual(["pierde"]);
    expect(ties.map((row) => row.id)).toEqual(["empata"]);
    expect(noData.map((row) => row.id)).toEqual(["nada"]);
  });
});

describe("RESEARCH_RESULTS", () => {
  it("incluye los cinco estudios con corte y fuente", () => {
    expect(RESEARCH_RESULTS).toHaveLength(5);
    for (const study of RESEARCH_RESULTS) {
      expect(study.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(study.source.length).toBeGreaterThan(0);
      expect(study.sourceUrl).toMatch(/^https:\/\//);
      expect(study.method.length).toBeGreaterThan(0);
    }
  });

  it("fija las cifras de los JSON de F38", () => {
    const byId = new Map(RESEARCH_RESULTS.map((study) => [study.id, study]));

    expect(byId.get("estudio-insiders")).toMatchObject({
      returnPct: -1.8,
      benchmarkReturnPct: 8.11,
      asOf: "2026-10-16",
    });
    expect(byId.get("estudio-insiders")?.returnPct).toBeLessThan(0);

    expect(byId.get("estudio-inverse-cramer")).toMatchObject({
      returnPct: 0.07,
      benchmarkReturnPct: -0.44,
      dataPoints: 25,
    });

    expect(byId.get("estudio-trump-compra")).toMatchObject({
      returnPct: 2.06,
      benchmarkReturnPct: -1.38,
      dataPoints: 11,
    });

    expect(byId.get("estudio-afp-modelo")).toMatchObject({
      returnPct: 33.79,
      benchmarkReturnPct: 33.09,
      benchmarkLabel: BENCHMARK_LABEL_CL,
      asOf: "2026-09-16",
    });
  });

  it("promedia los tres elogios de Musk sin incluir Tesla", () => {
    const musk = RESEARCH_RESULTS.find((study) => study.id === "estudio-musk");
    expect(musk?.returnPct).toBe(-50.45);
    expect(musk?.benchmarkReturnPct).toBe(117.67);
    expect(musk?.dataPoints).toBe(3);
    expect(musk?.detail).toHaveLength(3);
    expect(musk?.detail?.map((item) => item.name)).toEqual([
      "Etsy (26-01-2021)",
      "GameStop (27-01-2021)",
      "CD Projekt (28-01-2021)",
    ]);
  });

  it("calcula el exceso de cada estudio con la misma regla del ranking", () => {
    const byId = new Map(RESEARCH_RESULTS.map((study) => [study.id, study]));
    expect(researchExcess(byId.get("estudio-insiders")!)).toBe(-9.91);
    expect(researchExcess(byId.get("estudio-musk")!)).toBe(-168.12);
    expect(researchExcess(byId.get("estudio-inverse-cramer")!)).toBe(0.51);
    expect(researchExcess(byId.get("estudio-trump-compra")!)).toBe(3.44);
    expect(researchExcess(byId.get("estudio-afp-modelo")!)).toBe(0.7);
  });
});
