/** d53: cálculos puros sobre la serie real (value_pct acumulado). Sin datos => null ("—"). */
import { compoundReturnPct } from "@/lib/returns";

export interface SeriesPt {
  date: string;
  value: number;
}

export type PeriodKey = "1D" | "1S" | "1M" | "YTD" | "1A";
export const PERIOD_LABELS: Record<PeriodKey, string> = { "1D": "Día", "1S": "Semana", "1M": "Mes", YTD: "YTD", "1A": "1 año" };


function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Último punto con fecha <= target; null si la serie empieza después. */
function atOrBefore(pts: SeriesPt[], target: string): SeriesPt | null {
  let hit: SeriesPt | null = null;
  for (const p of pts) {
    if (p.date <= target) hit = p;
    else break;
  }
  return hit;
}

function change(from: SeriesPt | null, to: SeriesPt): number | null {
  if (!from || from === to) return null;
  const pct = compoundReturnPct(from.value, to.value);
  return pct === null ? null : Math.round(pct * 100) / 100;
}

export function periodChanges(series: SeriesPt[]): Record<PeriodKey, number | null> {
  const pts = series.filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  const empty = { "1D": null, "1S": null, "1M": null, YTD: null, "1A": null };
  if (pts.length < 2) return empty;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  return {
    "1D": change(prev, last),
    "1S": change(atOrBefore(pts, shift(last.date, 7)), last),
    "1M": change(atOrBefore(pts, shift(last.date, 30)), last),
    YTD: change(atOrBefore(pts, `${Number(last.date.slice(0, 4)) - 1}-12-31`), last),
    "1A": change(atOrBefore(pts, shift(last.date, 365)), last),
  };
}

/** Hasta n puntos equiespaciados, conservando el último. */
export function downsample(series: SeriesPt[], n = 160): SeriesPt[] {
  const pts = series.filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length <= n) return pts;
  const out: SeriesPt[] = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
  return out;
}
