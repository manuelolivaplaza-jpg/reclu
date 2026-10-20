/**
 * Cruce/solape de carteras — lógica pura, sin acceso a datos.
 *
 * `/compare` ya no envía los holdings completos del catálogo al navegador.
 * El servidor calcula aquí el solape y la alineación con el rol del usuario:
 *  1. excluye portafolios `premium` para planes no pagos,
 *  2. recorta cada cartera a `HOLDING_LIMITS[role]` ANTES de calcular,
 *  3. devuelve solo filas agregadas (solape, símbolos en común, alineación).
 *
 * Así los símbolos ocultos por el muro no se pueden inferir desde el payload.
 */

import { HOLDING_LIMITS, canViewPremium, type AccessRole } from "@/lib/access";
import { computeAlignment, type AlignmentResult } from "@/lib/alignment";

export interface CompareHolding {
  symbol: string;
  weight: number;
}

/** Portafolio del catálogo con su libro completo (solo se usa en servidor). */
export interface ComparePortfolioInput {
  slug: string;
  name: string;
  returnYtd: number | null;
  premium: boolean;
  holdings: CompareHolding[];
}

/** Fila de cruce: activo con su peso en A, en B, o en ambos. */
export interface CompareOverlapRow {
  symbol: string;
  weightA: number;
  weightB: number;
  shared: boolean;
}

export interface CompareCross {
  overlapPct: number;
  shared: CompareOverlapRow[];
  onlyA: CompareOverlapRow[];
  onlyB: CompareOverlapRow[];
}

/** Resumen apto para el cliente: nunca incluye el libro completo. */
export interface ComparePortfolioSummary {
  slug: string;
  name: string;
  returnYtd: number | null;
  /** Posiciones visibles para el rol (ya recortadas). */
  holdingsCount: number;
  /** Solape con la cartera del usuario, 0-100. */
  overlapPct: number;
  /** Símbolos en común con el usuario, solo de posiciones visibles. */
  sharedSymbols: string[];
  /** Alineación usuario vs. portafolio, calculada sobre posiciones visibles. */
  alignment: AlignmentResult;
}

/** Cruce precalculado entre dos portafolios del catálogo. */
export interface ComparePairSummary {
  slugA: string;
  slugB: string;
  overlapPct: number;
  shared: { symbol: string; weightA: number; weightB: number }[];
  onlyA: { symbol: string; weight: number }[];
  onlyB: { symbol: string; weight: number }[];
}

export interface ComparePayload {
  portfolios: ComparePortfolioSummary[];
  pairs: ComparePairSummary[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Normaliza símbolos, suma duplicados y ordena por peso descendente. */
export function normalizeCompareHoldings(list: CompareHolding[]): CompareHolding[] {
  const map = new Map<string, number>();
  for (const holding of list) {
    const symbol = holding.symbol.trim().toUpperCase();
    if (!symbol) continue;
    const weight = Number.isFinite(holding.weight) ? holding.weight : 0;
    map.set(symbol, (map.get(symbol) ?? 0) + weight);
  }
  return [...map]
    .map(([symbol, weight]) => ({ symbol, weight }))
    .sort((a, b) => b.weight - a.weight);
}

/** Primeras N posiciones del rol (Infinity = todas). */
export function visibleHoldingsForRole(
  holdings: CompareHolding[],
  role: AccessRole,
): CompareHolding[] {
  const normalized = normalizeCompareHoldings(holdings);
  const limit = HOLDING_LIMITS[role];
  return Number.isFinite(limit) ? normalized.slice(0, limit) : normalized;
}

/**
 * Cruce entre dos carteras ya visibles:
 *  - overlapPct: suma de los MENORES pesos compartidos (0-100).
 *  - shared: acciones en común lado a lado.
 *  - onlyA / onlyB: exclusivas de cada lado.
 */
export function computeCompareCross(a: CompareHolding[], b: CompareHolding[]): CompareCross {
  const mapA = new Map(normalizeCompareHoldings(a).map((h) => [h.symbol, h.weight]));
  const mapB = new Map(normalizeCompareHoldings(b).map((h) => [h.symbol, h.weight]));

  const shared: CompareOverlapRow[] = [];
  const onlyA: CompareOverlapRow[] = [];
  const onlyB: CompareOverlapRow[] = [];
  let overlap = 0;

  for (const [symbol, weightA] of mapA) {
    const weightB = mapB.get(symbol);
    if (weightB !== undefined) {
      shared.push({ symbol, weightA, weightB, shared: true });
      overlap += Math.min(weightA, weightB);
    } else {
      onlyA.push({ symbol, weightA, weightB: 0, shared: false });
    }
  }
  for (const [symbol, weightB] of mapB) {
    if (!mapA.has(symbol)) {
      onlyB.push({ symbol, weightA: 0, weightB, shared: false });
    }
  }

  shared.sort((x, y) => y.weightA + y.weightB - (x.weightA + x.weightB));
  onlyA.sort((x, y) => y.weightA - x.weightA);
  onlyB.sort((x, y) => y.weightB - x.weightB);

  return {
    overlapPct: round1(overlap),
    shared,
    onlyA,
    onlyB,
  };
}

/**
 * Construye el payload de `/compare` aplicando el muro antes de calcular:
 * filtra premium y recorta cada cartera al límite del rol.
 */
export function buildComparePayload(input: {
  role: AccessRole;
  userHoldings: CompareHolding[];
  portfolios: ComparePortfolioInput[];
}): ComparePayload {
  const allowed = input.portfolios.filter(
    (portfolio) => !portfolio.premium || canViewPremium(input.role),
  );

  const visible = allowed.map((portfolio) => ({
    ...portfolio,
    holdings: visibleHoldingsForRole(portfolio.holdings, input.role),
  }));

  const userVisible = normalizeCompareHoldings(input.userHoldings);

  const portfolios: ComparePortfolioSummary[] = visible.map((portfolio) => {
    const cross = computeCompareCross(userVisible, portfolio.holdings);
    return {
      slug: portfolio.slug,
      name: portfolio.name,
      returnYtd: portfolio.returnYtd,
      holdingsCount: portfolio.holdings.length,
      overlapPct: cross.overlapPct,
      sharedSymbols: cross.shared.map((row) => row.symbol),
      alignment: computeAlignment(userVisible, portfolio.holdings),
    };
  });

  const pairs: ComparePairSummary[] = [];
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const cross = computeCompareCross(visible[i].holdings, visible[j].holdings);
      pairs.push({
        slugA: visible[i].slug,
        slugB: visible[j].slug,
        overlapPct: cross.overlapPct,
        shared: cross.shared.map((row) => ({
          symbol: row.symbol,
          weightA: row.weightA,
          weightB: row.weightB,
        })),
        onlyA: cross.onlyA.map((row) => ({ symbol: row.symbol, weight: row.weightA })),
        onlyB: cross.onlyB.map((row) => ({ symbol: row.symbol, weight: row.weightB })),
      });
    }
  }

  return { portfolios, pairs };
}
