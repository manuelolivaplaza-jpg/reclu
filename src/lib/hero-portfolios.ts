import type { Portfolio } from "@/lib/types";
import { HERO_PORTFOLIOS } from "@/components/sections/portfolio-data";

/**
 * Tarjeta de portafolio para los mockups del hero.
 *
 * `followers: null` significa que no hay dato de seguidores (por ejemplo
 * en la muestra ilustrativa): la UI no inventa la cifra.
 * `isExample: true` marca las tarjetas de muestra, para no presentarlas
 * como datos reales de mercado.
 */
export interface HeroCard {
  slug: string;
  name: string;
  manager: string | null;
  returnPct: number;
  followers: number | null;
  isExample: boolean;
}

/**
 * Elige hasta `count` portafolios para el hero.
 *
 * Reglas:
 * - Solo portafolios no premium: los retornos de los premium están
 *   detrás del muro de pago y no se muestran a quien no paga.
 * - Solo con `return_ytd` conocido: no se inventa una cifra.
 * - Orden estable: más seguidores primero, y a igual número por nombre.
 */
export function pickHeroPortfolios(
  portfolios: Portfolio[],
  count = 3,
): HeroCard[] {
  return portfolios
    .filter((p) => !p.premium && typeof p.return_ytd === "number")
    .sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      manager: p.manager,
      returnPct: p.return_ytd as number,
      followers: p.followers,
      isExample: false,
    }));
}

/**
 * Muestra ilustrativa (sin base de datos): los tres portafolios de
 * `portfolio-data.ts`, marcados como ejemplo.
 */
export function exampleHeroCards(): HeroCard[] {
  return HERO_PORTFOLIOS.map((p) => ({
    slug: p.slug,
    name: p.name,
    manager: p.meta,
    returnPct: p.returnPct,
    followers: null,
    isExample: true,
  }));
}

/**
 * Tarjetas del hero: primero las reales y, si faltan, se completa con la
 * muestra ilustrativa (marcada "Ejemplo") para no dejar el grupo vacío.
 */
export function buildHeroCards(
  portfolios: Portfolio[],
  count = 3,
): HeroCard[] {
  const real = pickHeroPortfolios(portfolios, count);
  if (real.length >= count) return real;
  const examples = exampleHeroCards().slice(0, count - real.length);
  return [...real, ...examples];
}
