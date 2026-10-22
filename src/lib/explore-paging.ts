/**
 * Paginación de la grilla de /explore (carga progresiva).
 * El servidor entrega la lista completa ya filtrada; la grilla muestra
 * PAGE_SIZE y suma de a PAGE_SIZE con "Cargar más" o al hacer scroll.
 */
export const PAGE_SIZE = 18;

export function firstPage<T>(list: readonly T[], size = PAGE_SIZE): T[] {
  return list.slice(0, size);
}

/** Cuántos mostrar después de pedir una página más. */
export function nextCount(total: number, shown: number, size = PAGE_SIZE): number {
  return Math.min(total, Math.max(0, shown) + size);
}

export function hasMore(total: number, shown: number): boolean {
  return shown < total;
}

/**
 * Consenso: en cuántas carteras distintas aparece cada símbolo.
 * Recibe filas (portfolio_id, symbol) de una sola consulta.
 */
export function consensusFromRows(
  rows: readonly { portfolio_id: string; symbol: string }[],
  limit = 7,
): { symbol: string; count: number }[] {
  const perSymbol = new Map<string, Set<string>>();
  for (const row of rows) {
    const symbol = (row.symbol ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const set = perSymbol.get(symbol) ?? new Set<string>();
    set.add(row.portfolio_id);
    perSymbol.set(symbol, set);
  }
  return [...perSymbol.entries()]
    .map(([symbol, set]) => ({ symbol, count: set.size }))
    .sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}

/** Ids de portafolios que tienen el símbolo (ya en mayúsculas). */
export function portfolioIdsWithSymbol(
  rows: readonly { portfolio_id: string; symbol: string }[],
  symbol: string,
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if ((row.symbol ?? "").trim().toUpperCase() === symbol) ids.add(row.portfolio_id);
  }
  return ids;
}
