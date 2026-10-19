import { describe, expect, it } from "vitest";
import {
  FREE_BACKTEST_WINDOW_DAYS,
  filterBacktestCandidates,
  trimSeriesToWindow,
} from "@/lib/backtest-window";

function series(dates: string[]): { date: string; value: number }[] {
  return dates.map((date, index) => ({ date, value: index * 10 }));
}

describe("recorte del historial en el servidor", () => {
  it("deja solo los últimos 90 días desde el último punto", () => {
    const points = series([
      "2024-01-01",
      "2024-04-02",
      "2024-05-01",
      "2024-06-01",
      "2024-06-30",
    ]);
    expect(FREE_BACKTEST_WINDOW_DAYS).toBe(90);
    expect(trimSeriesToWindow(points, FREE_BACKTEST_WINDOW_DAYS).map((p) => p.date)).toEqual([
      "2024-04-02",
      "2024-05-01",
      "2024-06-01",
      "2024-06-30",
    ]);
  });

  it("no recorta sin ventana o con series demasiado cortas", () => {
    const points = series(["2024-01-01", "2024-06-01"]);
    expect(trimSeriesToWindow(points, null)).toEqual(points);
    expect(trimSeriesToWindow(points, 0)).toEqual(points);
    expect(trimSeriesToWindow(points, Number.NaN)).toEqual(points);
    expect(trimSeriesToWindow(points, 30)).toEqual(points);
  });

  it("conserva dos puntos aunque la ventana no alcance", () => {
    const points = series(["2024-01-01", "2024-06-01", "2024-06-15"]);
    const trimmed = trimSeriesToWindow(points, 5);
    expect(trimmed).toHaveLength(2);
    expect(trimmed.map((p) => p.date)).toEqual(["2024-06-01", "2024-06-15"]);
  });

  it("entrega completas las declaraciones públicas", () => {
    const points = series(["2020-01-01", "2024-01-01", "2024-06-01"]);
    expect(trimSeriesToWindow(points, 90, "house_ptr")).toEqual(points);
    expect(trimSeriesToWindow(points, 90, "senate_ptr")).toEqual(points);
    expect(trimSeriesToWindow(points, 90, "oge_278t")).toEqual(points);
    expect(trimSeriesToWindow(points, 90, "renta4")).toHaveLength(2);
  });
});

describe("exclusión de portafolios premium", () => {
  const portfolios = [
    { id: "public", premium: false },
    { id: "private", premium: true },
  ];

  it("oculta los premium a quien no tiene plan de pago", () => {
    expect(filterBacktestCandidates(portfolios, false)).toEqual([{ id: "public", premium: false }]);
  });

  it("se los muestra completa a los planes de pago", () => {
    expect(filterBacktestCandidates(portfolios, true)).toEqual(portfolios);
  });
});
