import { describe, it, expect } from "vitest";
import {
  computePerformanceMetrics,
  cumulativeReturnPct,
  cagrPct,
  volatilityPct,
  sharpeRatio,
  maxDrawdownPct,
  periodReturnPct,
  alignByDate,
  normalizeToBase100,
  fromPctToLevel,
  cleanSeries,
  type SeriesPoint,
} from "@/lib/performance";

/** Serie diaria consecutiva a partir de un arreglo de niveles. */
function dailySeries(values: number[], startDate = "2024-01-01"): SeriesPoint[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return values.map((value, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

/** Serie con salto de fin de semana (sáb/dom saltados) a partir de niveles. */
function weekdaySeries(values: number[], startDate = "2024-01-01"): SeriesPoint[] {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const points: SeriesPoint[] = [];
  let cursor = start;
  for (const value of values) {
    const date = new Date(cursor);
    const day = date.getUTCDay();
    if (day === 6) cursor += 2 * 86_400_000;
    if (day === 0) cursor += 1 * 86_400_000;
    points.push({ date: new Date(cursor).toISOString().slice(0, 10), value });
    cursor += 86_400_000;
  }
  return points;
}

describe("cleanSeries", () => {
  it("elimina puntos inválidos y ordena por fecha", () => {
    const series = cleanSeries([
      { date: "2024-03-01", value: 110 },
      { date: "no-date", value: 100 },
      { date: "2024-01-01", value: 100 },
      { date: "2024-02-01", value: 105 },
      { date: "2024-04-01", value: Number.NaN },
      { date: "2024-05-01", value: -5 },
    ]);
    expect(series.map((p) => p.date)).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
  });
});

describe("normalizeToBase100 / fromPctToLevel", () => {
  it("normaliza a base 100 en el primer punto", () => {
    const normalized = normalizeToBase100([
      { date: "2024-01-01", value: 50 },
      { date: "2024-02-01", value: 75 },
    ]);
    expect(normalized[0].value).toBe(100);
    expect(normalized[1].value).toBe(150);
  });

  it("convierte retornos acumulados % a nivel base 100", () => {
    const level = fromPctToLevel([
      { date: "2024-01-01", value: 0 },
      { date: "2024-02-01", value: 10 },
    ]);
    expect(level[0].value).toBe(100);
    expect(level[1].value).toBe(110);
  });
});

describe("cumulativeReturnPct", () => {
  it("calcula el retorno acumulado exacto", () => {
    expect(cumulativeReturnPct(dailySeries([100, 110, 121]))).toBe(21);
  });

  it("es null con menos de 2 puntos", () => {
    expect(cumulativeReturnPct(dailySeries([100]))).toBeNull();
    expect(cumulativeReturnPct([])).toBeNull();
  });
});

describe("cagrPct", () => {
  it("duplicar en un año calendario => ~100% CAGR", () => {
    const series = [
      { date: "2024-01-01", value: 100 },
      { date: "2024-12-31", value: 200 },
    ];
    const cagr = cagrPct(series)!;
    expect(cagr).toBeGreaterThan(99.9);
    expect(cagr).toBeLessThan(100.3);
  });

  it("es null con historia menor a 180 días", () => {
    const short = [
      { date: "2024-01-01", value: 100 },
      { date: "2024-04-01", value: 110 }, // 91 días
    ];
    expect(cagrPct(short)).toBeNull();
    expect(cagrPct(dailySeries([100, 105]))).toBeNull();
  });
});

describe("volatilityPct", () => {
  it("serie constante => 0% de volatilidad", () => {
    expect(volatilityPct(weekdaySeries(Array(30).fill(100)))).toBe(0);
  });

  it("alterna +10%/-9.09% => volatilidad anualizada enorme", () => {
    const values: number[] = [100];
    for (let i = 0; i < 30; i++) {
      values.push(i % 2 === 0 ? values[values.length - 1] * 1.1 : values[values.length - 1] / 1.1);
    }
    const vol = volatilityPct(dailySeries(values))!;
    // Retorno diario ±~9.5% => vol anualizada ≈ 9.5% × √252 ≈ 150%.
    expect(vol).toBeGreaterThan(140);
    expect(vol).toBeLessThan(170);
  });

  it("es null con menos de 10 retornos", () => {
    expect(
      volatilityPct(dailySeries([100, 101, 102, 103, 104, 105, 106, 107, 108])),
    ).toBeNull();
  });
});

describe("sharpeRatio", () => {
  it("serie constante => vol 0 => Sharpe null", () => {
    expect(sharpeRatio(weekdaySeries(Array(60).fill(100)))).toBeNull();
  });

  it("suba estable con rf=0 => Sharpe alto y positivo", () => {
    const values: number[] = [100];
    let v = 100;
    for (let i = 0; i < 199; i++) {
      v = v * (i % 5 === 0 ? 1.008 : 1.012);
      values.push(v);
    }
    const sharpe = sharpeRatio(dailySeries(values), 0)!;
    expect(sharpe).toBeGreaterThan(5);
  });

  it("es null con menos de 30 retornos", () => {
    const series = weekdaySeries([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
    expect(sharpeRatio(series)).toBeNull();
  });
});

describe("maxDrawdownPct", () => {
  it("100 -> 120 -> 60 -> 90 => caída del 50% desde el pico", () => {
    const series = [
      { date: "2024-01-01", value: 100 },
      { date: "2024-01-02", value: 120 },
      { date: "2024-01-03", value: 60 },
      { date: "2024-01-04", value: 90 },
    ];
    expect(maxDrawdownPct(series)).toBe(50);
  });

  it("serie siempre creciente => 0%", () => {
    expect(maxDrawdownPct(dailySeries([100, 110, 121, 133]))).toBe(0);
  });

  it("es null con menos de 2 puntos", () => {
    expect(maxDrawdownPct(dailySeries([100]))).toBeNull();
  });
});

describe("periodReturnPct", () => {
  it("YTD parte el 1 de enero del último año de la serie", () => {
    const series = [
      { date: "2023-06-01", value: 100 },
      { date: "2023-12-31", value: 90 },
      { date: "2024-01-01", value: 100 },
      { date: "2024-03-01", value: 110 },
      { date: "2024-06-01", value: 120 },
    ];
    // Base 2024-01-01 = 100, final 2024-06-01 = 120 => +20%
    expect(periodReturnPct(series, "YTD").value).toBe(20);
  });

  it("1A: mide contra el punto más cercano a un año atrás", () => {
    const series = [
      { date: "2023-01-01", value: 100 },
      { date: "2023-06-01", value: 110 },
      { date: "2023-12-31", value: 120 },
      { date: "2024-06-01", value: 132 },
    ];
    // 2024-06-01 menos un año = 2023-06-01 (110) => 132/110 - 1 ≈ 20%
    expect(periodReturnPct(series, "1A").value).toBeCloseTo(20, 1);
  });

  it("serie que no cubre la ventana => null", () => {
    const series = [
      { date: "2024-06-01", value: 100 },
      { date: "2024-06-15", value: 105 },
    ];
    expect(periodReturnPct(series, "1A").value).toBeNull();
    // 1M necesita ≥14 días de ventana cubierta: 14 días exactos aún calzan.
    expect(periodReturnPct(series, "1M").value).not.toBeNull();
  });

  it("1M: mide el último mes cuando la serie es más larga", () => {
    // 40 días: la ventana de 1M usa el punto a ~30 días del final.
    const series = dailySeries(
      Array.from({ length: 41 }, (_, i) => 100 + i),
      "2024-01-01",
    );
    const { value } = periodReturnPct(series, "1M");
    // Último valor 140; el punto ~30 días atrás ronda 110 => ~27%.
    expect(value).toBeGreaterThan(20);
    expect(value).toBeLessThan(30);
  });

  it("devuelve null con menos de 2 puntos", () => {
    expect(periodReturnPct(dailySeries([100]), "1M").value).toBeNull();
  });
});

describe("alignByDate", () => {
  it("deja solo las fechas comunes, en orden", () => {
    const a = [
      { date: "2024-01-01", value: 100 },
      { date: "2024-01-02", value: 101 },
      { date: "2024-01-03", value: 102 },
    ];
    const b = [
      { date: "2024-01-02", value: 200 },
      { date: "2024-01-03", value: 202 },
      { date: "2024-01-04", value: 204 },
    ];
    const aligned = alignByDate(a, b);
    expect(aligned.a.map((p) => p.date)).toEqual(["2024-01-02", "2024-01-03"]);
    expect(aligned.b.map((p) => p.date)).toEqual(["2024-01-02", "2024-01-03"]);
  });

  it("sin fechas en común => vacío", () => {
    const aligned = alignByDate(
      [{ date: "2024-01-01", value: 100 }],
      [{ date: "2024-02-01", value: 100 }],
    );
    expect(aligned.a).toHaveLength(0);
    expect(aligned.b).toHaveLength(0);
  });
});

describe("computePerformanceMetrics", () => {
  it("serie vacía => todo null con motivo", () => {
    const metrics = computePerformanceMetrics({ portfolio: [] });
    expect(metrics.totalReturnPct).toBeNull();
    expect(metrics.dataPoints).toBe(0);
    expect(metrics.reasons.length).toBeGreaterThan(0);
  });

  it("un solo punto => null con motivo, sin números inventados", () => {
    const metrics = computePerformanceMetrics({ portfolio: dailySeries([100]) });
    expect(metrics.totalReturnPct).toBeNull();
    expect(metrics.reasons[0]).toContain("un solo punto");
  });

  it("sin benchmark => métricas propias calculadas, exceso/alfa/win rate en null sin motivo", () => {
    const values: number[] = [100];
    let v = 100;
    for (let i = 0; i < 199; i++) {
      v = v * (i % 5 === 0 ? 1.008 : 1.012);
      values.push(v);
    }
    const metrics = computePerformanceMetrics({ portfolio: dailySeries(values) });
    expect(metrics.totalReturnPct).not.toBeNull();
    expect(metrics.volatilityPct).not.toBeNull();
    expect(metrics.sharpe).not.toBeNull();
    expect(metrics.maxDrawdownPct).toBe(0);
    expect(metrics.excessReturnPct).toBeNull();
    expect(metrics.alphaPct).toBeNull();
    expect(metrics.winRatePct).toBeNull();
    expect(metrics.reasons).toHaveLength(0);
  });

  it("con benchmark: exceso y win rate correctos (benchmark plano)", () => {
    const portfolioValues: number[] = [100];
    const benchmarkValues: number[] = [100];
    for (let i = 0; i < 199; i++) {
      portfolioValues.push(portfolioValues[i] * 1.01);
      benchmarkValues.push(100);
    }
    const metrics = computePerformanceMetrics({
      portfolio: dailySeries(portfolioValues),
      benchmark: dailySeries(benchmarkValues),
    });
    expect(metrics.excessReturnPct).toBeGreaterThan(600);
    expect(metrics.winRatePct).toBe(100);
  });

  it("portafolio que pierde contra el benchmark => exceso negativo y win rate bajo", () => {
    const portfolio = dailySeries([100, 101, 100.5, 101.5, 101, 102, 101.5, 102.5], "2024-01-01");
    const benchmark = dailySeries([100, 102, 103, 104, 105, 106, 107, 108], "2024-01-01");
    const metrics = computePerformanceMetrics({ portfolio, benchmark });
    expect(metrics.excessReturnPct!).toBeLessThan(0);
    expect(metrics.winRatePct!).toBeLessThan(50);
  });

  it("sin solape de fechas con el benchmark => motivos explicativos", () => {
    const portfolio = dailySeries([100, 110, 120], "2024-01-01");
    const benchmark = dailySeries([100, 105, 110], "2025-01-01");
    const metrics = computePerformanceMetrics({ portfolio, benchmark });
    expect(metrics.excessReturnPct).toBeNull();
    expect(metrics.winRatePct).toBeNull();
    expect(metrics.reasons.some((r) => r.includes("fechas"))).toBe(true);
  });

  it("tolera rf configurable: rf alto => Sharpe menor", () => {
    const values: number[] = [100];
    let v = 100;
    for (let i = 0; i < 199; i++) {
      v = v * 1.01 * (i % 3 === 0 ? 0.998 : 1.001);
      values.push(v);
    }
    const series = dailySeries(values);
    const low = sharpeRatio(series, 0)!;
    const high = sharpeRatio(series, 50)!;
    expect(high).toBeLessThan(low);
  });
});
