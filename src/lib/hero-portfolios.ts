import type { Portfolio } from "@/lib/types";

/**
 * Tarjeta de portafolio para los mockups del hero.
 *
 * `followers: null` significa que no hay dato de seguidores: la UI no
 * inventa la cifra (y tampoco escribe "0 seguidores" cuando es 0).
 * `isExample` se conserva por retrocompatibilidad con `PhoneMockups`, pero
 * el hero ya no inyecta tarjetas de muestra: solo hay datos reales.
 */
export interface HeroCard {
  slug: string;
  name: string;
  manager: string | null;
  returnPct: number;
  followers: number | null;
  isExample: boolean;
  /** Para el avatar (D4). */
  category: import("@/lib/types").PortfolioCategory;
  cover_image: string | null;
  portrait_image: string | null;
  /** D28: etiqueta del periodo del retorno ("desde ago 2025", "YTD"). */
  periodLabel?: string;
  /** D28: niveles para el sparkline (vacío = sin gráfico). */
  spark?: number[];
  /** D28: la serie incluye puntos estimados. */
  estimated?: boolean;
  /** D28: tarjeta destacada (centro). */
  featured?: boolean;
  /** D29: fecha del último dato de la serie (ISO). */
  asOf?: string;
  /**
   * D6: serie real recortada (`clipSeriesForSlug`), en orden cronológico y
   * con `value_pct` finito. Mismo formato que `PortfolioCardChart`, para que
   * `PhoneMockups` haga `<PortfolioCardChart series={card.series ?? []} />`
   * con selector 1M/3M/6M/1A/MAX (1A por defecto). `undefined` = sin serie
   * real: no se dibuja gráfico ni se inventa una cifra.
   */
  series?: { date: string; value_pct: number }[];
}

/**
 * Elige hasta `count` portafolios para el hero.
 *
 * Reglas:
 * - Solo portafolios no premium: los retornos de los premium están
 *   detrás del muro de pago y no se muestran a quien no paga.
 * - Solo con `return_ytd` conocido y finito: no se inventa una cifra.
 * - Orden estable: más seguidores primero, y a igual número por nombre.
 */
export function pickHeroPortfolios(
  portfolios: Portfolio[],
  count = 3,
): HeroCard[] {
  return portfolios
    .filter((p) => !p.premium && typeof p.return_ytd === "number" && Number.isFinite(p.return_ytd))
    .sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      manager: p.manager,
      returnPct: p.return_ytd as number,
      followers: p.followers,
      isExample: false,
      category: p.category,
      cover_image: p.cover_image,
      portrait_image: p.portrait_image ?? null,
    }));
}

/**
 * Tarjetas del hero a partir del catálogo real.
 *
 * D6: se eliminó la muestra ilustrativa `"Ejemplo"` (portafolios y retornos
 * inventados de `portfolio-data.ts`, antes en `exampleHeroCards`). Si el
 * catálogo no entrega `count` portafolios reales con retorno conocido, se
 * devuelven los que haya: el hero muestra menos tarjetas antes que carteras
 * o cifras ficticias.
 */
export function buildHeroCards(
  portfolios: Portfolio[],
  count = 3,
): HeroCard[] {
  return pickHeroPortfolios(portfolios, count);
}
