import type { SeriesPoint } from "@/lib/performance";
import { isPublicDisclosureSource } from "@/lib/public-disclosure";

/** Días de historial visibles en el backtest sin plan de pago. */
export const FREE_BACKTEST_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

function toTime(date: string): number {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  return Date.parse(iso);
}

/**
 * Recorta una serie a los últimos `days` días contados desde su último punto.
 * Es la defensa del servidor: al cliente nunca le llega más historial del que
 * corresponde a su plan.
 *
 * Los portafolios de declaraciones públicas (House/Senate/OGE) son información
 * pública y se entregan completos, sin recorte.
 *
 * Si el recorte deja menos de dos puntos (series con huecos), conserva los dos
 * últimos: sin dos puntos no hay curva. `days` nulo o inválido deja la serie
 * intacta.
 */
export function trimSeriesToWindow(
  points: SeriesPoint[],
  days: number | null | undefined,
  source?: string | null,
): SeriesPoint[] {
  if (isPublicDisclosureSource(source)) return points;
  if (!Number.isFinite(days) || (days ?? 0) <= 0 || points.length <= 2) return points;

  const clean = points.filter(
    (point) => Number.isFinite(point.value) && Number.isFinite(toTime(point.date)),
  );
  if (clean.length <= 2) return clean.length > 0 ? clean : points;

  const latest = clean.reduce((max, point) => Math.max(max, toTime(point.date)), -Infinity);
  if (!Number.isFinite(latest)) return points;

  const cutoff = latest - ((days as number) - 1) * DAY_MS;
  const recent = clean.filter((point) => toTime(point.date) >= cutoff);
  return recent.length >= 2 ? recent : clean.slice(-2);
}

/**
 * Portafolios que puede ver quien no paga: los premium quedan fuera del
 * selector (y por lo tanto tampoco se consulta ni se serializa su serie).
 */
export function filterBacktestCandidates<T extends { premium: boolean }>(
  portfolios: T[],
  paid: boolean,
): T[] {
  return paid ? portfolios : portfolios.filter((portfolio) => !portfolio.premium);
}
