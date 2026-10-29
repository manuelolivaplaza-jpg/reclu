import { clipSeriesForSlug } from "@/lib/card-series";
import type { Holding, Portfolio } from "@/lib/types";

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
  returns: { d1: number | null; w1: number | null; m1: number | null; y1: number | null };
  /** Serie para el gráfico: retorno acumulado rebasado al primer punto visible. */
  chart: { date: string; pct: number }[];
  estimated: boolean;
  top: { symbol: string; name: string; weight: number }[];
}

type Pt = { date: string; value: number; estimated?: boolean };

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** Retorno entre el último punto y el último punto con fecha <= fin − días. */
function periodReturn(pts: Pt[], days: number, maxGapDays: number): number | null {
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const target = t(last.date) - days * DAY;
  let base: Pt | null = null;
  for (let i = pts.length - 2; i >= 0; i--) {
    if (t(pts[i].date) <= target) {
      base = pts[i];
      break;
    }
  }
  if (!base || target - t(base.date) > maxGapDays * DAY) return null;
  const a = 1 + base.value / 100;
  if (a <= 0) return null;
  const r = ((1 + last.value / 100) / a - 1) * 100;
  return Number.isFinite(r) ? r : null;
}

/** Hasta n puntos equiespaciados, conservando siempre el último. */
function downsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return out;
}

/**
 * Arma una diapositiva solo con datos reales. El gráfico respeta el muro:
 * Free ve los últimos 90 días, de pago el último año. Nunca se envía la serie
 * completa al navegador.
 */
export function buildSlide(
  p: Portfolio,
  series: Pt[] | undefined,
  holdings: Holding[],
  opts: { isFollowing: boolean; isPro: boolean },
): FeaturedSlide {
  const pts = clipSeriesForSlug(p.slug, (series ?? []).filter((x) => Number.isFinite(x.value)));
  const windowDays = opts.isPro ? 366 : 90;
  const lastT = pts.length ? t(pts[pts.length - 1].date) : 0;
  const visible = pts.filter((x) => t(x.date) >= lastT - windowDays * DAY);
  const base = visible.length ? 1 + visible[0].value / 100 : 1;
  const chart =
    visible.length >= 2 && base > 0
      ? downsample(visible, 160).map((x) => ({
          date: x.date.slice(0, 10),
          pct: Math.round(((1 + x.value / 100) / base - 1) * 10000) / 100,
        }))
      : [];

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
      y1: periodReturn(pts, 365, 20),
    },
    chart,
    estimated: visible.some((x) => x.estimated === true),
    top,
  };
}
