/**
 * Flags de Mi portafolio + impacto de noticias (F58+). Apagados por defecto:
 * solo el valor exacto `"true"` (minúsculas) los enciende.
 *
 * Mismo criterio que `COMMUNITY_ENABLED` y `API_PUBLIC_ENABLED` para no
 * encender funciones legales/datos sensibles con valores como "1" o "TRUE".
 */

export const MY_PORTFOLIO_FLAG = "MY_PORTFOLIO_ENABLED";
export const NEWS_IMPACT_FLAG = "NEWS_IMPACT_ENABLED";

/** True solo con `MY_PORTFOLIO_ENABLED=true` (exacto). */
export function isMyPortfolioEnabled(): boolean {
  return process.env.MY_PORTFOLIO_ENABLED === "true";
}

/** True solo con `NEWS_IMPACT_ENABLED=true` (exacto). */
export function isNewsImpactEnabled(): boolean {
  return process.env.NEWS_IMPACT_ENABLED === "true";
}
