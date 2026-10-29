/**
 * d69: fuente ÚNICA de cálculo de retornos sobre series de `value_pct`
 * (retorno acumulado en %, como portfolio_performance).
 *
 * Regla: los retornos acumulados se COMPONEN, nunca se restan.
 *   retorno(a → b) = (1 + b/100) / (1 + a/100) − 1
 * Restar puntos porcentuales (b − a) solo es correcto si a = 0; con series
 * recortadas por el muro (que no parten en 0) daba cifras imposibles
 * (Trump dice 1M −85% en vez de −19%, Inverse Cramer −162%).
 *
 * Todas las vistas (ficha/hero, explore, home, dashboard, carruseles, chat)
 * usan estas funciones.
 */

export interface PctPoint {
  date: string;
  value: number;
}

const DAY = 86_400_000;

/** Nivel (base 1) de un retorno acumulado en %. */
export function levelFromPct(pct: number): number {
  return 1 + pct / 100;
}

/** Retorno compuesto (%) entre dos retornos acumulados en %. null si no es calculable. */
export function compoundReturnPct(fromPct: number, toPct: number): number | null {
  const a = levelFromPct(fromPct);
  const b = levelFromPct(toPct);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  const r = (b / a - 1) * 100;
  return Number.isFinite(r) ? r : null;
}

function dayTime(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

/** Serie limpia (valores finitos, fecha válida) ordenada por fecha. */
export function cleanPctSeries<T extends PctPoint>(series: readonly T[] | null | undefined): T[] {
  return [...(series ?? [])]
    .filter((p) => p && typeof p.date === "string" && Number.isFinite(p.value) && Number.isFinite(dayTime(p.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Retorno compuesto (%) entre el primer y el último punto de la serie. */
export function returnSinceStart(series: readonly PctPoint[] | null | undefined): number | null {
  const pts = cleanPctSeries(series);
  if (pts.length < 2) return null;
  return compoundReturnPct(pts[0].value, pts[pts.length - 1].value);
}

/**
 * Retorno compuesto (%) de los últimos `days` días calendario: base = último
 * punto con fecha <= (última fecha − days). Si ese punto queda a más de
 * `maxGapDays` del límite (hueco o serie que empieza después) => null.
 */
export function windowReturnPct(
  series: readonly PctPoint[] | null | undefined,
  days: number,
  maxGapDays = Infinity,
): number | null {
  const pts = cleanPctSeries(series);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const target = dayTime(last.date) - days * DAY;
  let base: PctPoint | null = null;
  for (let i = pts.length - 2; i >= 0; i--) {
    if (dayTime(pts[i].date) <= target) {
      base = pts[i];
      break;
    }
  }
  if (!base || target - dayTime(base.date) > maxGapDays * DAY) return null;
  return compoundReturnPct(base.value, last.value);
}

/** Rebasa la serie a 0% en su primer punto (compuesto). */
export function rebaseToStart<T extends PctPoint>(series: readonly T[]): T[] {
  const pts = cleanPctSeries(series);
  if (pts.length === 0) return [];
  const base = levelFromPct(pts[0].value);
  if (base <= 0) return [];
  return pts.map((p) => ({ ...p, value: (levelFromPct(p.value) / base - 1) * 100 }));
}
