import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Lock } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { getPortfolios, getProfile } from "@/lib/queries";
import { isPaidPlan } from "@/lib/types";
import {
  benchmarkSymbolForCountry,
  getBeatTheMarketRanking,
} from "@/lib/performance-queries";
import {
  SMALL_SAMPLE_LABEL,
  benchmarkLabelForSymbol,
  rankSources,
  splitByOutcome,
  type RankedSource,
  type RankingSourceInput,
} from "@/lib/ranking";
import { RESEARCH_RESULTS } from "@/lib/research-results";
import { cn, formatPercent } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Ranking honesto — todas las fuentes contra el mercado",
  description:
    "Cada portafolio y estudio de reclu.cl contra el benchmark de su país: S&P 500 (SPY) en Estados Unidos e IPSA (ECH en CLP) en Chile. Incluye las fuentes que pierden, con fecha de corte y metodología.",
};

// Lee cookies de auth (getPortfolios) por request; nunca se prerenderiza.
export const instant = false;

function formatExcess(value: number | null): string {
  if (value === null) return "—";
  return formatPercent(value, 2).replace("%", " pp");
}

function formatAsOf(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return "sin fecha";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export default async function RankingPage() {
  await connection();

  const [portfolios, metrics, profile] = await Promise.all([
    getPortfolios(),
    getBeatTheMarketRanking(500),
    getProfile(),
  ]);
  const paid = isPaidPlan(profile?.plan);

  const metricsByPortfolio = new Map(metrics.map((row) => [row.portfolio_id, row]));

  const portfolioSources: RankingSourceInput[] = portfolios.map((portfolio) => {
    // Muro 048: las métricas de un portafolio premium solo las ve quien paga.
    // A los demás se les muestra el portafolio con candado y sin cifras.
    const locked = portfolio.premium && !paid;
    const metric = locked ? undefined : metricsByPortfolio.get(portfolio.id);
    return {
      id: `portfolio-${portfolio.id}`,
      name: portfolio.name,
      kind: "portfolio",
      country: portfolio.country === "CL" ? "CL" : "US",
      returnPct: metric?.return_pct ?? null,
      benchmarkReturnPct: metric?.benchmark_return_pct ?? null,
      benchmarkLabel: benchmarkLabelForSymbol(
        metric?.benchmark_symbol ?? benchmarkSymbolForCountry(portfolio.country),
      ),
      dataPoints: metric?.data_points ?? null,
      asOf: metric?.as_of ?? "",
      href: `/portfolio/${portfolio.slug}`,
      locked,
      source: metric ? "portfolio_metrics (Supabase)" : undefined,
      note: locked
        ? "Métricas y serie disponibles con el plan Pro."
        : metric
          ? undefined
          : "Todavía no hay métricas precalculadas suficientes para este portafolio.",
    };
  });

  const rows = rankSources([...portfolioSources, ...RESEARCH_RESULTS]);
  const { winners, losers, ties, noData } = splitByOutcome(rows);
  const locked = noData.filter((row) => row.locked);
  const missing = noData.filter((row) => !row.locked);
  const withData = winners.length + losers.length + ties.length;
  const cutDates = rows
    .map((row) => row.asOf)
    .filter((value) => value.length > 0)
    .sort();

  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page py-16 md:py-20">
          <p className="label-line">Ranking honesto</p>
          <h1 className="type-section mt-3 text-ink-900">
            Todas las fuentes contra el mercado.
          </h1>
          <p className="type-body mt-5 max-w-2xl">
            Cada portafolio y cada estudio se mide contra el benchmark de su país.
            Ordenamos por exceso de retorno. También publicamos las que pierden:
            esconderlas sería elegir el resultado después de conocerlo.
          </p>

          <div className="mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-ink-200 py-5">
            <p className="text-[15px] text-ink-900">
              <span className="num text-[30px] leading-none">{winners.length}</span>{" "}
              <span className="text-ink-500">de {withData} le ganan a su benchmark.</span>
            </p>
            <p className="text-[15px] text-ink-900">
              <span className="num text-[30px] leading-none">{losers.length}</span>{" "}
              <span className="text-ink-500">pierden.</span>
            </p>
            {locked.length > 0 && (
              <p className="text-[13px] text-ink-500">
                {locked.length} con métricas en Pro.
              </p>
            )}
            {missing.length > 0 && (
              <p className="text-[13px] text-ink-500">
                {missing.length} sin datos suficientes.
              </p>
            )}
            {cutDates.length > 0 && (
              <p className="ml-auto text-[13px] text-ink-500">
                Último corte: {formatAsOf(cutDates[cutDates.length - 1])}
              </p>
            )}
          </div>

          <section className="mt-14" aria-labelledby="ganan-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2
                id="ganan-heading"
                className="text-[22px] font-medium tracking-[-0.03em] text-ink-900"
              >
                Le ganan a su benchmark
              </h2>
              <Link
                href="/metodologia"
                className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-ink-900"
              >
                Metodología
              </Link>
            </div>
            {winners.length === 0 ? (
              <p className="mt-5 border-t border-ink-200 py-4 text-[15px] text-ink-500">
                Ninguna fuente supera a su benchmark con los datos disponibles.
              </p>
            ) : (
              <RankingTable rows={winners} />
            )}
          </section>

          <section className="mt-14" aria-labelledby="pierden-heading">
            <h2
              id="pierden-heading"
              className="text-[22px] font-medium tracking-[-0.03em] text-ink-900"
            >
              Pierden contra su benchmark
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">
              Estas fuentes también se publican. El exceso negativo está calculado
              con las mismas reglas que el positivo.
            </p>
            {losers.length === 0 ? (
              <p className="mt-5 border-t border-ink-200 py-4 text-[15px] text-ink-500">
                No hay fuentes con exceso negativo en el corte actual.
              </p>
            ) : (
              <RankingTable rows={losers} />
            )}
          </section>

          {ties.length > 0 && (
            <section className="mt-14" aria-labelledby="empatan-heading">
              <h2
                id="empatan-heading"
                className="text-[22px] font-medium tracking-[-0.03em] text-ink-900"
              >
                Empatan con su benchmark
              </h2>
              <RankingTable rows={ties} />
            </section>
          )}

          {locked.length > 0 && (
            <section className="mt-14" aria-labelledby="pro-heading">
              <h2
                id="pro-heading"
                className="text-[15px] font-medium text-ink-900"
              >
                Métricas disponibles en Pro
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">
                Estos portafolios participan del ranking, pero sus cifras y su
                serie están detrás del muro. No publicamos números premium sin
                plan de pago.
              </p>
              <ul className="mt-4 border-t border-ink-200">
                {locked.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink-200 py-3"
                  >
                    <span className="inline-flex items-center gap-2 text-[15px] text-ink-900">
                      <Lock className="size-3.5 text-ink-500" strokeWidth={1.5} />
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                      <span className="border border-ink-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                        Pro
                      </span>
                    </span>
                    <span className="text-[12px] text-ink-500">
                      {row.benchmarkLabel} · cifras en Pro
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {missing.length > 0 && (
            <section className="mt-14" aria-labelledby="sindatos-heading">
              <h2
                id="sindatos-heading"
                className="text-[15px] font-medium text-ink-900"
              >
                Sin datos suficientes
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">
                No inventamos un cero. Estos portafolios aparecen cuando el scraper
                tenga serie y benchmark comparables.
              </p>
              <ul className="mt-4 border-t border-ink-200">
                {missing.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink-200 py-3"
                  >
                    <span className="text-[15px] text-ink-900">
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </span>
                    <span className="text-[12px] text-ink-500">
                      {row.benchmarkLabel} · sin datos
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-16 border-t border-ink-200 pt-8" aria-labelledby="estudios-heading">
            <h2
              id="estudios-heading"
              className="text-[22px] font-medium tracking-[-0.03em] text-ink-900"
            >
              Cómo se midió cada estudio
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-500">
              Las cifras de los estudios son históricas y tienen fecha de corte.
              Cada una enlaza su fuente pública.
            </p>
            <dl className="mt-6 grid grid-cols-1 gap-px border border-ink-200 bg-ink-200 md:grid-cols-2">
              {RESEARCH_RESULTS.map((study) => (
                <div key={study.id} className="bg-white p-5">
                  <dt className="text-[15px] font-medium text-ink-900">
                    {study.name}
                  </dt>
                  <dd className="mt-2 text-[13px] leading-relaxed text-ink-600">
                    {study.method}
                  </dd>
                  <dd className="mt-3 text-[12px] leading-relaxed text-ink-500">
                    Corte {formatAsOf(study.asOf)}
                    {study.sampleSize !== null ? (
                      <>
                        {" · "}
                        {study.sampleSize} {study.sampleUnit}
                      </>
                    ) : null}
                    {" · "}
                    {study.sourceUrl ? (
                      <a
                        href={study.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-900 underline underline-offset-4"
                      >
                        {study.source}
                      </a>
                    ) : (
                      study.source
                    )}
                  </dd>
                  {study.detail && study.detail.length > 0 && (
                    <dd className="mt-3 border-t border-ink-200 pt-2 text-[12px] text-ink-500">
                      {study.detail.map((item) => (
                        <span key={item.name} className="block py-0.5">
                          <span className="text-ink-700">{item.name}:</span>{" "}
                          <span className="num">{formatPercent(item.returnPct, 2)}</span>
                          {item.benchmarkReturnPct !== undefined ? (
                            <span className="num">
                              {" "}
                              vs SPY {formatPercent(item.benchmarkReturnPct, 2)}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-16 border-t border-ink-200 pt-8" aria-labelledby="metodo-heading">
            <h2
              id="metodo-heading"
              className="text-[22px] font-medium tracking-[-0.03em] text-ink-900"
            >
              Metodología del ranking
            </h2>
            <ul className="mt-5 max-w-3xl list-disc space-y-2.5 pl-6 text-[15px] leading-relaxed text-ink-600">
              <li>
                <strong className="font-medium text-ink-900">Benchmark de EE.UU.</strong>:
                S&P 500, replicable con el ETF SPY. Para Chile usamos el IPSA con{" "}
                <strong className="font-medium text-ink-900">ECH en CLP</strong> como
                proxy, rotulado así en cada fila. El ECH sigue el índice MSCI Chile,
                no el IPSA exacto, y agrega costo y riesgo de tipo de cambio.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Exceso de retorno</strong>:
                retorno acumulado de la fuente menos retorno acumulado del benchmark,
                en puntos porcentuales, sobre fechas alineadas. Es un exceso
                aritmético, no un alfa de modelo de factores.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Sin dividendos ni costos</strong>:
                se usan precios de cierre. No se descuentan comisiones, impuestos ni
                conversión de moneda. El retorno real de una estrategia ejecutable
                sería menor.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Muestra chica</strong>:
                con menos de 30 puntos de datos la fila se rotula{" "}
                <span className="border border-ink-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                  {SMALL_SAMPLE_LABEL}
                </span>
                . El número se muestra igual, pero no alcanza para sacar conclusiones.
              </li>
              <li>
                <strong className="font-medium text-ink-900">Perdedores incluidos</strong>:
                el ranking no filtra por resultado. Las fuentes sin datos quedan al
                final, sin número, porque un cero sería un dato falso.
              </li>
            </ul>
            <p className="mt-6 text-[13px] text-ink-500">
              El detalle de retornos, volatilidad, Sharpe y máxima caída está en{" "}
              <Link href="/metodologia" className="text-ink-900 underline underline-offset-4">
                /metodologia
              </Link>
              .
            </p>
          </section>

          <div className="mt-12">
            <LegalNotice kind="simulation" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function RankingTable({ rows }: { rows: RankedSource[] }) {
  return (
    <div className="mt-5">
      <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_6rem_8rem_6rem] gap-4 border-y border-ink-200 py-2 text-[11px] uppercase tracking-[0.12em] text-ink-500 sm:grid">
        <span>#</span>
        <span>Fuente</span>
        <span className="text-right">Retorno</span>
        <span className="text-right">Benchmark</span>
        <span className="text-right">Exceso</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="border-b border-ink-200 py-4">
            <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_8rem_6rem] sm:items-baseline">
              <span className="num text-[12px] text-ink-500">
                {row.rank !== null ? String(row.rank).padStart(2, "0") : "—"}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {row.href ? (
                    <Link
                      href={row.href}
                      className="text-[15px] text-ink-900 underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    <span className="text-[15px] text-ink-900">{row.name}</span>
                  )}
                  {row.smallSample && (
                    <span className="border border-ink-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                      {SMALL_SAMPLE_LABEL}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-ink-500">
                  {row.kind === "estudio" ? "Estudio" : "Portafolio"} ·{" "}
                  {row.benchmarkLabel}
                  {row.asOf ? ` · corte ${formatAsOf(row.asOf)}` : ""}
                </p>
                <p className="mt-1 text-[12px] text-ink-500 sm:hidden">
                  Retorno {row.returnPct !== null ? formatPercent(row.returnPct, 2) : "—"}{" "}
                  · Benchmark{" "}
                  {row.benchmarkReturnPct !== null
                    ? formatPercent(row.benchmarkReturnPct, 2)
                    : "—"}
                </p>
                {row.note && (
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                    {row.note}
                  </p>
                )}
              </div>
              <span className="num hidden text-right text-[13px] text-ink-700 sm:block">
                {row.returnPct !== null ? formatPercent(row.returnPct, 2) : "—"}
              </span>
              <span className="num hidden text-right text-[13px] text-ink-500 sm:block">
                {row.benchmarkReturnPct !== null
                  ? formatPercent(row.benchmarkReturnPct, 2)
                  : "—"}
              </span>
              <span
                className={cn(
                  "num col-start-2 text-[15px] sm:col-start-auto sm:text-right",
                  row.excessReturnPct !== null && row.excessReturnPct > 0 && "text-positive",
                  row.excessReturnPct !== null && row.excessReturnPct < 0 && "text-negative",
                  row.excessReturnPct === null && "text-ink-500",
                )}
              >
                {formatExcess(row.excessReturnPct)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
