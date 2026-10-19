/**
 * radar-rules.ts — Reglas del Radar IA en TypeScript (F7).
 *
 * ESPEJO de scrapers/radar_ia.py (build_radar): mismas reglas, mismo
 * ordenamiento. Existe para poder testear la especificación con Vitest y
 * para que el frontend pueda explicar las reglas en la UI. Si cambias una,
 * cambia la otra (los tests verifican la coherencia básica).
 *
 * Reglas (transparentes, deterministas):
 *   1. Consenso: símbolo presente en >= minHolders carteras (peso > 0).
 *   2. Momentum: return_pct promedio desde declaración (0 si no hay dato).
 *   Score = z(consenso) + z(momentum). Top N con pesos decrecientes
 *   normalizados a 100.
 */

export interface RadarRow {
  portfolioId: string;
  symbol: string;
  weight: number;
  returnPct: number | null;
}

export interface RadarPick {
  symbol: string;
  weight: number;
  score: number;
  holderCount: number;
}

export const RADAR_MIN_HOLDERS = 3;
export const RADAR_TOP_N = 9;
/** Pesos decrecientes; se normalizan a 100. */
export const RADAR_WEIGHT_STEPS = [18, 16, 14, 12, 10, 10, 8, 6, 6];

function zScores(values: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  if (values.size === 0) return out;
  const list = [...values.values()];
  const mean = list.reduce((s, v) => s + v, 0) / list.length;
  const variance =
    list.length > 1
      ? list.reduce((s, v) => s + (v - mean) * (v - mean), 0) / list.length
      : 0;
  const stdev = Math.sqrt(variance);
  for (const [key, value] of values) {
    out.set(key, stdev === 0 ? 0 : (value - mean) / stdev);
  }
  return out;
}

/** Versión TS de build_radar (ver radar_ia.py). Lógica pura. */
export function buildRadar(
  rows: RadarRow[],
  minHolders: number = RADAR_MIN_HOLDERS,
  topN: number = RADAR_TOP_N,
  weightSteps: number[] = RADAR_WEIGHT_STEPS,
): RadarPick[] {
  const holdersBySymbol = new Map<string, Set<string>>();
  const returnsBySymbol = new Map<string, number[]>();

  for (const row of rows) {
    const symbol = row.symbol.trim().toUpperCase();
    if (!symbol || row.weight <= 0) continue;
    if (!holdersBySymbol.has(symbol)) holdersBySymbol.set(symbol, new Set());
    holdersBySymbol.get(symbol)!.add(row.portfolioId);
    if (typeof row.returnPct === "number" && Number.isFinite(row.returnPct)) {
      if (!returnsBySymbol.has(symbol)) returnsBySymbol.set(symbol, []);
      returnsBySymbol.get(symbol)!.push(row.returnPct);
    }
  }

  // Regla 1 — consenso.
  const consensus = new Map<string, number>();
  for (const [symbol, portfolios] of holdersBySymbol) {
    if (portfolios.size >= minHolders) consensus.set(symbol, portfolios.size);
  }
  if (consensus.size === 0) return [];

  // Regla 2 — momentum medio.
  const momentum = new Map<string, number>();
  for (const symbol of consensus.keys()) {
    const rets = returnsBySymbol.get(symbol) ?? [];
    momentum.set(
      symbol,
      rets.length > 0 ? rets.reduce((s, v) => s + v, 0) / rets.length : 0,
    );
  }

  const zConsensus = zScores(consensus);
  const zMomentum = zScores(momentum);
  const score = new Map<string, number>();
  for (const symbol of consensus.keys()) {
    score.set(
      symbol,
      (zConsensus.get(symbol) ?? 0) + (zMomentum.get(symbol) ?? 0),
    );
  }

  const ranked = [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.min(topN, weightSteps.length));

  const rawWeights = ranked.map((_, i) => weightSteps[i]);
  const scale = rawWeights.reduce((s, v) => s + v, 0) / 100;

  return ranked.map(([symbol, value], i) => ({
    symbol,
    weight: Math.round((rawWeights[i] / scale) * 100) / 100,
    score: value,
    holderCount: consensus.get(symbol) ?? 0,
  }));
}
