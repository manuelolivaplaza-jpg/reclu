import { describe, expect, it } from "vitest";
import { compoundReturnPct, rebaseToStart, returnSinceStart, windowReturnPct } from "@/lib/returns";
import { simulateInvestment } from "@/lib/simulated-investment";
import { periodChanges } from "@/components/dashboard/resumen/periods";
import { cumulativeFromPct } from "@/lib/hero-featured";
import { totalFromPct } from "@/lib/trump-dice-page";

/**
 * d69: casos reales de la auditoría de staging (29-oct-2026). Puntos de
 * value_pct acumulado leídos del HTML público de la ficha; la resta en pp
 * daba las cifras imposibles que vio Manu.
 */
// Trump dice: 1M con resta = −85,3 pp; real compuesto = −19,2%.
const TRUMP = [
  { date: "2026-09-23", value: 344.27 },
  { date: "2026-10-08", value: 300.1 },
  { date: "2026-10-23", value: 258.97 },
];
// Inverse Cramer compras: resta −162,43 pp (imposible); real −64,1%.
const CRAMER = [
  { date: "2026-07-27", value: 153.4 },
  { date: "2026-10-23", value: -9.03 },
];
// ARKK: serie recortada parte en 88,5 (no en 0). Resta +24,2 pp; real +12,9%.
const ARKK = [
  { date: "2026-07-27", value: 88.5 },
  { date: "2026-10-23", value: 112.7 },
];

describe("d69 · retornos compuestos (fuente única)", () => {
  it("Trump dice 1M = −19,2%, no −85%", () => {
    expect(windowReturnPct(TRUMP, 30)).toBeCloseTo(-19.2, 1);
    const p = periodChanges(TRUMP);
    expect(p["1M"]).toBeCloseTo(-19.2, 1);
  });

  it("Inverse Cramer = −64,1%, nunca < −100%", () => {
    const r = returnSinceStart(CRAMER)!;
    expect(r).toBeCloseTo(-64.1, 1);
    expect(r).toBeGreaterThan(-100);
  });

  it("ARKK serie que no parte en 0 = +12,9%, no +24,2%", () => {
    expect(returnSinceStart(ARKK)).toBeCloseTo(12.84, 1);
    expect(cumulativeFromPct(ARKK)).toBeCloseTo(12.8, 1);
    expect(totalFromPct(ARKK, "2026-01-01")).toBeCloseTo(12.84, 1);
  });

  it("la simulación del hero compone (mismo número en todas las vistas)", () => {
    const toSim = (s: { date: string; value: number }[]) => s.map((p) => ({ date: p.date, value_pct: p.value }));
    expect(simulateInvestment(toSim(TRUMP))!.gainPct).toBeCloseTo(-19.2, 1);
    expect(simulateInvestment(toSim(CRAMER))!.gainPct).toBeCloseTo(-64.1, 1);
    expect(simulateInvestment(toSim(ARKK))!.gainPct).toBeCloseTo(returnSinceStart(ARKK)!, 6);
  });

  it("compoundReturnPct y rebase", () => {
    expect(compoundReturnPct(0, 10)).toBeCloseTo(10, 9);
    expect(compoundReturnPct(-100, 10)).toBeNull();
    const r = rebaseToStart(ARKK);
    expect(r[0].value).toBe(0);
    expect(r[1].value).toBeCloseTo(12.84, 1);
  });

  it("ventana con hueco mayor al tolerado => null", () => {
    const s = [
      { date: "2026-01-01", value: 0 },
      { date: "2026-10-23", value: 10 },
    ];
    expect(windowReturnPct(s, 30, 10)).toBeNull();
    expect(windowReturnPct(s, 30)).toBeCloseTo(10, 9);
  });
});
