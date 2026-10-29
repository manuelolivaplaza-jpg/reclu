/**
 * Página dedicada de Trump dice (D30) — lógica pura.
 *
 * Por mención: retorno desde el cierre de su fecha de entrada (primer cierre
 * >= entryDate) hasta el último cierre disponible, y un sparkline. Todo sale
 * de la tabla `prices` (datos reales); sin precios la cifra queda en null.
 */

import { returnSinceStart } from "@/lib/returns";

export interface ClosePoint {
  date: string;
  close: number;
}

export interface SinceResult {
  pct: number | null;
  /** Fecha del primer cierre usado como base. */
  baseDate: string | null;
  lastDate: string | null;
  /** Niveles (base 1) muestreados para el mini gráfico. */
  spark: number[];
}

export function returnSince(closes: readonly ClosePoint[], entryDate: string, points = 40): SinceResult {
  const day = entryDate.slice(0, 10);
  const pts = closes
    .filter((p) => typeof p.date === "string" && Number.isFinite(p.close) && p.close > 0 && p.date.slice(0, 10) >= day)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return { pct: null, baseDate: pts[0]?.date ?? null, lastDate: pts.at(-1)?.date ?? null, spark: [] };
  const base = pts[0].close;
  const last = pts[pts.length - 1].close;
  const pct = Math.round((last / base - 1) * 10000) / 100;
  const spark: number[] = [];
  const n = Math.min(points, pts.length);
  for (let i = 0; i < n; i++) {
    const idx = n === 1 ? 0 : Math.round((i * (pts.length - 1)) / (n - 1));
    spark.push(pts[idx].close / base);
  }
  return { pct, baseDate: pts[0].date, lastDate: pts.at(-1)!.date, spark };
}

/** Retorno acumulado entre el primer punto >= desde y el último (serie de closes). */
export function windowReturn(closes: readonly ClosePoint[], from: string): number | null {
  return returnSince(closes, from).pct;
}

/** Retorno total desde una serie de value_pct acumulado (portfolio_performance). */
export function totalFromPct(series: readonly { date: string; value: number }[], from: string): number | null {
  const pct = returnSinceStart(series.filter((p) => p.date >= from));
  return pct === null ? null : Math.round(pct * 100) / 100;
}
