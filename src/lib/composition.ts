/**
 * Composición de un portafolio (D39).
 *
 * `holdings` guarda un snapshot por `as_of` y el scraper no borra los
 * anteriores. Si se muestran todos, un símbolo aparece una vez por snapshot
 * (Trump dice: DELL 46,4% + 40,0% + 39,2%) y los pesos suman más de 100%.
 * Aquí: 1) solo el último as_of, 2) una fila por símbolo, 3) pesos que
 * suman 100% cuando la lista está completa (o si pasan de 100%).
 */

export interface SnapshotRow {
  symbol: string;
  weight: number;
  as_of?: string | null;
}

/** Filas del as_of más reciente. Filas sin fecha solo si ninguna la tiene. */
export function latestSnapshot<T extends { as_of?: string | null }>(rows: T[]): T[] {
  let latest = "";
  for (const r of rows) {
    const d = r.as_of ? String(r.as_of).slice(0, 10) : "";
    if (d > latest) latest = d;
  }
  if (!latest) return rows;
  return rows.filter((r) => (r.as_of ? String(r.as_of).slice(0, 10) : "") === latest);
}

const keyOf = (symbol: string) => (symbol ?? "").trim().toUpperCase();

/** Una fila por símbolo (suma pesos), orden por peso descendente. */
export function groupBySymbol<T extends SnapshotRow>(rows: T[]): T[] {
  const out = new Map<string, T>();
  for (const r of rows) {
    const k = keyOf(r.symbol);
    if (!k) continue;
    const w = Number.isFinite(Number(r.weight)) ? Number(r.weight) : 0;
    const prev = out.get(k);
    if (prev) out.set(k, { ...prev, weight: round2(Number(prev.weight) + w) });
    else out.set(k, { ...r, weight: round2(w) });
  }
  return [...out.values()].sort((a, b) => b.weight - a.weight || keyOf(a.symbol).localeCompare(keyOf(b.symbol)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Escala los pesos para que sumen 100. Con `complete` falso (lista recortada
 * por el muro de pago) solo se escala si pasan de 100: un top-N que suma 76%
 * es correcto y no debe inflarse.
 */
export function normalizeWeights<T extends { weight: number }>(rows: T[], opts: { complete: boolean }): T[] {
  const total = rows.reduce((s, r) => s + (r.weight > 0 ? r.weight : 0), 0);
  if (total <= 0) return rows;
  const off = Math.abs(total - 100) > 0.05;
  if (!off || (!opts.complete && total <= 100)) return rows;
  const positives = rows.filter((r) => r.weight > 0);
  let assigned = 0;
  return rows.map((r) => {
    if (!(r.weight > 0)) return { ...r, weight: 0 };
    const last = r === positives[positives.length - 1];
    const w = last ? round2(100 - assigned) : round2((r.weight / total) * 100);
    assigned = round2(assigned + w);
    return { ...r, weight: w };
  });
}

/** Holdings -> filas de la sección Composición. */
export function buildComposition<T extends SnapshotRow & { name?: string | null }>(
  holdings: T[],
  opts: { complete: boolean },
): { symbol: string; name: string; weight: number }[] {
  const grouped = groupBySymbol(latestSnapshot(holdings));
  return normalizeWeights(grouped, opts).map((h) => ({
    symbol: h.symbol,
    name: (h.name ?? h.symbol) as string,
    weight: h.weight,
  }));
}
