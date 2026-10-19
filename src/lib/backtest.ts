/**
 * Backtest de combinación de portafolios — lógica pura, sin datos ni red.
 *
 * Arma una curva a partir de series que ya existen y de pesos objetivo:
 *  - `series` son, por defecto, retornos acumulados en % (columna
 *    `portfolio_performance.value_pct`, donde 0 es la base). Con
 *    `seriesScale: "level"` se leen como niveles, el mismo contrato que
 *    `computePerformanceMetrics`.
 *  - `benchmark` son cierres de SPY o del proxy del IPSA (`benchmark_prices`),
 *    salvo `benchmarkScale: "cumulative_pct"`.
 *  - La ventana parte el día en que todas las series ya tienen un nivel y
 *    termina el día en que la más corta se acaba. Un hueco mantiene el último
 *    nivel: no se inventa un retorno ni se alarga una serie muerta.
 *  - El rebalanceo (mensual o trimestral) se aplica al cierre del primer
 *    punto del nuevo período, después del retorno de ese día.
 *
 * Supuesto de entrada por defecto: "entrada a la fecha de publicación".
 * La función no corre la serie hacia atrás hasta la fecha de operación:
 * mide lo que ya era público. No ejecuta órdenes ni recomienda una cartera.
 *
 * TODO(F16): cuando existan `src/lib/legal.ts` y
 * `src/components/legal/legal-notice.tsx`, la UI debe mostrar el aviso
 * desde ahí. Este módulo deja el texto en `BACKTEST_DISCLAIMER`.
 */

import {
  alignByDate,
  computePerformanceMetrics,
  normalizeToBase100,
  parseDate,
  type PerformanceMetrics,
  type SeriesPoint,
} from "@/lib/performance";

export type RebalanceFrequency = "monthly" | "quarterly";

/** "level" = precio o índice. "cumulative_pct" = retorno acumulado en %. */
export type SeriesScale = "level" | "cumulative_pct";

/** Rótulo por defecto. La serie entra cuando la fuente publicó, no cuando se operó. */
export const PUBLICATION_ENTRY_LABEL = "entrada a la fecha de publicación";

/** Rótulo alternativo. No mueve la curva: solo cambia la etiqueta que declara el supuesto. */
export const TRADE_ENTRY_LABEL = "entrada a la fecha de la operación";

/**
 * Aviso fijo. Simulación histórica, sin órdenes y sin recomendación.
 * TODO(F16): reemplazar por el texto compartido de legal.ts en la UI.
 */
export const BACKTEST_DISCLAIMER =
  "Simulación histórica con fines informativos. No ejecuta órdenes ni es una recomendación de inversión.";

export interface RunBacktestInput {
  /** Series por id (slug o id del portafolio). Una clave, una serie. */
  series: Record<string, SeriesPoint[]>;
  /** Peso objetivo por id. Los pesos positivos se normalizan para sumar 1. */
  weights: Record<string, number>;
  rebalance: RebalanceFrequency;
  /** Cierres del benchmark (SPY o proxy del IPSA), si se quiere comparar. */
  benchmark?: SeriesPoint[];
  /** Símbolo para rotular la comparación ("SPY", "^IPSA"). No cambia el cálculo. */
  benchmarkSymbol?: string | null;
  /** Escala de `series`. Por defecto, retorno acumulado en %. */
  seriesScale?: SeriesScale;
  /** Escala de `benchmark`. Por defecto, nivel de cierre. */
  benchmarkScale?: SeriesScale;
  /** Supuesto de entrada. Vacío o ausente => fecha de publicación. */
  entryLabel?: string;
  /** Tasa libre de riesgo anual (%) que usa el Sharpe. Por defecto 4. */
  riskFreePct?: number;
}

export interface BacktestResult {
  /** Curva combinada en nivel, base 100 el primer día de la ventana. */
  curve: SeriesPoint[];
  /** Benchmark en las fechas comunes, base 100 en la primera. Vacío si no hay. */
  benchmarkCurve: SeriesPoint[];
  metrics: PerformanceMetrics;
  /** Pesos objetivo que entraron al cálculo, ya normalizados. */
  targetWeights: Record<string, number>;
  /** Ids usados, en orden estable. */
  sleeves: string[];
  rebalance: RebalanceFrequency;
  /** "mensual" o "trimestral". */
  rebalanceLabel: string;
  /** Cierres en los que se volvió a los pesos objetivo. No incluye el inicio. */
  rebalanceDates: string[];
  entryLabel: string;
  /** Frase metodológica, en español, lista para mostrar junto a la curva. */
  methodLabel: string;
  benchmarkSymbol: string | null;
  /** Primera y última fecha de la ventana común. Null si no se armó. */
  start: string | null;
  end: string | null;
  disclaimer: string;
  /** Aclaraciones que no impiden calcular (normalización, huecos, pesos omitidos). */
  notes: string[];
  /** Por qué no hay curva. Vacío cuando el cálculo se hizo. */
  reasons: string[];
}

interface PreparedSleeve {
  id: string;
  weight: number;
  points: SeriesPoint[];
}

function roundLevel(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function resolveScale(value: SeriesScale | undefined, fallback: SeriesScale): SeriesScale {
  return value === "level" || value === "cumulative_pct" ? value : fallback;
}

function resolveEntryLabel(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : PUBLICATION_ENTRY_LABEL;
}

function resolveSymbol(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function rebalanceLabel(rebalance: RebalanceFrequency): string {
  return rebalance === "monthly" ? "mensual" : "trimestral";
}

function methodLabel(rebalance: RebalanceFrequency, entryLabel: string): string {
  const entry = entryLabel.charAt(0).toUpperCase() + entryLabel.slice(1);
  return `Pesos objetivo con rebalanceo ${rebalanceLabel(rebalance)} al cierre. ${entry}. Sin comisiones ni dividendos.`;
}

function periodKey(date: string, rebalance: RebalanceFrequency): string {
  if (rebalance === "monthly") return date.slice(0, 7);
  const month = Number(date.slice(5, 7));
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${date.slice(0, 4)}-Q${quarter}`;
}

/** A nivel. El retorno acumulado puede ser 0 o negativo; el nivel tiene que quedar > 0. */
function toLevelSeries(points: SeriesPoint[] | undefined, scale: SeriesScale): SeriesPoint[] {
  if (!Array.isArray(points)) return [];
  const parsed: SeriesPoint[] = [];
  for (const point of points) {
    if (!point || typeof point.date !== "string") continue;
    if (!Number.isFinite(point.value) || !Number.isFinite(parseDate(point.date))) continue;
    const date = point.date.slice(0, 10);
    const level = scale === "cumulative_pct" ? 100 * (1 + point.value / 100) : point.value;
    if (!Number.isFinite(level) || level <= 0) continue;
    parsed.push({ date, value: roundLevel(level) });
  }
  parsed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const deduped: SeriesPoint[] = [];
  for (const point of parsed) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.date === point.date) previous.value = point.value;
    else deduped.push(point);
  }
  return deduped;
}

interface WeightResolution {
  weights: Record<string, number>;
  fundedIds: string[];
  notes: string[];
  error: string | null;
}

function resolveWeights(seriesIds: string[], weights: Record<string, number> | undefined): WeightResolution {
  const notes: string[] = [];
  if (!weights || typeof weights !== "object") {
    return { weights: {}, fundedIds: [], notes, error: "Faltan los pesos." };
  }

  for (const id of Object.keys(weights).sort()) {
    const raw = weights[id];
    if (!Number.isFinite(raw)) {
      return {
        weights: {},
        fundedIds: [],
        notes,
        error: `El peso de "${id}" no es un número finito.`,
      };
    }
    if (raw < 0) {
      return {
        weights: {},
        fundedIds: [],
        notes,
        error: "Hay pesos negativos. El backtest no simula posiciones cortas.",
      };
    }
  }

  const seriesSet = new Set(seriesIds);
  for (const id of Object.keys(weights).sort()) {
    if (!seriesSet.has(id)) notes.push(`El peso de "${id}" no tiene serie y se ignora.`);
  }

  const funded: Record<string, number> = {};
  for (const id of seriesIds) {
    if (!Object.hasOwn(weights, id)) {
      notes.push(`Sin peso para "${id}"; esa serie no entra.`);
      continue;
    }
    const raw = weights[id];
    if (raw === 0) {
      notes.push(`Peso 0 para "${id}"; esa serie no entra.`);
      continue;
    }
    funded[id] = raw;
  }

  const fundedIds = Object.keys(funded).sort();
  const sum = fundedIds.reduce((total, id) => total + funded[id], 0);
  if (!(sum > 0)) {
    return { weights: {}, fundedIds: [], notes, error: "Los pesos utilizables suman 0." };
  }

  const normalized: Record<string, number> = {};
  for (const id of fundedIds) normalized[id] = funded[id] / sum;
  if (Math.abs(sum - 1) > 1e-6) notes.push("Los pesos se normalizaron para sumar 1.");
  return { weights: normalized, fundedIds, notes, error: null };
}

interface CombineSuccess {
  ok: true;
  curve: SeriesPoint[];
  rebalanceDates: string[];
  start: string;
  end: string;
  carried: boolean;
}

interface CombineFailure {
  ok: false;
  reason: string;
  start: string | null;
  end: string | null;
}

/**
 * Combina niveles con pesos que flotan entre rebalanceos.
 * Cada manga ya tiene al menos un punto > 0, ordenado y sin fechas repetidas.
 */
function combine(sleeves: PreparedSleeve[], rebalance: RebalanceFrequency): CombineSuccess | CombineFailure {
  const firstDate = (sleeve: PreparedSleeve) => sleeve.points[0].date;
  const lastDate = (sleeve: PreparedSleeve) => sleeve.points[sleeve.points.length - 1].date;
  const start = sleeves.reduce(
    (max, sleeve) => (firstDate(sleeve) > max ? firstDate(sleeve) : max),
    firstDate(sleeves[0]),
  );
  const end = sleeves.reduce(
    (min, sleeve) => (lastDate(sleeve) < min ? lastDate(sleeve) : min),
    lastDate(sleeves[0]),
  );
  if (start > end) {
    return { ok: false, reason: "Las series no comparten un período común.", start: null, end: null };
  }

  const dateSet = new Set<string>();
  for (const sleeve of sleeves) {
    for (const point of sleeve.points) {
      if (point.date >= start && point.date <= end) dateSet.add(point.date);
    }
  }
  const dates = [...dateSet].sort();
  if (dates.length < 2) {
    return {
      ok: false,
      reason: "Las series solo comparten una fecha; se necesitan al menos dos.",
      start: dates[0] ?? start,
      end: dates[0] ?? end,
    };
  }

  // Invariante: el primer punto de cada manga es <= start, así que en cualquier
  // fecha de la ventana existe un nivel previo. Arrastrarlo no mira al futuro.
  const cursor = sleeves.map(() => 0);
  const levelAt = (sleeveIndex: number, date: string): number => {
    const points = sleeves[sleeveIndex].points;
    let index = cursor[sleeveIndex];
    while (index + 1 < points.length && points[index + 1].date <= date) index += 1;
    cursor[sleeveIndex] = index;
    return points[index].value;
  };

  let carried = false;
  for (const sleeve of sleeves) {
    const published = new Set(sleeve.points.map((point) => point.date));
    if (dates.some((date) => !published.has(date))) {
      carried = true;
      break;
    }
  }

  const shares = sleeves.map((sleeve, index) => (sleeve.weight * 100) / levelAt(index, dates[0]));
  const curve: SeriesPoint[] = [{ date: dates[0], value: 100 }];
  const rebalanceDates: string[] = [];

  for (let t = 1; t < dates.length; t++) {
    const date = dates[t];
    const levels: number[] = [];
    let equity = 0;
    for (let index = 0; index < sleeves.length; index++) {
      const level = levelAt(index, date);
      levels.push(level);
      equity += shares[index] * level;
    }
    curve.push({ date, value: roundLevel(equity) });
    if (periodKey(dates[t - 1], rebalance) !== periodKey(date, rebalance)) {
      rebalanceDates.push(date);
      for (let index = 0; index < sleeves.length; index++) {
        shares[index] = (sleeves[index].weight * equity) / levels[index];
      }
    }
  }

  return { ok: true, curve, rebalanceDates, start, end, carried };
}

function emptyResult(options: {
  rebalance: RebalanceFrequency;
  entryLabel: string;
  benchmarkSymbol: string | null;
  notes: string[];
  reasons: string[];
  riskFreePct?: number;
  start?: string | null;
  end?: string | null;
}): BacktestResult {
  return {
    curve: [],
    benchmarkCurve: [],
    metrics: computePerformanceMetrics({
      portfolio: [],
      riskFreePct: options.riskFreePct,
    }),
    targetWeights: {},
    sleeves: [],
    rebalance: options.rebalance,
    rebalanceLabel: rebalanceLabel(options.rebalance),
    rebalanceDates: [],
    entryLabel: options.entryLabel,
    methodLabel: methodLabel(options.rebalance, options.entryLabel),
    benchmarkSymbol: options.benchmarkSymbol,
    start: options.start ?? null,
    end: options.end ?? null,
    disclaimer: BACKTEST_DISCLAIMER,
    notes: options.notes,
    reasons: options.reasons,
  };
}

/**
 * Combina portafolios con pesos y rebalanceo, y mide la curva contra un
 * benchmark opcional reutilizando `computePerformanceMetrics`.
 */
export function runBacktest(options: RunBacktestInput): BacktestResult {
  const rebalance: RebalanceFrequency = options.rebalance === "quarterly" ? "quarterly" : "monthly";
  const entryLabel = resolveEntryLabel(options.entryLabel);
  const benchmarkSymbol = resolveSymbol(options.benchmarkSymbol);
  const seriesScale = resolveScale(options.seriesScale, "cumulative_pct");
  const benchmarkScale = resolveScale(options.benchmarkScale, "level");
  const base = {
    rebalance,
    entryLabel,
    benchmarkSymbol,
    riskFreePct: options.riskFreePct,
  };

  const series = options.series;
  if (!series || typeof series !== "object" || Array.isArray(series)) {
    return emptyResult({ ...base, notes: [], reasons: ["No hay series para combinar."] });
  }

  const seriesIds = Object.keys(series).sort();
  if (seriesIds.length === 0) {
    return emptyResult({ ...base, notes: [], reasons: ["No hay series para combinar."] });
  }

  const resolved = resolveWeights(seriesIds, options.weights);
  if (resolved.error) {
    return emptyResult({ ...base, notes: resolved.notes, reasons: [resolved.error] });
  }

  const sleeves: PreparedSleeve[] = [];
  const unusable: string[] = [];
  for (const id of resolved.fundedIds) {
    const points = toLevelSeries(series[id], seriesScale);
    if (points.length === 0) unusable.push(id);
    else sleeves.push({ id, weight: resolved.weights[id], points });
  }
  if (unusable.length > 0) {
    return emptyResult({
      ...base,
      notes: resolved.notes,
      reasons: unusable.map((id) => `La serie "${id}" no tiene puntos utilizables.`),
    });
  }

  const combined = combine(sleeves, rebalance);
  if (!combined.ok) {
    return emptyResult({
      ...base,
      notes: resolved.notes,
      reasons: [combined.reason],
      start: combined.start,
      end: combined.end,
    });
  }

  const notes = [...resolved.notes];
  if (combined.carried) {
    notes.push("En las fechas en que una serie no tiene punto, se mantiene su último nivel.");
  }

  const benchmarkProvided = options.benchmark !== undefined;
  const benchmarkLevels = benchmarkProvided ? toLevelSeries(options.benchmark, benchmarkScale) : [];
  const metrics = computePerformanceMetrics({
    portfolio: combined.curve,
    ...(benchmarkProvided ? { benchmark: benchmarkLevels } : {}),
    riskFreePct: options.riskFreePct,
  });
  const benchmarkCurve =
    benchmarkLevels.length > 0
      ? normalizeToBase100(alignByDate(combined.curve, benchmarkLevels).b).map((point) => ({
          date: point.date,
          value: roundLevel(point.value),
        }))
      : [];

  return {
    curve: combined.curve,
    benchmarkCurve,
    metrics,
    targetWeights: resolved.weights,
    sleeves: resolved.fundedIds,
    rebalance,
    rebalanceLabel: rebalanceLabel(rebalance),
    rebalanceDates: combined.rebalanceDates,
    entryLabel,
    methodLabel: methodLabel(rebalance, entryLabel),
    benchmarkSymbol,
    start: combined.start,
    end: combined.end,
    disclaimer: BACKTEST_DISCLAIMER,
    notes,
    reasons: [],
  };
}
