/**
 * Duplicados de slug con 301 al canónico (B7 / T3).
 *
 * Seis portafolios existen dos veces en la base: una fila con el slug
 * histórico y otra con el sufijo `-13f` (la que se queda como canónica).
 * La decisión cerrada 3 prohíbe migraciones y desactivaciones: los duplicados
 * se resuelven solo con redirección permanente y enlaces internos. Este módulo
 * es la única fuente de verdad de esos pares; lo consumen `next.config.ts`
 * (redirects), `demo-data.ts` y los tests.
 *
 * TS puro, sin imports: `next.config.ts` lo carga en tiempo de config y no
 * debe arrastrar React ni el runtime de Next.
 */

/** Slug histórico → slug canónico (`-13f`, el que se indexa). */
export const LEGACY_PORTFOLIO_SLUGS: Readonly<Record<string, string>> = {
  "scion-asset-management": "scion-13f",
  "duquesne-family-office": "duquesne-13f",
  "mubadala-sovereign": "mubadala-13f",
  "pif-saudi": "pif-13f",
  "softbank-vision": "softbank-13f",
  "bridgewater-all-weather": "bridgewater-13f",
};

/**
 * True solo si el slug está en el mapa (no para propiedades heredadas como
 * `__proto__` o `constructor`, que existen en cualquier objeto).
 */
export function isLegacyPortfolioSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_PORTFOLIO_SLUGS, slug);
}

/**
 * Slug canónico para un slug histórico. Es idempotente: un slug que ya es
 * canónico (o que no está en el mapa) se devuelve tal cual.
 */
export function canonicalPortfolioSlug(slug: string): string {
  return isLegacyPortfolioSlug(slug) ? LEGACY_PORTFOLIO_SLUGS[slug] : slug;
}
