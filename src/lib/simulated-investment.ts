/**
 * Simulación de inversión sobre la serie de rendimiento de un portafolio.
 *
 * La serie viene en retornos acumulados en % (value_pct), igual que
 * portfolio_performance. La simulación reinicia la base en el primer punto
 * visible de la serie: quien "invierte" en el inicio del período ve exactamente
 * el movimiento que la curva muestra, sin inventar rentabilidades.
 *
 * Función pura: sin fechas de "hoy", sin aleatoriedad, sin red. La misma serie
 * siempre da el mismo resultado (testeable).
 */

import { levelFromPct } from "@/lib/returns";

export interface SimulatedSeriesPoint {
  /** Fecha del punto (YYYY-MM-DD o ISO). */
  date: string;
  /** Retorno acumulado en % desde el origen de la serie. */
  value_pct: number;
}

export interface SimulatedPoint {
  /** Fecha del punto. */
  date: string;
  /** Valor de la inversión (misma moneda del monto inicial) en esa fecha. */
  value: number;
}

export interface SimulatedInvestment {
  /** Valor final de la inversión. */
  finalValue: number;
  /** Ganancia neta (valor final - monto inicial). */
  gain: number;
  /** Ganancia en % sobre el monto inicial. */
  gainPct: number;
  /** Trayectoria del valor, para el gráfico. */
  points: SimulatedPoint[];
}

/** Monto por defecto de la simulación (USD). */
export const DEFAULT_SIMULATED_AMOUNT = 10_000;

function toTime(date: string): number {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  return Date.parse(iso);
}

/**
 * Simula invertir `amount` al inicio de la serie.
 *
 * - Serie vacía o sin fechas válidas => null (nunca un número inventado).
 * - El primer punto visible es la base 0%: el monto inicial queda intacto ahí.
 * - `amount` inválido (<= 0 o no finito) => se usa DEFAULT_SIMULATED_AMOUNT.
 */
export function simulateInvestment(
  series: ReadonlyArray<SimulatedSeriesPoint> | null | undefined,
  amount: number = DEFAULT_SIMULATED_AMOUNT,
): SimulatedInvestment | null {
  if (!Array.isArray(series) || series.length === 0) return null;

  const initial = Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_SIMULATED_AMOUNT;

  const clean = series
    .filter(
      (point): point is SimulatedSeriesPoint =>
        !!point &&
        typeof point.date === "string" &&
        point.date.length > 0 &&
        Number.isFinite(toTime(point.date)) &&
        Number.isFinite(Number(point.value_pct)),
    )
    .map((point) => ({ date: point.date, value_pct: Number(point.value_pct), time: toTime(point.date) }))
    .sort((a, b) => a.time - b.time);

  if (clean.length === 0) return null;

  // d69: componer (nunca restar pp): la serie recortada no parte en 0.
  const base = levelFromPct(clean[0].value_pct);
  if (!(base > 0)) return null;
  const points: SimulatedPoint[] = clean.map((point) => ({
    date: point.date,
    value: (initial * levelFromPct(point.value_pct)) / base,
  }));

  const finalValue = points[points.length - 1].value;
  const gain = finalValue - initial;
  const gainPct = (gain / initial) * 100;

  return { finalValue, gain, gainPct, points };
}

/**
 * Etiqueta del período de la serie: "desde <mes año>" (ej. "desde mar 2024").
 * Serie vacía o sin fechas => "" (la UI decide qué mostrar).
 */
export function seriesPeriodLabel(
  series: ReadonlyArray<{ date: string }> | null | undefined,
): string {
  if (!Array.isArray(series) || series.length === 0) return "";

  let earliest: number | null = null;
  for (const point of series) {
    if (!point || typeof point.date !== "string") continue;
    const time = toTime(point.date);
    if (!Number.isFinite(time)) continue;
    if (earliest === null || time < earliest) earliest = time;
  }
  if (earliest === null) return "";

  const month = new Intl.DateTimeFormat("es-CL", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(earliest));

  return `desde ${month}`;
}
