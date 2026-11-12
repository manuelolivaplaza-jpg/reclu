import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { DemoBadge } from "@/components/demo-badge";
import {
  BacktestForm,
  type BacktestBenchmark,
  type BacktestPortfolio,
} from "@/components/backtest-form";
import { getPortfolios, getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { demoPerformance } from "@/lib/demo-data";
import { fromPctToLevel, type SeriesPoint } from "@/lib/performance";
import {
  FREE_BACKTEST_WINDOW_DAYS,
  filterBacktestCandidates,
  trimSeriesToWindow,
} from "@/lib/backtest-window";
import { isPaidPlan } from "@/lib/types";

export const metadata: Metadata = withSeo("/herramientas/backtest", {
  title: "Backtest de portafolios",
  description:
    "Combina hasta cinco portafolios con los pesos que elijas, define el rebalanceo y compara la curva contra el S&P 500 o el IPSA. Simulación histórica, sin órdenes ni recomendaciones.",
});

// Lee la sesión para decidir la ventana de historial: nunca se prerenderiza.
export const instant = false;

/** Techo de consultas por request: prioriza los portafolios más seguidos. */
const MAX_SERIES_PORTFOLIOS = 32;
const MAX_SERIES_POINTS = 2000;
const CONCURRENCY = 8;

function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

function toTime(date: string): number {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  return Date.parse(iso);
}

function cleanPerformanceRows(rows: unknown): SeriesPoint[] {
  if (!Array.isArray(rows)) return [];
  const points: SeriesPoint[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { date?: unknown; value_pct?: unknown };
    if (record.value_pct === null || record.value_pct === undefined) continue;
    const value = Number(record.value_pct);
    if (typeof record.date !== "string" || record.date.length === 0) continue;
    if (!Number.isFinite(value) || !Number.isFinite(toTime(record.date))) continue;
    points.push({ date: record.date.slice(0, 10), value });
  }
  return points;
}

/**
 * Últimos cierres del benchmark, en orden ascendente. Se pide descendente y
 * se invierte para que un tope de filas nunca deje fuera la cola reciente.
 */
async function loadBenchmark(
  supabase: Awaited<ReturnType<typeof createClient>>,
  symbol: string,
): Promise<SeriesPoint[]> {
  const { data, error } = await supabase
    .from("benchmark_prices")
    .select("date, close")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(MAX_SERIES_POINTS);
  if (error) {
    console.warn("[reclu] backtest benchmark error:", error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];
  const points: SeriesPoint[] = [];
  for (const row of data) {
    const close = Number(row?.close);
    if (typeof row?.date === "string" && Number.isFinite(close) && close > 0) {
      points.push({ date: row.date.slice(0, 10), value: close });
    }
  }
  return points.reverse();
}

export default async function BacktestPage() {
  await connection();

  const [profile, portfolios] = await Promise.all([getProfile(), getPortfolios()]);
  const paid = isPaidPlan(profile?.plan);
  const windowDays = paid ? null : FREE_BACKTEST_WINDOW_DAYS;
  const live = isSupabaseLive();

  // Quien no paga no recibe ni la serie de un portafolio premium.
  const candidates = filterBacktestCandidates(portfolios, paid).slice(
    0,
    MAX_SERIES_PORTFOLIOS,
  );
  let options: BacktestPortfolio[] = [];
  let sp500: SeriesPoint[] = [];
  let ipsa: SeriesPoint[] = [];

  if (live) {
    const supabase = await createClient();
    const seriesById = new Map<string, SeriesPoint[]>();

    for (let index = 0; index < candidates.length; index += CONCURRENCY) {
      const batch = candidates.slice(index, index + CONCURRENCY);
      await Promise.all(
        batch.map(async (portfolio) => {
          // Muro 048: la RPC recorta por plan (premium oculto a no pagos,
          // 90 días para anon/free). El recorte de abajo se mantiene como
          // segunda barrera antes de serializar al cliente.
          const { data, error } = await supabase.rpc("get_portfolio_performance", {
            p_portfolio: portfolio.id,
          });
          if (error) {
            console.warn("[reclu] backtest performance error:", error.message);
            return;
          }
          const points = cleanPerformanceRows(data).slice(-MAX_SERIES_POINTS);
          if (points.length >= 2) seriesById.set(portfolio.id, points);
        }),
      );
    }

    options = candidates
      .map((portfolio): BacktestPortfolio | null => {
        const raw = seriesById.get(portfolio.id);
        if (!raw || raw.length < 2) return null;
        // El recorte ocurre antes de serializar: el cliente no ve más historial.
        const series = trimSeriesToWindow(raw, windowDays, portfolio.source);
        if (series.length < 2) return null;
        return {
          id: portfolio.id,
          slug: portfolio.slug,
          name: portfolio.name,
          country: portfolio.country,
          returnYtd: portfolio.return_ytd,
          series,
        };
      })
      .filter((option): option is BacktestPortfolio => option !== null);

    const [gspc, ipsaSeries, spy] = await Promise.all([
      loadBenchmark(supabase, "^GSPC"),
      loadBenchmark(supabase, "^IPSA"),
      loadBenchmark(supabase, "SPY"),
    ]);
    sp500 = trimSeriesToWindow(gspc.length >= 2 ? gspc : spy, windowDays);
    ipsa = trimSeriesToWindow(ipsaSeries, windowDays);
  } else {
    // Modo demo: series ilustrativas, rotuladas como tales en la pantalla.
    options = candidates
      .filter((portfolio) => portfolio.return_ytd !== null)
      .map((portfolio) => ({
        id: portfolio.id,
        slug: portfolio.slug,
        name: portfolio.name,
        country: portfolio.country,
        returnYtd: portfolio.return_ytd,
        series: trimSeriesToWindow(
          demoPerformance(portfolio.slug, portfolio.return_ytd ?? 0, 120),
          windowDays,
          portfolio.source,
        ),
      }));
    sp500 = trimSeriesToWindow(fromPctToLevel(demoPerformance("bench-sp500", 12, 120)), windowDays);
    ipsa = trimSeriesToWindow(fromPctToLevel(demoPerformance("bench-ipsa", 8, 120)), windowDays);
  }

  const benchmarks: BacktestBenchmark[] = [
    { symbol: "^GSPC", label: "S&P 500", series: sp500 },
    { symbol: "^IPSA", label: "IPSA", series: ipsa },
  ].filter((benchmark) => benchmark.series.length >= 2);

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          <header className="border-b border-ink-300 pb-10 dark:border-white/12 md:pb-12">
            <p className="label-line">Herramientas</p>
            <h1 className="type-section mt-4 text-ink-900 dark:text-white">
              Backtest.
            </h1>
            <p className="type-body mt-6 max-w-2xl">
              Combina hasta cinco portafolios, define sus pesos y el rebalanceo,
              y mira la curva contra el mercado. Trabaja con retornos ya
              publicados: no ejecuta órdenes ni recomienda una cartera.
            </p>
            {!live ? (
              <div className="mt-5">
                <DemoBadge />
              </div>
            ) : null}
          </header>

          <section aria-label="Simulador de portafolios" className="mt-10">
            {options.length === 0 ? (
              <div className="border border-ink-300 px-5 py-12 dark:border-white/15">
                <p className="text-[15px] font-medium text-ink-900 dark:text-white">
                  Todavía no hay series para simular.
                </p>
                <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                  El backtest necesita al menos dos datos de rendimiento
                  publicados para un portafolio. Mientras tanto, el ranking
                  ordena lo que ya tiene historial.
                </p>
                <Link
                  href="/ranking"
                  className="mt-5 inline-flex items-center gap-1.5 border-b border-ink-900 pb-0.5 text-[13px] font-medium text-ink-900 dark:border-white dark:text-white"
                >
                  Ver el ranking <span aria-hidden="true">→</span>
                </Link>
              </div>
            ) : (
              <div className="border border-ink-200 bg-white p-4 sm:p-6 lg:p-8 dark:border-white/15">
                <BacktestForm
                  portfolios={options}
                  benchmarks={benchmarks}
                  paid={paid}
                  windowDays={windowDays ?? FREE_BACKTEST_WINDOW_DAYS}
                  demo={!live}
                />
              </div>
            )}
          </section>

          <section className="mt-16 grid gap-8 border-t border-ink-300 pt-10 dark:border-white/12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <h2 className="text-[15px] font-medium text-ink-900 dark:text-white">
                Cómo se calcula
              </h2>
              <p className="mt-3 max-w-[40ch] text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
                La simulación se hace en tu navegador con las series que ya
                llegaron con la página: al mover un peso o el rebalanceo, el
                resultado se recalcula al instante, sin peticiones ni espera.
              </p>
            </div>
            <ul className="max-w-[62ch] space-y-3 text-[14px] leading-relaxed text-ink-600 dark:text-ink-400 lg:col-span-8">
              <li>
                La curva parte en 100 el primer día en que todas las series
                tienen un dato y termina cuando se acaba la más corta.
              </li>
              <li>
                El rebalanceo vuelve a los pesos objetivo al cierre del primer
                día del período. Sin comisiones ni dividendos.
              </li>
              <li>
                El supuesto de entrada es la fecha de publicación, no la fecha
                de la operación: se mide lo que ya era público.
              </li>
              <li>
                Si una serie no tiene punto en una fecha, se mantiene su último
                nivel. No se inventan retornos.
              </li>
            </ul>
          </section>

          {/* Aviso legal sobre papel blanco: su texto es de 12px y no tiene
              variante oscura propia. */}
          <div className="mt-10">
            <LegalNotice kind="simulation" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
