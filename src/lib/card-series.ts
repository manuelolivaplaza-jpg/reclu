import { cumulativeFromPct, monthYear, sparkline, type SeriesPointPct } from "@/lib/hero-featured";
import { TRUMP_DICE_START } from "@/lib/mentions-queries";

/**
 * D40: inicio oficial de la serie por portafolio. Trump dice cuenta solo
 * desde la primera mención válida (M04, entrada 07-08-2025): home, detalle
 * y /trump-dice usan el mismo recorte.
 */
export const SERIES_START_BY_SLUG: Record<string, string> = {
  "trump-dice": TRUMP_DICE_START,
};

/** Serie ordenada y recortada al inicio oficial del portafolio. */
export function clipSeriesForSlug<T extends { date: string }>(slug: string, series: readonly T[]): T[] {
  const from = SERIES_START_BY_SLUG[slug];
  const sorted = [...(series ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  return from ? sorted.filter((p) => p.date >= from) : sorted;
}

export interface CardStat {
  /** Retorno acumulado de la serie real (null = sin serie: no se muestra). */
  pct: number | null;
  /** "desde ago 2024". */
  label: string;
  /** Niveles para la sparkline real (vacío = sin gráfico). */
  spark: number[];
  /** La serie incluye puntos estimados. */
  estimated: boolean;
  asOf: string | null;
}

/** Retorno, etiqueta y sparkline de una tarjeta, solo desde la serie real. */
export function cardStatFromSeries(slug: string, series: readonly SeriesPointPct[] | undefined, sparkPoints = 24): CardStat {
  const pts = clipSeriesForSlug(slug, series ?? []).filter((p) => Number.isFinite(p.value));
  const pct = cumulativeFromPct(pts);
  if (pct === null) return { pct: null, label: "", spark: [], estimated: false, asOf: null };
  return {
    pct,
    label: `desde ${monthYear(pts[0].date)}`,
    spark: sparkline(pts, sparkPoints),
    estimated: pts.some((p) => p.estimated === true),
    asOf: pts.at(-1)?.date ?? null,
  };
}

/** Mapa id -> CardStat (serializable para componentes cliente). */
export function cardStatsById(
  portfolios: readonly { id: string; slug: string }[],
  seriesById: Map<string, SeriesPointPct[]>,
): Record<string, CardStat> {
  const out: Record<string, CardStat> = {};
  for (const p of portfolios) out[p.id] = cardStatFromSeries(p.slug, seriesById.get(p.id));
  return out;
}
