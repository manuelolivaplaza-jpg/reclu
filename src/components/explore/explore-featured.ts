import { clipSeriesForSlug } from "@/lib/card-series";
import type { Holding, Portfolio } from "@/lib/types";
import { returnSinceStart, windowReturnPct } from "@/lib/returns";
import { holdingLimitFor, type AccessRole } from "@/lib/access";

import { HERO_PERIODS, type HeroPeriod } from "@/components/explore/explore-periods";
export { HERO_PERIODS, type HeroPeriod };

export type ChartPoint = { date: string; pct: number };

/** Datos planos (serializables) de una diapositiva del carrusel de Explorar. */
export interface FeaturedSlide {
  id: string;
  slug: string;
  name: string;
  category: Portfolio["category"];
  cover_image: string | null;
  portrait_image: string | null;
  premium: boolean;
  followers: number;
  isFollowing: boolean;
  /** Retornos reales por período; null = sin dato ("—"). */
  returns: Record<HeroPeriod, number | null>;
  /** d68: serie por período (rebasada al primer punto). Ausente = sin datos o bloqueado. */
  charts: Partial<Record<HeroPeriod, ChartPoint[]>>;
  /** Períodos cerrados por el muro de pago (Free ve hasta 3M). */
  lockedPeriods: HeroPeriod[];
  /** Período inicial: 1A si existe, si no el más largo disponible. */
  defaultPeriod: HeroPeriod;
  estimated: boolean;
  top: { symbol: string; name: string; weight: number }[];
  holdingsLocked: boolean;
}

type Pt = { date: string; value: number; estimated?: boolean };

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const PERIOD_DAYS: Record<HeroPeriod, number> = { d1: 1, w1: 7, m1: 30, m3: 91, y1: 365, max: Infinity };

/** d69: retorno compuesto de la ventana (fuente única en lib/returns). */
export function periodReturn(pts: Pt[], days: number, maxGapDays: number): number | null {
  return windowReturnPct(pts, days, maxGapDays);
}

/** Hasta n puntos equiespaciados, conservando siempre el último. */
function downsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return out;
}

/** Serie del período rebasada a 0% en su primer punto (null si < 2 puntos). */
export function periodChart(pts: Pt[], period: HeroPeriod): ChartPoint[] | null {
  if (pts.length < 2) return null;
  const lastT = t(pts[pts.length - 1].date);
  const days = PERIOD_DAYS[period];
  let visible: Pt[];
  if (!Number.isFinite(days)) visible = pts;
  else {
    const from = lastT - days * DAY;
    const firstIn = pts.findIndex((x) => t(x.date) >= from);
    // Incluye el punto anterior a la ventana como base (así 1D compara con el cierre previo).
    const start = firstIn <= 0 ? 0 : firstIn - 1;
    visible = pts.slice(start);
  }
  if (visible.length < 2) return null;
  const base = 1 + visible[0].value / 100;
  if (base <= 0) return null;
  return downsample(visible, 160).map((x) => ({
    date: x.date.slice(0, 10),
    pct: Math.round(((1 + x.value / 100) / base - 1) * 10000) / 100,
  }));
}

/**
 * Arma una diapositiva solo con datos reales. El gráfico respeta el muro:
 * Free ve hasta 3M; 1A y Máx quedan para planes pagados. Nunca se envía la
 * serie completa a quien no tiene acceso.
 */
export function buildSlide(
  p: Portfolio,
  series: Pt[] | undefined,
  holdings: Holding[],
  opts: { isFollowing: boolean; isPro: boolean; role: AccessRole },
): FeaturedSlide {
  const pts = clipSeriesForSlug(p.slug, (series ?? []).filter((x) => Number.isFinite(x.value)));
  const charts: Partial<Record<HeroPeriod, ChartPoint[]>> = {};
  // Rendimiento público: ningún período bloqueado (lo pagado son las posiciones).
  const lockedPeriods: HeroPeriod[] = [];
  for (const { key } of HERO_PERIODS) {
    const c = periodChart(pts, key);
    if (c) charts[key] = c;
  }
  const order: HeroPeriod[] = ["y1", "max", "m3", "m1", "w1", "d1"];
  const defaultPeriod = order.find((k) => charts[k]) ?? "y1";

  const top = holdings
    .filter((h) => h.asset_class !== "cash" && Number.isFinite(Number(h.weight)))
    .toSorted((a, b) => Number(b.weight) - Number(a.weight))
    .slice(0, 4)
    .map((h) => ({ symbol: h.symbol, name: h.name ?? h.symbol, weight: Number(h.weight) }));

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    cover_image: p.cover_image,
    portrait_image: p.portrait_image ?? null,
    premium: p.premium,
    followers: p.followers,
    isFollowing: opts.isFollowing,
    returns: {
      d1: periodReturn(pts, 1, 5),
      w1: periodReturn(pts, 7, 7),
      m1: periodReturn(pts, 30, 10),
      m3: periodReturn(pts, 91, 15),
      y1: periodReturn(pts, 365, 20),
      max: returnSinceStart(pts),
    },
    charts,
    lockedPeriods,
    defaultPeriod,
    estimated: pts.some((x) => x.estimated === true),
    top,
    holdingsLocked: holdingLimitFor(opts.role, p) === 0 || (p.premium && !opts.isPro),
  };
}

/** La diapositiva tiene al menos un gráfico real. */
export const slideHasSeries = (s: FeaturedSlide) => Object.keys(s.charts).length > 0;
