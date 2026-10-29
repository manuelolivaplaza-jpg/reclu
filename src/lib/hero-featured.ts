import { returnSinceStart } from "@/lib/returns";
import type { Portfolio } from "@/lib/types";
import type { HeroCard } from "@/lib/hero-portfolios";
import { clipSeriesForSlug } from "@/lib/card-series";

/**
 * Tarjetas destacadas del hero (D28): Berkshire a la izquierda, Trump dice
 * al centro (destacada) e iShares Bitcoin Trust a la derecha.
 *
 * El retorno sale de la serie real de `portfolio_performance` (acumulado
 * desde el primer punto disponible). Sin serie se usa `return_ytd`; sin
 * ninguno de los dos, la tarjeta no se muestra (no se inventan cifras).
 */
export const FEATURED_HERO_SLUGS = ["berkshire-hathaway", "trump-dice", "ibit"] as const;
export const FEATURED_CENTER_SLUG = "trump-dice";

/**
 * D66: la serie real de Berkshire vive en el portafolio del 13F
 * ("berkshire-hathaway-13f", cargado por load_13f/compute_returns); la fila
 * de catalogo "berkshire-hathaway" no tiene puntos en portfolio_performance,
 * por eso la tarjeta salia sin grafico y con "YTD (estimado)". Si el slug
 * destacado no tiene serie, se usa la del alias y la tarjeta enlaza a el.
 */
export const FEATURED_SERIES_ALIAS: Record<string, string> = {
  "berkshire-hathaway": "berkshire-hathaway-13f",
};

/** Slugs cuyas series hay que pedir para el hero (destacados + alias). */
export function featuredSeriesSlugs(): string[] {
  return [...FEATURED_HERO_SLUGS, ...Object.values(FEATURED_SERIES_ALIAS)];
}

export interface SeriesPointPct {
  date: string;
  /** Retorno acumulado en % (value_pct). */
  value: number;
  estimated?: boolean;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2025-08-06" -> "ago 2025". */
export function monthYear(iso: string): string {
  const [y, m] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  return month && y ? `${month} ${y}` : iso;
}

/** Retorno acumulado (%) entre el primer y el último punto de una serie de value_pct. */
export function cumulativeFromPct(series: SeriesPointPct[]): number | null {
  const pct = returnSinceStart(series);
  return pct === null ? null : Math.round(pct * 10) / 10;
}

/** Hasta `n` puntos equiespaciados (niveles base 1) para el sparkline. */
export function sparkline(series: SeriesPointPct[], n = 48): number[] {
  const pts = (series ?? []).filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return [];
  if (pts.length <= n) return pts.map((p) => 1 + p.value / 100);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (pts.length - 1)) / (n - 1));
    out.push(1 + pts[idx].value / 100);
  }
  return out;
}

export function buildFeaturedHeroCards(
  portfolios: Portfolio[],
  seriesById: Map<string, SeriesPointPct[]>,
): HeroCard[] {
  const cards: HeroCard[] = [];
  for (const slug of FEATURED_HERO_SLUGS) {
    const p = portfolios.find((item) => item.slug === slug);
    if (!p) continue;
    // D40: misma serie y mismo recorte que /trump-dice y el detalle.
    let series = clipSeriesForSlug(p.slug, seriesById.get(p.id) ?? []);
    let cum = cumulativeFromPct(series);
    let linkSlug = p.slug;
    const aliasSlug = FEATURED_SERIES_ALIAS[slug];
    const alias = aliasSlug ? portfolios.find((item) => item.slug === aliasSlug) : undefined;
    if (cum === null && alias) {
      const aliasSeries = clipSeriesForSlug(alias.slug, seriesById.get(alias.id) ?? []);
      const aliasCum = cumulativeFromPct(aliasSeries);
      if (aliasCum !== null) {
        series = aliasSeries;
        cum = aliasCum;
        linkSlug = alias.slug;
      }
    }
    let returnPct: number | null = null;
    let periodLabel = "";
    if (cum !== null) {
      returnPct = cum;
      periodLabel = `desde ${monthYear(series[0].date)}`;
    } else if (typeof p.return_ytd === "number") {
      // D40: sin serie real la cifra es la estática del catálogo: se rotula.
      returnPct = p.return_ytd;
      periodLabel = "YTD (estimado, sin serie real)";
    }
    if (returnPct === null) continue;
    cards.push({
      slug: linkSlug,
      name: p.name,
      manager: p.manager,
      returnPct,
      followers: p.followers,
      isExample: false,
      category: p.category,
      cover_image: p.cover_image,
      portrait_image: p.portrait_image ?? null,
      periodLabel,
      spark: cum !== null ? sparkline(series) : [],
      estimated: series.some((pt) => pt.estimated === true),
      featured: slug === FEATURED_CENTER_SLUG,
      asOf: cum !== null ? [...series].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date : undefined,
    });
  }
  return cards;
}
