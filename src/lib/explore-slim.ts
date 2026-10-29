import type { Portfolio } from "@/lib/types";
import type { CardStat } from "@/lib/card-series";

/**
 * d62 (P2): payload mínimo para la grilla de Explorar. Solo los campos que
 * la tarjeta dibuja; sparklines a <= 60 puntos y 2 decimales.
 */
export type ExploreCardPortfolio = Pick<
  Portfolio,
  "id" | "slug" | "name" | "category" | "country" | "followers" | "premium" | "cover_image"
> & { portrait_image: string | null };

export interface SlimCardStat {
  pct: number | null;
  label: string;
  /** Retorno relativo al primer punto en %, 2 decimales, <= 60 puntos. */
  spark: number[];
  estimated: boolean;
}

export const SPARK_MAX_POINTS = 60;

const r2 = (v: number) => Math.round(v * 100) / 100;

export function toExploreCardPortfolio(p: Portfolio): ExploreCardPortfolio {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    country: p.country,
    followers: p.followers,
    premium: p.premium,
    cover_image: p.cover_image,
    portrait_image: p.portrait_image ?? null,
  };
}

/** Hasta n puntos equiespaciados (conserva primero y último). */
export function downsampleSpark(data: readonly number[], n = SPARK_MAX_POINTS): number[] {
  const clean = data.filter((v) => Number.isFinite(v));
  if (clean.length <= n) return [...clean];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(clean[Math.round((i * (clean.length - 1)) / (n - 1))]);
  return out;
}

/**
 * Niveles (1 + r) a % relativo al primer punto con 2 decimales. La forma
 * se conserva (la sparkline normaliza por min/max).
 */
export function slimSpark(levels: readonly number[], n = SPARK_MAX_POINTS): number[] {
  const pts = downsampleSpark(levels, n);
  if (pts.length < 2) return [];
  const base = pts[0];
  if (!(base > 0)) return pts.map(r2);
  return pts.map((v) => r2((v / base - 1) * 100));
}

export function toSlimCardStat(s: CardStat | null | undefined): SlimCardStat | null {
  if (!s) return null;
  return {
    pct: s.pct === null ? null : r2(s.pct),
    label: s.label,
    spark: slimSpark(s.spark),
    estimated: s.estimated,
  };
}

/** Mapa id -> stat recortado; omite entradas sin cifra ni gráfico. */
export function slimCardStats(
  ids: readonly string[],
  stats: Record<string, CardStat>,
): Record<string, SlimCardStat> {
  const out: Record<string, SlimCardStat> = {};
  for (const id of ids) {
    const s = toSlimCardStat(stats[id]);
    if (s && (s.pct !== null || s.spark.length > 0)) out[id] = s;
  }
  return out;
}