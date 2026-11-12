import { JsonLd } from "@/components/json-ld";
import { itemListSchema, withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { getPerformanceSeriesAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { isPaidPlan } from "@/lib/types";
import { canonicalPortfolioSlug, isLegacyPortfolioSlug } from "@/lib/portfolio-canonical";
import {
  benchmarkSymbolForCountry,
  getBeatTheMarketRanking,
} from "@/lib/performance-queries";
import {
  benchmarkLabelForSymbol,
  rankSources,
  splitByOutcome,
  type RankedSource,
  type RankingSourceInput,
} from "@/lib/ranking";
import { RESEARCH_RESULTS } from "@/lib/research-results";
import { cn, formatPercent } from "@/lib/utils";

export const metadata: Metadata = withSeo("/ranking", {
  title: "Ranking honesto — todas las fuentes contra el mercado",
  description:
    "Cada portafolio y estudio de fraccion.si contra el benchmark de su país: S&P 500 (SPY) en Estados Unidos e IPSA (ECH en CLP) en Chile. Incluye las fuentes que pierden, con fecha de corte y metodología.",
});

// Lee cookies de auth (getPortfolios) por request; nunca se prerenderiza.
export const instant = false;

function formatExcess(value: number | null): string {
  if (value === null) return "—";
  return formatPercent(value, 2).replace("%", " pp");
}

function formatPct(value: number | null): string {
  return value === null ? "—" : formatPercent(value, 2);
}

function formatAsOf(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return "sin fecha";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Verde y rojo solo en la cifra; el resto queda en tinta o gris. */
function toneClass(value: number | null): string {
  if (value === null) return "text-ink-500";
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-ink-900";
}

export default async function RankingPage() {
  await connection();

  const [portfolios, metrics, profile] = await Promise.all([
    getPortfolios(),
    getBeatTheMarketRanking(500),
    getProfile(),
  ]);
  const paid = isPaidPlan(profile?.plan);
  // B8: los slugs viejos redirigen 301 al canónico; no se rankean dos veces.
  const visible = portfolios.filter((portfolio) => !isLegacyPortfolioSlug(portfolio.slug));
  // Fecha de inicio real de cada serie, para rotular "retorno total desde <fecha>".
  const seriesById = await getPerformanceSeriesAdmin(visible.map((p) => p.id)).catch(() => new Map());

  const metricsByPortfolio = new Map(metrics.map((row) => [row.portfolio_id, row]));

  const portfolioSources: RankingSourceInput[] = visible.map((portfolio) => {
    // Muro 048: las métricas de un portafolio premium solo las ve quien paga.
    // A los demás se les muestra el portafolio sin cifras.
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
      startDate: metric ? (seriesById.get(portfolio.id)?.[0]?.date ?? null) : null,
      href: `/portfolio/${canonicalPortfolioSlug(portfolio.slug)}`,
      locked,
      source: metric ? "portfolio_metrics (Supabase)" : undefined,
      note: locked
        ? "Métricas y serie disponibles en los planes pagos."
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
  const lastCut = cutDates.length > 0 ? formatAsOf(cutDates[cutDates.length - 1]) : null;
  const ranked = rows
    .filter((row) => row.excessReturnPct !== null)
    .sort((a, b) => (b.excessReturnPct ?? 0) - (a.excessReturnPct ?? 0));
  const winRate = withData > 0 ? (winners.length / withData) * 100 : null;
  const best = ranked[0] ?? null;

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-app-canvas">
        <JsonLd
          data={itemListSchema(
            "Ranking honesto de fraccion.si",
            rows.filter((r) => r.rank !== null).map((r) => ({ name: r.name })),
          )}
        />
        <div className="container-page py-10 sm:py-14">
          <header className="max-w-[46rem]">
            <p className="label-line">Ranking</p>
            <h1 className="type-section mt-3 text-ink-900">
              Todas las fuentes contra el mercado
            </h1>
            <p className="mt-4 max-w-[42rem] text-[17px] leading-relaxed text-ink-500">
              Cada portafolio y cada estudio se mide contra el benchmark de su país
              y se ordena por exceso de retorno. La lista incluye a los que pierden
              contra su índice.
            </p>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[13px] text-ink-500">
              <Link
                href="/metodologia"
                className="text-ink-900 underline-offset-4 hover:underline"
              >
                Cómo calculamos el ranking
              </Link>
              {lastCut ? <span>Último corte: {lastCut}</span> : null}
            </div>
          </header>

          {/* Cifras de conjunto */}
          <div className="app-kpi-strip mt-8">
            <Kpi
              label="Le ganan a su benchmark"
              value={withData > 0 ? `${winners.length} de ${withData}` : null}
              hint={winRate !== null ? `${Math.round(winRate)}% de las fuentes con datos` : undefined}
            />
            <Kpi
              label="Pierden contra su benchmark"
              value={withData > 0 ? String(losers.length) : null}
              hint={ties.length > 0 ? `${ties.length} empatan` : undefined}
            />
            <Kpi
              label="Mejor exceso"
              value={best ? formatExcess(best.excessReturnPct) : null}
              hint={best ? best.name : undefined}
            />
            <Kpi
              label="Sin cifras"
              value={String(noData.length)}
              hint={
                noData.length === 0
                  ? "Todas las fuentes tienen cifras"
                  : `${locked.length} para suscriptores · ${missing.length} sin datos`
              }
            />
          </div>

          {withData === 0 ? (
            <section aria-labelledby="sin-cifras-heading" className="mt-12 border-t border-line pt-6">
              <h2
                id="sin-cifras-heading"
                className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
              >
                Todavía no hay cifras para comparar
              </h2>
              <p className="mt-2 max-w-[42rem] text-[15px] leading-relaxed text-ink-500">
                Ninguna fuente tiene el historial mínimo para calcular un retorno
                contra su benchmark. Preferimos dejar el espacio vacío antes que
                publicar un cero que no existe. Los estudios de abajo sí tienen
                cifras y fecha de corte.
              </p>
            </section>
          ) : null}

          {/* Exceso de retorno */}
          {ranked.length > 0 ? (
            <section aria-labelledby="grafico-heading" className="mt-12 border-t border-line pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2
                  id="grafico-heading"
                  className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
                >
                  Exceso de retorno contra el benchmark
                </h2>
                <p className="text-[13px] text-ink-500">
                  Puntos porcentuales · {ranked.length}{" "}
                  {ranked.length === 1 ? "fuente" : "fuentes"} con datos
                </p>
              </div>
              <ExcessChart rows={ranked} />
            </section>
          ) : null}

          <RankingGroup
            id="ganan"
            title="Le ganan a su benchmark"
            rows={winners}
            emptyLabel={
              withData > 0 ? "Todavía ninguna fuente supera a su índice." : undefined
            }
          />
          <RankingGroup id="pierden" title="Pierden contra su benchmark" rows={losers} />
          <RankingGroup id="empatan" title="Empatan con su benchmark" rows={ties} />

          {locked.length > 0 || missing.length > 0 ? (
            <div className="mt-12 grid gap-10 border-t border-line pt-6 lg:grid-cols-2">
              {locked.length > 0 ? (
                <section aria-labelledby="suscriptores-heading">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <h2
                      id="suscriptores-heading"
                      className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
                    >
                      Métricas para suscriptores
                    </h2>
                    <Link
                      href="/planes"
                      className="text-[13px] text-ink-900 underline-offset-4 hover:underline"
                    >
                      Ver planes
                    </Link>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                    El dato existe: lo reconstruimos, pero su serie y sus métricas
                    son de pago. Si la fuente es un informe oficial de EE.UU., el
                    documento original sigue público y gratis en el sitio del
                    gobierno.
                  </p>
                  <ul className="mt-4 border-t border-line">
                    {locked.map((row) => (
                      <SimpleRow
                        key={row.id}
                        row={row}
                        trailing={
                          <span className="shrink-0 text-[13px] text-ink-500">Plan de pago</span>
                        }
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
              {missing.length > 0 ? (
                <section aria-labelledby="sin-datos-heading">
                  <h2
                    id="sin-datos-heading"
                    className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
                  >
                    Sin datos suficientes
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                    Sin número, porque un cero sería un dato falso.
                  </p>
                  <ul className="mt-4 border-t border-line">
                    {missing.map((row) => (
                      <SimpleRow
                        key={row.id}
                        row={row}
                        trailing={
                          <span aria-hidden className="shrink-0 text-[13px] text-ink-500">
                            —
                          </span>
                        }
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          {/* Estudios */}
          <section aria-labelledby="estudios-heading" className="mt-12 border-t border-line pt-6">
            <h2
              id="estudios-heading"
              className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
            >
              Cómo se midió cada estudio
            </h2>
            <p className="mt-2 max-w-[42rem] text-[13px] leading-relaxed text-ink-500">
              Simulaciones históricas con fecha de corte y fuente pública. No son
              carteras ejecutables ni recomendaciones de inversión.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
              {RESEARCH_RESULTS.map((study) => (
                <article key={study.id} className="border-t border-line pt-4">
                  <h3 className="text-[16px] font-medium leading-snug tracking-[-0.01em] text-ink-900">
                    {study.name}
                  </h3>
                  <p className="mt-1 text-[13px] text-ink-500">
                    Corte {formatAsOf(study.asOf)}
                    {study.sampleSize !== null
                      ? ` · ${study.sampleSize}${study.sampleUnit ? ` ${study.sampleUnit}` : ""}`
                      : ""}
                  </p>
                  <p className="mt-3 text-[14px] leading-relaxed text-ink-500">{study.method}</p>
                  {study.detail && study.detail.length > 0 ? (
                    <ul className="mt-3 border-t border-line">
                      {study.detail.map((item) => (
                        <li
                          key={item.name}
                          className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[13px]"
                        >
                          <span className="min-w-0 truncate text-ink-700">{item.name}</span>
                          <span className="num shrink-0 text-ink-900">
                            <span className={toneClass(item.returnPct)}>
                              {formatPercent(item.returnPct, 2)}
                            </span>
                            {item.benchmarkReturnPct !== undefined ? (
                              <span className="font-normal text-ink-500">
                                {" "}
                                vs {study.country === "CL" ? "ECH" : "SPY"}{" "}
                                {formatPercent(item.benchmarkReturnPct, 2)}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                    Fuente:{" "}
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
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* Criterio — corto, sin repetir Metodología */}
          <section aria-labelledby="criterio-heading" className="mt-12 border-t border-line pt-6">
            <h2
              id="criterio-heading"
              className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
            >
              Cómo se lee este ranking
            </h2>
            <dl className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
              <Criterion title="Benchmark">
                S&amp;P 500 (SPY) en Estados Unidos. En Chile, el IPSA con{" "}
                <strong className="font-medium text-ink-900">ECH en CLP</strong> como
                proxy: sigue el MSCI Chile, no el IPSA exacto, y agrega costo y
                riesgo de tipo de cambio.
              </Criterion>
              <Criterion title="Exceso de retorno">
                Retorno acumulado de la fuente menos el del benchmark, sobre fechas
                alineadas. Se expresa en puntos porcentuales y es un exceso
                aritmético, no un alfa de factores.
              </Criterion>
              <Criterion title="Sin dividendos ni costos">
                Precios de cierre, sin comisiones, impuestos ni conversión de
                moneda. El retorno de una estrategia ejecutable sería menor.
              </Criterion>
              <Criterion title="Perdedores incluidos">
                La lista no filtra por resultado. Si una fuente no tiene datos
                suficientes, queda sin número: un cero sería un dato falso.
              </Criterion>
            </dl>
            <p className="mt-6 max-w-[42rem] text-[13px] leading-relaxed text-ink-500">
              Ventanas, volatilidad, Sharpe y máxima caída están en{" "}
              <Link
                href="/metodologia"
                className="text-ink-900 underline underline-offset-4"
              >
                Metodología
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

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[13px] leading-tight text-ink-500">{label}</p>
      {value ? (
        <p className="num mt-2 text-[26px] leading-none text-ink-900">{value}</p>
      ) : (
        <p className="mt-2 text-[15px] leading-none text-ink-500">Sin datos</p>
      )}
      {hint ? <p className="mt-2 text-[13px] leading-snug text-ink-500">{hint}</p> : null}
    </div>
  );
}

function Criterion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <dt className="text-[15px] font-medium text-ink-900">{title}</dt>
      <dd className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{children}</dd>
    </div>
  );
}

function NameLink({ row, className }: { row: RankedSource; className?: string }) {
  return row.href ? (
    <Link href={row.href} className={cn("underline-offset-4 hover:underline", className)}>
      {row.name}
    </Link>
  ) : (
    <span className={className}>{row.name}</span>
  );
}

/** Barras divergentes de exceso, en SVG propio y en tinta. */
function ExcessChart({ rows }: { rows: RankedSource[] }) {
  const shown = rows.slice(0, 24);
  const max = Math.max(...shown.map((r) => Math.abs(r.excessReturnPct ?? 0)), 1);
  return (
    <div className="mt-5">
      <ol aria-label="Exceso de retorno por fuente" className="border-t border-line">
        {shown.map((row) => {
          const v = row.excessReturnPct ?? 0;
          const pct = (Math.abs(v) / max) * 45;
          return (
            <li
              key={row.id}
              className="grid h-[30px] grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.5rem] items-center gap-2 border-b border-line sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_5.5rem] sm:gap-3"
            >
              <span className="truncate text-[13px] text-ink-700">{row.name}</span>
              <svg
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                className="h-2.5 w-full"
                aria-hidden
              >
                <line
                  x1="50"
                  y1="0"
                  x2="50"
                  y2="10"
                  className="stroke-ink-300"
                  strokeWidth="0.6"
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={v >= 0 ? 50 : 50 - pct}
                  y="1.5"
                  width={Math.max(pct, 0.6)}
                  height="7"
                  className="fill-ink-900"
                />
              </svg>
              <span
                className={cn(
                  "num text-right text-[13px]",
                  toneClass(row.excessReturnPct),
                )}
              >
                {formatExcess(row.excessReturnPct)}
              </span>
            </li>
          );
        })}
      </ol>
      {rows.length > shown.length ? (
        <p className="mt-3 text-[13px] text-ink-500">
          +{rows.length - shown.length} fuentes más en las tablas de abajo.
        </p>
      ) : null}
    </div>
  );
}

function RankingGroup({
  id,
  title,
  rows,
  emptyLabel,
}: {
  id: string;
  title: string;
  rows: RankedSource[];
  emptyLabel?: string;
}) {
  if (rows.length === 0 && !emptyLabel) return null;
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-12 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          id={`${id}-heading`}
          className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
        >
          {title}
        </h2>
        <p className="text-[13px] text-ink-500">
          {rows.length} {rows.length === 1 ? "fuente" : "fuentes"}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-[15px] leading-relaxed text-ink-500">{emptyLabel}</p>
      ) : (
        <div className="mt-4">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              {title}. Posición, retorno acumulado, retorno del benchmark y exceso
              de retorno.
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-9 py-2.5 pr-2 text-[13px] font-normal text-ink-500">
                  #
                </th>
                <th scope="col" className="py-2.5 pr-3 text-[13px] font-normal text-ink-500">
                  Fuente
                </th>
                <th
                  scope="col"
                  className="hidden w-[7rem] px-3 py-2.5 text-right text-[13px] font-normal text-ink-500 sm:table-cell"
                >
                  Retorno
                </th>
                <th
                  scope="col"
                  className="hidden w-[7rem] px-3 py-2.5 text-right text-[13px] font-normal text-ink-500 md:table-cell"
                >
                  Benchmark
                </th>
                <th
                  scope="col"
                  className="w-[6.5rem] py-2.5 pl-3 text-right text-[13px] font-normal text-ink-500"
                >
                  Exceso
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RankingRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RankingRow({ row }: { row: RankedSource }) {
  return (
    <tr className="border-b border-line align-top">
      <td className="num py-3 pr-2 text-[13px] text-ink-500">
        {row.rank !== null ? String(row.rank).padStart(2, "0") : "—"}
      </td>
      <td className="py-3 pr-3">
        <NameLink
          row={row}
          className="text-[15px] font-medium leading-snug text-ink-900"
        />
        <p className="mt-0.5 text-[13px] leading-snug text-ink-500">
          {row.kind === "estudio" ? "Estudio" : "Portafolio"} · {row.benchmarkLabel}
          {row.startDate ? ` · Retorno total desde ${formatAsOf(row.startDate)}` : ""}
          {row.asOf ? ` · corte ${formatAsOf(row.asOf)}` : ""}
        </p>
        <p className="num mt-1 text-[13px] text-ink-500 sm:hidden">
          Retorno {formatPct(row.returnPct)} · Benchmark {formatPct(row.benchmarkReturnPct)}
        </p>
        {row.smallSample ? (
          <p className="mt-1 text-[13px] text-ink-500">
            Serie corta: menos de 30 puntos de datos. El número se muestra, pero
            no alcanza para concluir.
          </p>
        ) : null}
        {row.note ? (
          <p className="mt-1 text-[13px] leading-snug text-ink-500">{row.note}</p>
        ) : null}
      </td>
      <td
        className={cn(
          "num hidden px-3 py-3 text-right text-[13px] sm:table-cell",
          toneClass(row.returnPct),
        )}
      >
        {formatPct(row.returnPct)}
      </td>
      <td className="num hidden px-3 py-3 text-right text-[13px] text-ink-500 md:table-cell">
        {formatPct(row.benchmarkReturnPct)}
      </td>
      <td
        className={cn(
          "num whitespace-nowrap py-3 pl-3 text-right text-[15px]",
          toneClass(row.excessReturnPct),
        )}
      >
        {formatExcess(row.excessReturnPct)}
      </td>
    </tr>
  );
}

function SimpleRow({ row, trailing }: { row: RankedSource; trailing: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line py-2.5">
      <div className="min-w-0 flex-1">
        <NameLink
          row={row}
          className="block truncate text-[15px] font-medium text-ink-900"
        />
        <p className="mt-0.5 text-[13px] text-ink-500">{row.benchmarkLabel}</p>
      </div>
      {trailing}
    </li>
  );
}
