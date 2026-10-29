import { describe, it, expect } from "vitest";
import {
  simulateInvestment,
  seriesPeriodLabel,
  DEFAULT_SIMULATED_AMOUNT,
} from "@/lib/simulated-investment";

describe("simulateInvestment", () => {
  it("devuelve null con serie vacía", () => {
    expect(simulateInvestment([])).toBeNull();
    expect(simulateInvestment(null)).toBeNull();
    expect(simulateInvestment(undefined)).toBeNull();
  });

  it("devuelve null si la serie no tiene fechas válidas", () => {
    expect(
      simulateInvestment([{ date: "", value_pct: 5 }, { date: "no-fecha", value_pct: 8 }]),
    ).toBeNull();
  });

  it("calcula ganancia: 10.000 USD suben 20%", () => {
    const result = simulateInvestment([
      { date: "2024-01-02", value_pct: 0 },
      { date: "2024-06-03", value_pct: 10 },
      { date: "2024-12-30", value_pct: 20 },
    ]);

    expect(result).not.toBeNull();
    expect(result!.finalValue).toBeCloseTo(12_000, 6);
    expect(result!.gain).toBeCloseTo(2_000, 6);
    expect(result!.gainPct).toBeCloseTo(20, 6);
    expect(result!.points).toHaveLength(3);
    expect(result!.points[0].value).toBeCloseTo(10_000, 6);
    expect(result!.points[2].value).toBeCloseTo(12_000, 6);
  });

  it("calcula pérdida: 10.000 USD bajan 8%", () => {
    const result = simulateInvestment([
      { date: "2024-01-02", value_pct: 0 },
      { date: "2024-03-01", value_pct: -4 },
      { date: "2024-06-03", value_pct: -8 },
    ]);

    expect(result).not.toBeNull();
    expect(result!.finalValue).toBeCloseTo(9_200, 6);
    expect(result!.gain).toBeCloseTo(-800, 6);
    expect(result!.gainPct).toBeCloseTo(-8, 6);
  });

  it("reinicia la base en el primer punto visible de la serie", () => {
    // Serie recortada (muro de pago): el primer punto no es 0%.
    const result = simulateInvestment([
      { date: "2024-05-01", value_pct: 12 },
      { date: "2024-06-01", value_pct: 20 },
    ]);

    expect(result).not.toBeNull();
    expect(result!.points[0].value).toBeCloseTo(DEFAULT_SIMULATED_AMOUNT, 6);
    // d69: compuesto, no resta en pp (antes 8%).
    expect(result!.finalValue).toBeCloseTo((10_000 * 1.2) / 1.12, 6);
    expect(result!.gainPct).toBeCloseTo((1.2 / 1.12 - 1) * 100, 6);
  });

  it("respeta el monto inicial y ordena por fecha", () => {
    const result = simulateInvestment(
      [
        { date: "2024-06-03", value_pct: 20 },
        { date: "2024-01-02", value_pct: 0 },
        { date: "2024-03-01", value_pct: 10 },
      ],
      5_000,
    );

    expect(result).not.toBeNull();
    expect(result!.points.map((point) => point.date)).toEqual([
      "2024-01-02",
      "2024-03-01",
      "2024-06-03",
    ]);
    expect(result!.finalValue).toBeCloseTo(6_000, 6);
    expect(result!.gain).toBeCloseTo(1_000, 6);
  });

  it("usa el monto por defecto si el monto es inválido", () => {
    const result = simulateInvestment(
      [{ date: "2024-01-02", value_pct: 0 }, { date: "2024-06-03", value_pct: 10 }],
      0,
    );

    expect(result).not.toBeNull();
    expect(result!.finalValue).toBeCloseTo(DEFAULT_SIMULATED_AMOUNT * 1.1, 6);
  });
});

describe("seriesPeriodLabel", () => {
  it("devuelve cadena vacía con serie vacía", () => {
    expect(seriesPeriodLabel([])).toBe("");
    expect(seriesPeriodLabel(null)).toBe("");
  });

  it("devuelve 'desde <mes año>' con la fecha más antigua", () => {
    const label = seriesPeriodLabel([
      { date: "2024-06-03" },
      { date: "2024-01-02" },
    ]);
    expect(label).toBe("desde ene 2024");
    expect(label.startsWith("desde ")).toBe(true);
  });

  it("ignora fechas inválidas", () => {
    expect(seriesPeriodLabel([{ date: "basura" }])).toBe("");
  });
});
