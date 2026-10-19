/**
 * Rendimiento auditable — lógica pura, sin dependencias ni acceso a datos.
 *
 * Convenciones (documentadas en /metodologia):
 *  - Serie de entrada: puntos { date: "YYYY-MM-DD", value }, donde value es
 *    el NIVEL del activo (precio o índice base 100). `fromPctToLevel` convierte
 *    una serie de retornos acumulados en % (tabla portfolio_performance) a nivel.
 *  - Retornos diarios simples: r_t = v_t / v_{t-1} - 1.
 *  - Volatilidad anualizada: desviación estándar MUESTRAL (n-1) de los
 *    retornos diarios × √252.
 *  - Sharpe: (CAGR - tasa libre de riesgo) / volatilidad anualizada.
 *    Tasa libre de riesgo por defecto 4% anual (configurable).
 *  - CAGR: (v_final / v_inicial)^(365.25 / días) - 1, exige ≥ 180 días de historia.
 *  - Alfa simple: CAGR del portafolio - CAGR del benchmark (exceso anualizado).
 *  - Series cortas o datos faltantes: se devuelve null y se agrega el motivo
 *    a `reasons`. Nunca se inventa un número.
 */

export interface SeriesPoint {
  date: string;
  value: number;
}

export type MetricPeriod = "1M" | "3M" | "YTD" | "1A";

export const METRIC_PERIODS: MetricPeriod[] = ["1M", "3M", "YTD", "1A"];

/** Mínimo de retornos diarios para calcular volatilidad. */
export const MIN_POINTS_VOLATILITY = 10;
/** Mínimo de retornos diarios para calcular Sharpe. */
export const MIN_POINTS_SHARPE = 30;
/** Mínimo de días de historia para reportar CAGR. */
export const MIN_DAYS_CAGR = 180;
/** Tasa libre de riesgo por defecto (anual, %). */
export const DEFAULT_RISK_FREE_PCT = 4;
/** Días de bolsa por año. */
export const TRADING_DAYS_PER_YEAR = 252;
/** Tolerancia (días) al buscar el punto de corte de una ventana. */
export const WINDOW_TOLERANCE_DAYS = 10;

export interface PerformanceMetrics {
  /** Puntos usados del portafolio (tras alinear con benchmark si aplica). */
  dataPoints: number;
  /** Retorno acumulado total (%). */
  totalReturnPct: number | null;
  /** Retorno anualizado (%). null si la historia es < 180 días. */
  cagrPct: number | null;
  /** Retorno por ventana: 1 mes, 3 meses, año en curso, 1 año (%). */
  periodReturns: Record<MetricPeriod, number | null>;
  /** Volatilidad anualizada (%). null con < 10 retornos. */
  volatilityPct: number | null;
  /** (CAGR - tasa libre de riesgo) / volatilidad. null con < 30 retornos o sin CAGR. */
  sharpe: number | null;
  /** Máxima caída desde un máximo previo (%). Requiere ≥ 2 puntos. */
  maxDrawdownPct: number | null;
  // ---- vs. benchmark (null si no hay benchmark o no hay solape) ----
  /** Retorno acumulado del portafolio - retorno acumulado del benchmark (%). */
  excessReturnPct: number | null;
  /** Alfa simple anualizada: CAGR portafolio - CAGR benchmark (pp). */
  alphaPct: number | null;
  /** % de periodos (días alineados) en que el portafolio supera al benchmark. */
  winRatePct: number | null;
  /** Motivos en español por los que una métrica es null. */
  reasons: string[];
}

// ---- Utilidades puras ----

/** Parsea "YYYY-MM-DD" (o ISO con T) a epoch ms UTC; NaN si es inválida. */
export function parseDate(date: string): number {
  if (typeof date !== "string" || date.length < 10) return Number.NaN;
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : Number.NaN;
}

/** Elimina puntos con fecha o valor inválido y los ordena por fecha. */
export function cleanSeries(series: SeriesPoint[]): SeriesPoint[] {
  return series
    .filter(
      (point) =>
        Number.isFinite(point.value) && point.value > 0 && Number.isFinite(parseDate(point.date)),
    )
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

/**
 * Convierte una serie de retornos acumulados en % (ej: portfolio_performance
 * .value_pct, donde 0 = base) a una serie de niveles base 100.
 */
export function fromPctToLevel(series: { date: string; value: number }[]): SeriesPoint[] {
  return series.map((point) => ({
    date: point.date,
    value: Math.round((100 * (1 + point.value / 100)) * 1e8) / 1e8,
  }));
}

/** Normaliza una serie a base 100 en su primer punto. */
export function normalizeToBase100(series: SeriesPoint[]): SeriesPoint[] {
  const points = cleanSeries(series);
  if (points.length === 0) return [];
  const base = points[0].value;
  if (base <= 0) return [];
  return points.map((point) => ({ date: point.date, value: (point.value / base) * 100 }));
}

/** Intersección por fecha de dos series (fechas comunes, ordenadas). */
export function alignByDate(a: SeriesPoint[], b: SeriesPoint[]): { a: SeriesPoint[]; b: SeriesPoint[] } {
  const mapB = new Map<string, number>();
  for (const point of cleanSeries(b)) mapB.set(point.date, point.value);
  const aPoints: SeriesPoint[] = [];
  const bPoints: SeriesPoint[] = [];
  for (const point of cleanSeries(a)) {
    const valueB = mapB.get(point.date);
    if (valueB !== undefined) {
      aPoints.push(point);
      bPoints.push({ date: point.date, value: valueB });
    }
  }
  return { a: aPoints, b: bPoints };
}

/** Retornos diarios simples de una serie ordenada. */
function dailyReturns(series: SeriesPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    if (prev <= 0) continue;
    returns.push(series[i].value / prev - 1);
  }
  return returns;
}

/** Desviación estándar muestral (n-1); 0 si hay un solo dato. */
function sampleStd(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ---- Métricas individuales ----

/** Retorno acumulado total (%) entre el primer y el último punto. */
export function cumulativeReturnPct(series: SeriesPoint[]): number | null {
  const points = cleanSeries(series);
  if (points.length < 2) return null;
  const first = points[0].value;
  if (first <= 0) return null;
  return round((points[points.length - 1].value / first - 1) * 100);
}

/** CAGR (%) con calendario 365.25; null si la historia es menor a 180 días. */
export function cagrPct(series: SeriesPoint[]): number | null {
  const points = cleanSeries(series);
  if (points.length < 2) return null;
  const msPerDay = 86_400_000;
  const days = (parseDate(points[points.length - 1].date) - parseDate(points[0].date)) / msPerDay;
  if (days < MIN_DAYS_CAGR) return null;
  const ratio = points[points.length - 1].value / points[0].value;
  if (ratio <= 0) return null;
  const years = days / 365.25;
  return round((ratio ** (1 / years) - 1) * 100);
}

/** Volatilidad anualizada (%) de los retornos diarios; null con < 10 retornos. */
export function volatilityPct(series: SeriesPoint[]): number | null {
  const points = cleanSeries(series);
  const returns = dailyReturns(points);
  if (returns.length < MIN_POINTS_VOLATILITY) return null;
  return round(sampleStd(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100);
}

/** Sharpe = (CAGR - rf) / volatilidad anualizada; null si falta CAGR o vol. */
export function sharpeRatio(series: SeriesPoint[], riskFreePct = DEFAULT_RISK_FREE_PCT): number | null {
  const points = cleanSeries(series);
  const returns = dailyReturns(points);
  if (returns.length < MIN_POINTS_SHARPE) return null;
  const cagr = cagrPct(points);
  const vol = volatilityPct(points);
  if (cagr === null) return null;
  if (vol === null || vol === 0) return null;
  return round((cagr - riskFreePct) / vol);
}

/** Máxima caída (%) desde un máximo histórico previo; null con < 2 puntos. */
export function maxDrawdownPct(series: SeriesPoint[]): number | null {
  const points = cleanSeries(series);
  if (points.length < 2) return null;
  let peak = points[0].value;
  let maxDrawdown = 0;
  for (const point of points) {
    if (point.value > peak) peak = point.value;
    const drawdown = 1 - point.value / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  return round(maxDrawdown * 100);
}

/**
 * Retorno (%) de la ventana pedida hasta el último punto de la serie.
 * Busca el punto de corte más cercano en fecha ≤ límite; si no existe ninguno
 * a ≤ 10 días del límite, usa el primer punto de la serie y lo marca en
 * `fromStart`. null si la serie es demasiado corta para la ventana.
 */
export function periodReturnPct(
  series: SeriesPoint[],
  period: MetricPeriod,
): { value: number | null; fromStart: boolean } {
  const points = cleanSeries(series);
  if (points.length < 2) return { value: null, fromStart: false };
  const last = points[points.length - 1];
  const lastTime = parseDate(last.date);
  const limit = windowStartDate(last.date, period);
  const limitTime = parseDate(limit);

  let cutIndex = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (parseDate(points[i].date) <= limitTime) {
      cutIndex = i;
      break;
    }
  }
  let fromStart = false;
  if (cutIndex === -1) {
    // La serie parte después del límite de la ventana.
    cutIndex = 0;
    fromStart = true;
  } else if (limitTime - parseDate(points[cutIndex].date) > WINDOW_TOLERANCE_DAYS * 86_400_000) {
    // El punto de corte está demasiado lejos del límite: usar el más cercano al límite.
    let best = cutIndex;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i++) {
      const distance = Math.abs(parseDate(points[i].date) - limitTime);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    cutIndex = best;
    fromStart = best === 0 && parseDate(points[best].date) > limitTime;
  }

  const base = points[cutIndex].value;
  const spanDays = (lastTime - parseDate(points[cutIndex].date)) / 86_400_000;
  const minimumSpan = period === "1M" ? 14 : period === "3M" ? 45 : period === "1A" ? 150 : 14;
  if (base <= 0 || spanDays < minimumSpan) return { value: null, fromStart };

  const value = round((last.value / base - 1) * 100);
  return { value, fromStart };
}

/** Fecha (YYYY-MM-DD) de inicio de la ventana según el último punto. */
function windowStartDate(lastDate: string, period: MetricPeriod): string {
  const last = new Date(parseDate(lastDate));
  const year = last.getUTCFullYear();
  switch (period) {
    case "1M":
      return new Date(Date.UTC(year, last.getUTCMonth() - 1, last.getUTCDate())).toISOString().slice(0, 10);
    case "3M":
      return new Date(Date.UTC(year, last.getUTCMonth() - 3, last.getUTCDate())).toISOString().slice(0, 10);
    case "YTD":
      return `${year}-01-01`;
    case "1A":
      return new Date(Date.UTC(year - 1, last.getUTCMonth(), last.getUTCDate())).toISOString().slice(0, 10);
  }
}

// ---- Métricas vs. benchmark ----

/**
 * Calcula el paquete completo de métricas del portafolio, opcionalmente
 * contra un benchmark (S&P 500, IPSA...). Ambas series se alinean por fecha
 * antes de medir el exceso, el alfa y el win rate.
 *
 * Devuelve métricas null con su motivo cuando los datos no alcanzan.
 */
export function computePerformanceMetrics(options: {
  portfolio: SeriesPoint[];
  benchmark?: SeriesPoint[];
  riskFreePct?: number;
}): PerformanceMetrics {
  const riskFree = options.riskFreePct ?? DEFAULT_RISK_FREE_PCT;
  const portfolio = cleanSeries(options.portfolio);
  const reasons: string[] = [];

  const metrics: PerformanceMetrics = {
    dataPoints: portfolio.length,
    totalReturnPct: null,
    cagrPct: null,
    periodReturns: { "1M": null, "3M": null, YTD: null, "1A": null },
    volatilityPct: null,
    sharpe: null,
    maxDrawdownPct: null,
    excessReturnPct: null,
    alphaPct: null,
    winRatePct: null,
    reasons,
  };

  if (portfolio.length === 0) {
    reasons.push("Sin puntos de datos del portafolio.");
    return metrics;
  }
  if (portfolio.length === 1) {
    reasons.push("La serie tiene un solo punto; se necesitan al menos dos para medir retorno.");
    return metrics;
  }

  metrics.totalReturnPct = cumulativeReturnPct(portfolio);
  metrics.cagrPct = cagrPct(portfolio);
  if (metrics.cagrPct === null) {
    reasons.push(
      `CAGR no calculado: la historia (${portfolio.length} puntos) es menor a ${MIN_DAYS_CAGR} días.`,
    );
  }

  for (const period of METRIC_PERIODS) {
    metrics.periodReturns[period] = periodReturnPct(portfolio, period).value;
  }

  metrics.volatilityPct = volatilityPct(portfolio);
  if (metrics.volatilityPct === null) {
    reasons.push(
      `Volatilidad no calculada: se necesitan al menos ${MIN_POINTS_VOLATILITY} retornos diarios.`,
    );
  }

  metrics.sharpe = sharpeRatio(portfolio, riskFree);
  if (metrics.sharpe === null && metrics.volatilityPct !== null) {
    reasons.push(
      `Sharpe no calculado: se necesitan al menos ${MIN_POINTS_SHARPE} retornos diarios y CAGR.`,
    );
  }

  metrics.maxDrawdownPct = maxDrawdownPct(portfolio);

  // ---- vs. benchmark ----
  const benchmark = options.benchmark ? cleanSeries(options.benchmark) : [];
  if (benchmark.length === 0) {
    if (options.benchmark !== undefined) reasons.push("El benchmark no tiene datos utilizables.");
    return metrics;
  }

  const { a, b } = alignByDate(portfolio, benchmark);
  if (a.length < 2) {
    reasons.push("El portafolio y el benchmark no comparten fechas suficientes.");
    return metrics;
  }

  metrics.dataPoints = a.length;
  const portfolioReturn = cumulativeReturnPct(a);
  const benchmarkReturn = cumulativeReturnPct(b);
  if (portfolioReturn !== null && benchmarkReturn !== null) {
    metrics.excessReturnPct = round(portfolioReturn - benchmarkReturn);
  }

  const portfolioCagr = cagrPct(a);
  const benchmarkCagr = cagrPct(b);
  if (portfolioCagr !== null && benchmarkCagr !== null) {
    metrics.alphaPct = round(portfolioCagr - benchmarkCagr);
  } else if (metrics.excessReturnPct === null) {
    reasons.push("Alfa no calculada: la historia alineada es menor a 180 días.");
  }

  // Win rate: días en que el retorno diario del portafolio supera al benchmark.
  const portfolioReturns = dailyReturns(a);
  const benchmarkReturns = dailyReturns(b);
  const count = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (count === 0) {
    reasons.push("Win rate no calculado: no hay retornos diarios alineados.");
  } else {
    let wins = 0;
    for (let i = 0; i < count; i++) {
      if (portfolioReturns[i] > benchmarkReturns[i]) wins++;
    }
    metrics.winRatePct = round((wins / count) * 100, 1);
  }

  return metrics;
}
