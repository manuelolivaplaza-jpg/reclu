/**
 * Retorno si se entraba el día en que la operación se publicó.
 * Pura: no lee red ni base. La serie es de NIVELES (precio o base 100),
 * la misma convención que `src/lib/performance.ts`. No convierte porcentajes.
 * Sin un punto a ≤ 10 días de esa fecha, devuelve null. No inventa el número.
 */

import { chileCalendarDay } from "@/lib/disclosure-lag";
import { cleanSeries, cumulativeReturnPct, parseDate, type SeriesPoint } from "@/lib/performance";

/** Holgura para caer en la sesión siguiente (fin de semana o serie semanal). */
export const PUBLICATION_ENTRY_GAP_DAYS = 10;
const MS_PER_DAY = 86_400_000;

/**
 * Retorno (%) desde el primer punto de la serie en o después de `publishedAt`
 * hasta el último. `publishedAt` con hora se interpreta en America/Santiago.
 * 0 si ese punto es el último de la serie. null si no hay entrada usable.
 */
export function returnSincePublication(
  series: SeriesPoint[],
  publishedAt: string | null | undefined,
): number | null {
  if (!publishedAt) return null;
  const day = chileCalendarDay(publishedAt);
  if (!day) return null;

  const points = cleanSeries(series);
  if (points.length === 0) return null;

  const start = points.findIndex((point) => point.date.slice(0, 10) >= day);
  if (start < 0) return null;

  const entryDay = points[start].date.slice(0, 10);
  const gap = (parseDate(entryDay) - parseDate(day)) / MS_PER_DAY;
  if (!Number.isFinite(gap) || gap > PUBLICATION_ENTRY_GAP_DAYS) return null;

  if (start === points.length - 1) return 0;
  return cumulativeReturnPct(points.slice(start));
}
