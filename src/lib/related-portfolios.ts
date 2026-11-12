/**
 * Enlaces internos de la ficha de portafolio (T3 · B8).
 *
 * Decisión cerrada 2: un ticker solo se puede enlazar si sus datos ya son
 * públicos — la lista global del sitio (`getKnownTickerSymbols`) o las
 * posiciones de una cartera abierta a anónimos (`holdingsOpenToAll`, hoy
 * `broker_cl`). Nunca las posiciones de un portafolio cerrado.
 *
 * Todo aquí es puro: sin async, sin DB, sin cookies. Así se puede testear
 * sin Supabase y el componente solo se encarga de pedir los datos.
 */

import { holdingsOpenToAll } from "@/lib/access";
import { canonicalPortfolioSlug, isLegacyPortfolioSlug } from "@/lib/portfolio-canonical";
import type { Portfolio } from "@/lib/types";

/** Tope de portafolios relacionados que dibuja la ficha. */
export const RELATED_PORTFOLIOS_LIMIT = 4;

/** Tope de acciones enlazadas en el bloque "Acciones más seguidas". */
export const RELATED_TICKERS_LIMIT = 8;

/** Forma mínima que devuelve `getKnownTickerSymbols` (contrato de B1). */
export interface KnownTicker {
  symbol: string;
  portfolioCount: number;
}

/** Símbolos razonables: letras, dígitos, punto, guion y barra (SQM-B, BRK.B). */
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-/]{0,11}$/;

/** MAYÚSCULAS y sin espacios; null si no parece un símbolo. */
function normalizeTickerSymbol(raw: string | null | undefined): string | null {
  const symbol = (raw ?? "").trim().toUpperCase();
  return SYMBOL_RE.test(symbol) ? symbol : null;
}

/**
 * Hasta 4 portafolios de la misma categoría que el actual, sin repetirlo y
 * sin slugs viejos (los que redirigen 301 al canónico). Orden: más seguidos
 * primero y, a igualdad, nombre alfabético (determinista para los tests).
 */
export function relatedPortfolios(
  slug: string,
  category: string | null,
  all: readonly Portfolio[],
): Portfolio[] {
  if (!category) return [];
  const current = canonicalPortfolioSlug(slug);
  return all
    .filter((portfolio) => portfolio.category === category)
    .filter((portfolio) => !isLegacyPortfolioSlug(portfolio.slug))
    .filter((portfolio) => canonicalPortfolioSlug(portfolio.slug) !== current)
    .toSorted(
      (a, b) =>
        b.followers - a.followers || a.name.localeCompare(b.name, "es"),
    )
    .slice(0, RELATED_PORTFOLIOS_LIMIT);
}

/**
 * Lista global del sitio: los símbolos con más carteras, en MAYÚSCULAS y sin
 * duplicados. Nunca sale de las posiciones del portafolio que se está viendo.
 */
export function relatedTickers(
  known: readonly KnownTicker[],
  limit: number = RELATED_TICKERS_LIMIT,
): string[] {
  const bySymbol = new Map<string, number>();
  for (const item of known) {
    const symbol = normalizeTickerSymbol(item?.symbol);
    if (!symbol) continue;
    const count =
      typeof item.portfolioCount === "number" && Number.isFinite(item.portfolioCount)
        ? Math.max(0, item.portfolioCount)
        : 0;
    const previous = bySymbol.get(symbol);
    if (previous === undefined || count > previous) bySymbol.set(symbol, count);
  }
  const top = Math.max(0, Math.trunc(limit));
  return [...bySymbol.entries()]
    .sort(([symbolA, countA], [symbolB, countB]) => countB - countA || symbolA.localeCompare(symbolB, "es"))
    .slice(0, top)
    .map(([symbol]) => symbol);
}

/**
 * Posiciones del portafolio actual que se pueden enlazar: solo si sus
 * posiciones ya son públicas (`holdingsOpenToAll`). Un portafolio cerrado
 * devuelve [] aunque tenga holdings; así nunca se filtra una posición de pago
 * por un enlace nuevo.
 */
export function openPortfolioTickers(
  portfolio: { category?: string | null; source?: string | null } | null | undefined,
  holdings: readonly { symbol: string }[] | null | undefined,
): string[] {
  if (!holdings || holdings.length === 0) return [];
  if (!holdingsOpenToAll(portfolio)) return [];
  const symbols: string[] = [];
  for (const holding of holdings) {
    const symbol = normalizeTickerSymbol(holding?.symbol);
    if (symbol && !symbols.includes(symbol)) symbols.push(symbol);
  }
  return symbols;
}
