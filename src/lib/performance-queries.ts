/**
 * Acceso a datos de rendimiento y benchmarks (F5).
 *
 * Archivo propio para no tocar src/lib/queries.ts (compartido entre frentes).
 * - Sin Supabase configurado => devuelve [] / null (el panel muestra el
 *   estado vacío; nunca se inventa un número).
 * - Con Supabase: lee portfolio_performance (serie del portafolio),
 *   benchmark_prices (S&P 500 / IPSA) y portfolio_metrics (métricas
 *   precalculadas por el scraper).
 * - Si no hay métricas precalculadas, calcula al vuelo con la lógica pura
 *   de src/lib/performance.ts desde las series disponibles.
 */

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries";
import { isPaidPlan } from "@/lib/types";
import {
  computePerformanceMetrics,
  fromPctToLevel,
  type PerformanceMetrics,
  type SeriesPoint,
} from "@/lib/performance";

/** True cuando Supabase está configurado con valores reales (no placeholder). */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/** Símbolo de benchmark por país: CL => IPSA, resto => S&P 500. */
export function benchmarkSymbolForCountry(country?: string | null): string {
  return country === "CL" ? "^IPSA" : "^GSPC";
}

export interface BenchmarkSeries {
  symbol: string;
  label: string;
  points: SeriesPoint[];
}

const BENCHMARK_LABELS: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IPSA": "IPSA",
  SPY: "S&P 500 (SPY)",
};

/** Etiqueta pública del benchmark ("S&P 500", "IPSA"). */
export function benchmarkLabel(symbol: string): string {
  return BENCHMARK_LABELS[symbol] ?? symbol;
}

/** Serie histórica del benchmark desde benchmark_prices (closes). */
export async function getBenchmarkSeries(
  symbol: string,
  limit = 400,
): Promise<SeriesPoint[]> {
  if (!isSupabaseLive()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("benchmark_prices")
      .select("date, close")
      .eq("symbol", symbol)
      .order("date", { ascending: true })
      .limit(limit);
    if (error || !Array.isArray(data)) {
      if (error) console.warn("[reclu] getBenchmarkSeries error:", error.message);
      return [];
    }
    const points: SeriesPoint[] = [];
    for (const row of data) {
      const close = Number(row?.close);
      if (typeof row?.date === "string" && Number.isFinite(close) && close > 0) {
        points.push({ date: row.date, value: close });
      }
    }
    return points;
  } catch (err) {
    console.warn(
      "[reclu] getBenchmarkSeries error:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}

export interface PortfolioPerformanceData {
  /** Métricas calculadas (precalculadas o al vuelo) contra el benchmark. */
  metrics: PerformanceMetrics | null;
  /** Benchmark usado ("^GSPC" / "^IPSA"). */
  benchmarkSymbol: string;
  /** Etiqueta pública del benchmark. */
  benchmarkLabel: string;
  /** Serie alineada del portafolio normalizada a base 100 (para el gráfico). */
  portfolioSeries: SeriesPoint[];
  /** Serie alineada del benchmark normalizada a base 100. */
  benchmarkSeries: SeriesPoint[];
  /** Datos precalculados por el scraper (tabla portfolio_metrics). */
  precomputed: PrecomputedMetrics | null;
  /** Fuentes de los datos para transparencia metodológica. */
  method: "precalculado" | "calculado-al-vuelo" | "sin-datos";
}

export interface PrecomputedMetrics {
  period: string;
  return_pct: number | null;
  benchmark_return_pct: number | null;
  sharpe: number | null;
  max_drawdown: number | null;
  volatility: number | null;
  alpha_pct: number | null;
  win_rate: number | null;
  data_points: number | null;
  as_of: string;
  method: string;
}

/**
 * Métricas precalculadas (period TOTAL) desde portfolio_metrics.
 *
 * Muro de pago (migración 048): usa la función security definer
 * `get_portfolio_metrics`, que recorta según el plan de auth.uid(). Un
 * portafolio premium no devuelve métricas a anon/free. Sin RPC (migración
 * sin aplicar) no se lee la tabla directo: se falla cerrado para no
 * saltarse el muro.
 */
export async function getPrecomputedMetrics(
  portfolioId: string,
  benchmarkSymbol: string,
): Promise<PrecomputedMetrics | null> {
  if (!isSupabaseLive()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_portfolio_metrics", {
      p_portfolio: portfolioId,
    });
    if (error) {
      console.warn("[reclu] getPrecomputedMetrics error:", error.message);
      return null;
    }
    const rows = Array.isArray(data) ? data : [];
    const data2 = rows
      .filter(
        (row: Record<string, unknown>) =>
          row?.period === "TOTAL" &&
          String(row?.benchmark_symbol ?? "").toUpperCase() ===
            benchmarkSymbol.toUpperCase(),
      )
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        String(b?.as_of ?? "").localeCompare(String(a?.as_of ?? "")),
      )[0];
    if (!data2) return null;
    return {
      period: String(data2.period),
      return_pct: data2.return_pct != null ? Number(data2.return_pct) : null,
      benchmark_return_pct:
        data2.benchmark_return_pct != null ? Number(data2.benchmark_return_pct) : null,
      sharpe: data2.sharpe != null ? Number(data2.sharpe) : null,
      max_drawdown: data2.max_drawdown != null ? Number(data2.max_drawdown) : null,
      volatility: data2.volatility != null ? Number(data2.volatility) : null,
      alpha_pct: data2.alpha_pct != null ? Number(data2.alpha_pct) : null,
      win_rate: data2.win_rate != null ? Number(data2.win_rate) : null,
      data_points: data2.data_points != null ? Number(data2.data_points) : null,
      as_of: String(data2.as_of),
      method: String(data2.method),
    };
  } catch (err) {
    console.warn(
      "[reclu] getPrecomputedMetrics error:",
      err instanceof Error ? err.message : "unknown",
    );
    return null;
  }
}

/**
 * Paquete completo de rendimiento para la página del portafolio.
 *
 * Orden de prioridad:
 *  1. Métricas precalculadas por el scraper (portfolio_metrics, TOTAL).
 *  2. Cálculo al vuelo desde portfolio_performance + benchmark_prices.
 *  3. Sin datos => metrics: null (la UI muestra "sin datos suficientes").
 */
export async function getPortfolioPerformanceData(options: {
  portfolioId: string;
  country?: string | null;
  /** Serie ya obtenida por la página (evita doble consulta). */
  performanceSeries?: { date: string; value: number }[];
  benchmarkLimit?: number;
}): Promise<PortfolioPerformanceData> {
  const symbol = benchmarkSymbolForCountry(options.country);
  const label = benchmarkLabel(symbol);

  const empty: PortfolioPerformanceData = {
    metrics: null,
    benchmarkSymbol: symbol,
    benchmarkLabel: label,
    portfolioSeries: [],
    benchmarkSeries: [],
    precomputed: null,
    method: "sin-datos",
  };

  if (!isSupabaseLive()) return empty;

  // 1) Precalculado
  const precomputed = await getPrecomputedMetrics(options.portfolioId, symbol);
  if (precomputed) {
    // Aun con métricas precalculadas, traemos series para el gráfico.
    const [benchmarkPoints] = await Promise.all([getBenchmarkSeries(symbol, options.benchmarkLimit)]);
    return {
      metrics: {
        dataPoints: precomputed.data_points ?? 0,
        totalReturnPct: precomputed.return_pct,
        cagrPct: null,
        periodReturns: { "1M": null, "3M": null, YTD: null, "1A": null },
        volatilityPct: precomputed.volatility,
        sharpe: precomputed.sharpe,
        maxDrawdownPct: precomputed.max_drawdown,
        excessReturnPct:
          precomputed.return_pct != null && precomputed.benchmark_return_pct != null
            ? Number(
                (
                  Number(precomputed.return_pct) - Number(precomputed.benchmark_return_pct)
                ).toFixed(4),
              )
            : null,
        alphaPct: precomputed.alpha_pct,
        winRatePct: precomputed.win_rate,
        reasons: [],
      },
      benchmarkSymbol: symbol,
      benchmarkLabel: label,
      portfolioSeries: [],
      benchmarkSeries: benchmarkPoints,
      precomputed,
      method: "precalculado",
    };
  }

  // 2) Cálculo al vuelo desde series
  let portfolioPctSeries = options.performanceSeries;
  if (!portfolioPctSeries) {
    portfolioPctSeries = await getPerformanceSeriesDirect(options.portfolioId);
  }
  if (portfolioPctSeries.length < 2) return empty;

  const benchmarkPoints = await getBenchmarkSeries(symbol, options.benchmarkLimit);
  if (benchmarkPoints.length < 2) {
    // Sin benchmark solo podemos dar métricas propias, no comparación.
    const ownMetrics = computePerformanceMetrics({
      portfolio: fromPctToLevel(portfolioPctSeries),
    });
    return {
      metrics: ownMetrics,
      benchmarkSymbol: symbol,
      benchmarkLabel: label,
      portfolioSeries: fromPctToLevel(portfolioPctSeries),
      benchmarkSeries: [],
      precomputed: null,
      method: "calculado-al-vuelo",
    };
  }

  const portfolioLevel = fromPctToLevel(portfolioPctSeries);
  const metrics = computePerformanceMetrics({
    portfolio: portfolioLevel,
    benchmark: benchmarkPoints,
  });
  const { a, b } = alignSeriesForChart(portfolioLevel, benchmarkPoints);

  return {
    metrics,
    benchmarkSymbol: symbol,
    benchmarkLabel: label,
    portfolioSeries: a,
    benchmarkSeries: b,
    precomputed: null,
    method: "calculado-al-vuelo",
  };
}

/**
 * Serie del portafolio (retornos acumulados %) desde portfolio_performance.
 * Muro 048: la RPC recorta por plan (premium oculto a no pagos, 90 días para
 * anon/free). Nunca se lee la tabla directo para servir series a usuarios.
 */
async function getPerformanceSeriesDirect(
  portfolioId: string,
  limit = 400,
): Promise<{ date: string; value: number }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_portfolio_performance", {
      p_portfolio: portfolioId,
    });
    if (error || !Array.isArray(data)) {
      if (error) {
        console.warn("[reclu] getPerformanceSeriesDirect error:", error.message);
      }
      return [];
    }
    const points: { date: string; value: number }[] = [];
    for (const row of data) {
      const value = Number(row?.value_pct);
      if (typeof row?.date === "string" && Number.isFinite(value)) {
        points.push({ date: row.date, value });
      }
    }
    return points.slice(-limit);
  } catch (err) {
    console.warn(
      "[reclu] getPerformanceSeriesDirect error:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}

/** Alinea y normaliza ambas series a base 100 para el gráfico comparativo. */
export function alignSeriesForChart(
  portfolio: SeriesPoint[],
  benchmark: SeriesPoint[],
): { a: SeriesPoint[]; b: SeriesPoint[] } {
  const mapB = new Map<string, number>();
  for (const point of benchmark) mapB.set(point.date, point.value);
  const a: SeriesPoint[] = [];
  const b: SeriesPoint[] = [];
  for (const point of portfolio) {
    const valueB = mapB.get(point.date);
    if (valueB === undefined) continue;
    a.push(point);
    b.push({ date: point.date, value: valueB });
  }
  if (a.length === 0) return { a: [], b: [] };
  const baseA = a[0].value;
  const baseB = b[0].value;
  if (baseA <= 0 || baseB <= 0) return { a: [], b: [] };
  return {
    a: a.map((p) => ({ date: p.date, value: (p.value / baseA) * 100 })),
    b: b.map((p) => ({ date: p.date, value: (p.value / baseB) * 100 })),
  };
}

// ---- Ranking "Le ganan al mercado" (explore) ----

export interface BeatMarketRow {
  portfolio_id: string;
  slug: string;
  name: string;
  return_pct: number;
  benchmark_return_pct: number;
  excess_return_pct: number;
  sharpe: number | null;
  max_drawdown: number | null;
  benchmark_symbol: string;
  data_points: number | null;
  as_of: string;
}

/**
 * Ranking por exceso de retorno o Sharpe desde portfolio_metrics (TOTAL).
 *
 * Muro 048: las métricas se piden por portafolio con `get_portfolio_metrics`
 * (recorta por plan). Además se filtran los premium para quien no paga, de
 * modo que ni siquiera se consulta su métrica. Devuelve [] si no hay datos.
 */
export async function getBeatTheMarketRanking(
  limit = 5,
  sortBy: "excess" | "sharpe" = "excess",
): Promise<BeatMarketRow[]> {
  if (!isSupabaseLive()) return [];
  try {
    const supabase = await createClient();
    const profile = await getProfile();
    const paid = isPaidPlan(profile?.plan);

    const { data: portfolioRows, error: portfoliosError } = await supabase
      .from("portfolios")
      .select("id, slug, name, is_active, premium")
      .eq("is_active", true);
    if (portfoliosError || !Array.isArray(portfolioRows)) {
      if (portfoliosError) {
        console.warn("[reclu] getBeatTheMarketRanking error:", portfoliosError.message);
      }
      return [];
    }

    const candidates = (portfolioRows as {
      id: string;
      slug: string;
      name: string;
      is_active?: boolean;
      premium?: boolean;
    }[]).filter((portfolio) => portfolio.premium !== true || paid);

    const rows: BeatMarketRow[] = [];
    const CONCURRENCY = 8;

    for (let index = 0; index < candidates.length; index += CONCURRENCY) {
      const batch = candidates.slice(index, index + CONCURRENCY);
      await Promise.all(
        batch.map(async (portfolio) => {
          const { data: metricRows, error: metricError } = await supabase.rpc(
            "get_portfolio_metrics",
            { p_portfolio: portfolio.id },
          );
          if (metricError || !Array.isArray(metricRows)) {
            if (metricError) {
              console.warn("[reclu] getBeatTheMarketRanking rpc:", metricError.message);
            }
            return;
          }
          const totals = metricRows
            .filter(
              (row: Record<string, unknown>) =>
                row?.period === "TOTAL" &&
                row?.return_pct != null &&
                row?.benchmark_return_pct != null,
            )
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
              String(b?.as_of ?? "").localeCompare(String(a?.as_of ?? "")),
            );
          const metric = totals[0];
          if (!metric) return;
          const ret = Number(metric.return_pct);
          const bench = Number(metric.benchmark_return_pct);
          if (!Number.isFinite(ret) || !Number.isFinite(bench)) return;
          rows.push({
            portfolio_id: portfolio.id,
            slug: portfolio.slug,
            name: portfolio.name,
            return_pct: ret,
            benchmark_return_pct: bench,
            excess_return_pct: Number((ret - bench).toFixed(4)),
            sharpe: metric.sharpe != null ? Number(metric.sharpe) : null,
            max_drawdown: metric.max_drawdown != null ? Number(metric.max_drawdown) : null,
            benchmark_symbol: String(metric.benchmark_symbol ?? ""),
            data_points: metric.data_points != null ? Number(metric.data_points) : null,
            as_of: String(metric.as_of ?? ""),
          });
        }),
      );
    }

    rows.sort((x, y) =>
      sortBy === "sharpe"
        ? (y.sharpe ?? -Infinity) - (x.sharpe ?? -Infinity) || y.excess_return_pct - x.excess_return_pct
        : y.excess_return_pct - x.excess_return_pct || (y.sharpe ?? -Infinity) - (x.sharpe ?? -Infinity),
    );
    return rows.slice(0, limit);
  } catch (err) {
    console.warn(
      "[reclu] getBeatTheMarketRanking error:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}
