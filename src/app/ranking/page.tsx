import { JsonLd } from "@/components/json-ld";
import { itemListSchema, withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, Lock, Trophy } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { Chip, StatCard } from "@/components/app";
import { getPerformanceSeriesAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { isPaidPlan, type Portfolio } from "@/lib/types";
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

function toneClass(value: number | null): string {
  if (value === null) return "text-ink-500";
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-ink-700";
}

export default async function RankingPage() {
  await connection();

  const [portfolios, metrics, profile] = await Promise.all([
    getPortfolios(),
    getBeatTheMarketRanking(500),
    getProfile(),
  ]);
  const paid = isPaidPlan(profile?.plan);
  // Fecha de inicio real de cada serie, para rotular "retorno total desde <fecha>".
  const seriesById = await getPerformanceSeriesAdmin(portfolios.map((p) => p.id)).catch(() => new Map());

  const metricsByPortfolio = new Map(metrics.map((row) => [row.portfolio_id, row]));
  const portfolioById = new Map<string, Portfolio>(
    portfolios.map((portfolio) => [`portfolio-${portfolio.id}`, portfolio]),
  );

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
      startDate: metric ? (seriesById.get(portfolio.id)?.[0]?.date ?? null) : null,
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
  const lastCut = cutDates.length > 0 ? formatAsOf(cutDates[cutDates.length - 1]) : null;
  const ranked = rows
    .filter((row) => row.excessReturnPct !== null)
    .sort((a, b) => (b.excessReturnPct ?? 0) - (a.excessReturnPct ?? 0));
  const podium = winners.slice(0, 3);
  const winRate = withData > 0 ? (winners.length / withData) * 100 : null;
  const best = ranked[0] ?? null;

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-app-canvas">
        <JsonLd data={itemListSchema("Ranking honesto de fraccion.si", rows.filter((r) => r.rank !== null).map((r) => ({ name: r.name })))} />
        <div className="container-page py-8 sm:py-12 md:py-16">
          {/* Hero */}
          <header className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="info">
                <Trophy aria-hidden className="mr-1 size-3.5" />
                Ranking honesto
              </Chip>
              {lastCut ? <Chip>Corte {lastCut}</Chip> : null}
            </div>
            <h1 className="mt-4 text-app-display font-semibold tracking-tight text-ink-900">
              Todas las fuentes contra el mercado
            </h1>
            <p className="mt-3 text-app-body text-ink-600">
              Cada portafolio y cada estudio se mide contra el benchmark de su país y se
              ordena por exceso de retorno. También publicamos las que pierden.
            </p>
          </header>

          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 lg:grid-cols-4">
            <StatCard
              label="Le ganan al mercado"
              value={withData > 0 ? `${winners.length} de ${withData}` : null}
              hint={winRate !== null ? `${winRate.toFixed(0)}% de las fuentes con datos` : undefined}
            />
            <StatCard label="Pierden contra su benchmark" value={withData > 0 ? String(losers.length) : null} hint={ties.length > 0 ? `${ties.length} empatan` : undefined} />
            <StatCard
              label="Mejor exceso"
              value={best ? formatExcess(best.excessReturnPct) : null}
              hint={best ? best.name : undefined}
            />
            <StatCard
              label="Sin cifras"
              value={String(noData.length)}
              hint={`${locked.length} en Pro · ${missing.length} sin datos`}
            />
          </div>

          {/* Podio */}
          {podium.length > 0 && (
            <section aria-labelledby="podio-heading" className="mt-8">
              <h2 id="podio-heading" className="text-app-title font-semibold text-ink-900">
                Podio
              </h2>
              <ol className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
                {podium.map((row, index) => (
                  <li key={row.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                    <PodiumCard row={row} place={index + 1} portfolio={portfolioById.get(row.id)} />
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Gráfico de exceso */}
          {ranked.length > 0 && (
            <section aria-labelledby="grafico-heading" className="app-card mt-8 rounded-2xl p-4 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="grafico-heading" className="text-app-title font-semibold text-ink-900">
                  Exceso de retorno vs benchmark
                </h2>
                <p className="text-app-caption text-ink-500">Puntos porcentuales · {ranked.length} fuentes</p>
              </div>
              <ExcessChart rows={ranked} />
            </section>
          )}

          <RankingGroup
            id="ganan"
            title="Le ganan a su benchmark"
            tone="buy"
            rows={winners}
            portfolioById={portfolioById}
            action={
              <Link href="/metodologia" className="text-app-caption font-medium text-ink-500 hover:text-ink-900">
                Cómo medimos →
              </Link>
            }
          />
          <RankingGroup id="pierden" title="Pierden contra su benchmark" tone="sell" rows={losers} portfolioById={portfolioById} />
          <RankingGroup id="empatan" title="Empatan con su benchmark" tone="neutral" rows={ties} portfolioById={portfolioById} />

          {(locked.length > 0 || missing.length > 0) && (
            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              {locked.length > 0 && (
                <section aria-labelledby="pro-heading" className="app-card rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 id="pro-heading" className="flex items-center gap-2 text-app-title font-semibold text-ink-900">
                      <Lock aria-hidden className="size-4" />
                      Métricas en Pro
                    </h2>
                    <Link href="/upgrade" className="text-app-caption font-medium text-ink-900 hover:underline">
                      Ver planes
                    </Link>
                  </div>
                  <ul className="mt-3 divide-y divide-app-border">
                    {locked.map((row) => (
                      <SimpleRow key={row.id} row={row} portfolio={portfolioById.get(row.id)} trailing={<Lock aria-hidden className="size-4 text-ink-400" />} />
                    ))}
                  </ul>
                </section>
              )}
              {missing.length > 0 && (
                <section aria-labelledby="sin-datos-heading" className="app-card rounded-2xl p-4 sm:p-5">
                  <h2 id="sin-datos-heading" className="text-app-title font-semibold text-ink-900">
                    Sin datos suficientes
                  </h2>
                  <p className="mt-1 text-app-caption text-ink-500">Sin número, porque un cero sería un dato falso.</p>
                  <ul className="mt-3 divide-y divide-app-border">
                    {missing.map((row) => (
                      <SimpleRow key={row.id} row={row} portfolio={portfolioById.get(row.id)} trailing={<span className="text-app-caption text-ink-400">—</span>} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {/* Estudios */}
          <section className="mt-12" aria-labelledby="estudios-heading">
            <h2 id="estudios-heading" className="text-app-title font-semibold text-ink-900">
              Cómo se midió cada estudio
            </h2>
            <p className="mt-1 max-w-2xl text-app-caption text-ink-500">
              Cifras históricas con fecha de corte. Cada una enlaza su fuente pública.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {RESEARCH_RESULTS.map((study) => (
                <article key={study.id} className="app-card flex flex-col rounded-2xl p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-700">
                      <FlaskConical className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-semibold text-ink-900">{study.name}</h3>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Chip>Corte {formatAsOf(study.asOf)}</Chip>
                        {study.sampleSize !== null ? (
                          <Chip>
                            {study.sampleSize} {study.sampleUnit}
                          </Chip>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-600">{study.method}</p>
                  {study.detail && study.detail.length > 0 && (
                    <ul className="mt-3 space-y-1.5 rounded-xl bg-ink-50 p-3">
                      {study.detail.map((item) => (
                        <li key={item.name} className="flex items-baseline justify-between gap-3 text-[12px]">
                          <span className="min-w-0 truncate text-ink-700">{item.name}</span>
                          <span className="num shrink-0 tabular-nums">
                            <span className={toneClass(item.returnPct)}>{formatPercent(item.returnPct, 2)}</span>
                            {item.benchmarkReturnPct !== undefined ? (
                              <span className="text-ink-500"> vs SPY {formatPercent(item.benchmarkReturnPct, 2)}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-auto pt-3 text-app-caption text-ink-500">
                    Fuente:{" "}
                    {study.sourceUrl ? (
                      <a
                        href={study.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 font-medium text-ink-900 hover:underline"
                      >
                        {study.source}
                        <ArrowUpRight aria-hidden className="size-3" />
                      </a>
                    ) : (
                      study.source
                    )}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* Metodología */}
          <section className="mt-12" aria-labelledby="metodo-heading">
            <h2 id="metodo-heading" className="text-app-title font-semibold text-ink-900">
              Metodología del ranking
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MethodCard title="Benchmark">
                S&P 500 (ETF SPY) en EE.UU. Para Chile, el IPSA con <strong className="font-medium text-ink-900">ECH en CLP</strong> como
                proxy: sigue el MSCI Chile, no el IPSA exacto, y agrega costo y riesgo de tipo de cambio.
              </MethodCard>
              <MethodCard title="Exceso de retorno">
                Retorno acumulado de la fuente menos el del benchmark, en puntos porcentuales y sobre fechas
                alineadas. Es un exceso aritmético, no un alfa de factores.
              </MethodCard>
              <MethodCard title="Sin dividendos ni costos">
                Precios de cierre, sin comisiones, impuestos ni conversión de moneda. El retorno de una
                estrategia ejecutable sería menor.
              </MethodCard>
              <MethodCard title="Muestra chica">
                Con menos de 30 puntos de datos la fila lleva la etiqueta{" "}
                <Chip className="h-5 px-2 text-[10px] uppercase">{SMALL_SAMPLE_LABEL}</Chip>. El número se muestra,
                pero no alcanza para concluir.
              </MethodCard>
              <MethodCard title="Perdedores incluidos">
                El ranking no filtra por resultado. Las fuentes sin datos quedan al final, sin número.
              </MethodCard>
              <MethodCard title="Más detalle">
                Retornos, volatilidad, Sharpe y máxima caída en{" "}
                <Link href="/metodologia" className="font-medium text-ink-900 underline underline-offset-4">
                  metodología
                </Link>
                .
              </MethodCard>
            </div>
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

function SourceMark({ row, portfolio, size = 40 }: { row: RankedSource; portfolio?: Portfolio; size?: number }) {
  if (portfolio) return <PortfolioAvatar portfolio={portfolio} size={40} />;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-700"
    >
      <FlaskConical className="size-[45%]" />
    </span>
  );
}

function NameLink({ row, className }: { row: RankedSource; className?: string }) {
  return row.href ? (
    <Link href={row.href} className={cn("hover:underline", className)}>
      {row.name}
    </Link>
  ) : (
    <span className={className}>{row.name}</span>
  );
}

const MEDALS = ["bg-amber-400 text-amber-950", "bg-zinc-300 text-zinc-800", "bg-orange-300 text-orange-950"];

function PodiumCard({ row, place, portfolio }: { row: RankedSource; place: number; portfolio?: Portfolio }) {
  return (
    <article className="app-card relative flex h-full flex-col rounded-2xl p-4 transition-shadow hover:shadow-app-raised">
      <span
        className={cn(
          "absolute right-4 top-4 flex size-7 items-center justify-center rounded-full text-[13px] font-bold tabular-nums",
          MEDALS[place - 1] ?? "bg-ink-100 text-ink-700",
        )}
      >
        {place}
      </span>
      <SourceMark row={row} portfolio={portfolio} size={40} />
      <NameLink row={row} className="mt-3 line-clamp-2 pr-8 text-[15px] font-semibold text-ink-900" />
      <p className="mt-0.5 text-app-caption text-ink-500">
        {row.kind === "estudio" ? "Estudio" : "Portafolio"} · {row.benchmarkLabel}
      </p>
      <p className={cn("mt-4 text-[28px] font-semibold leading-none tracking-tight tabular-nums", toneClass(row.excessReturnPct))}>
        {formatExcess(row.excessReturnPct)}
      </p>
      <p className="mt-1.5 text-app-caption tabular-nums text-ink-500">
        {formatPct(row.returnPct)} vs {formatPct(row.benchmarkReturnPct)}
      </p>
      <ComparisonBar value={row.returnPct} benchmark={row.benchmarkReturnPct} />
    </article>
  );
}

/** Dos barras SVG: fuente vs benchmark, en la misma escala. */
function ComparisonBar({ value, benchmark }: { value: number | null; benchmark: number | null }) {
  if (value === null || benchmark === null) return null;
  const max = Math.max(Math.abs(value), Math.abs(benchmark), 1);
  const w = (v: number) => Math.max(2, (Math.abs(v) / max) * 100);
  return (
    <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="mt-3 h-3.5 w-full" aria-hidden>
      <rect x="0" y="0" width="100" height="5" rx="2.5" className="fill-ink-100" />
      <rect x="0" y="0" width={w(value)} height="5" rx="2.5" className={value >= 0 ? "fill-positive" : "fill-negative"} />
      <rect x="0" y="9" width="100" height="5" rx="2.5" className="fill-ink-100" />
      <rect x="0" y="9" width={w(benchmark)} height="5" rx="2.5" className="fill-ink-400" />
    </svg>
  );
}

/** Barras divergentes de exceso, en SVG propio. */
function ExcessChart({ rows }: { rows: RankedSource[] }) {
  const shown = rows.slice(0, 24);
  const max = Math.max(...shown.map((r) => Math.abs(r.excessReturnPct ?? 0)), 1);
  const rowH = 28;
  const H = shown.length * rowH;
  return (
    <ol className="mt-4 space-y-0" aria-label="Exceso de retorno por fuente">
      {shown.map((row) => {
        const v = row.excessReturnPct ?? 0;
        const pct = (Math.abs(v) / max) * 50;
        return (
          <li key={row.id} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_5.5rem]" style={{ height: rowH }}>
            <span className="truncate text-[12px] text-ink-700 sm:text-[13px]">{row.name}</span>
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
              <line x1="50" y1="0" x2="50" y2="10" className="stroke-ink-200" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
              <rect
                x={v >= 0 ? 50 : 50 - pct}
                y="1"
                width={Math.max(pct, 0.6)}
                height="8"
                rx="1.5"
                className={v > 0 ? "fill-positive" : v < 0 ? "fill-negative" : "fill-ink-400"}
              />
            </svg>
            <span className={cn("text-right text-[12px] font-medium tabular-nums sm:text-[13px]", toneClass(row.excessReturnPct))}>
              {formatExcess(row.excessReturnPct)}
            </span>
          </li>
        );
      })}
      {rows.length > shown.length ? (
        <li className="pt-2 text-app-caption text-ink-500" style={{ minHeight: H > 0 ? undefined : 0 }}>
          +{rows.length - shown.length} fuentes más en la tabla.
        </li>
      ) : null}
    </ol>
  );
}

function RankingGroup({
  id,
  title,
  tone,
  rows,
  portfolioById,
  action,
}: {
  id: string;
  title: string;
  tone: "buy" | "sell" | "neutral";
  rows: RankedSource[];
  portfolioById: Map<string, Portfolio>;
  action?: React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="flex items-center gap-2 text-app-title font-semibold text-ink-900">
          {title}
          <Chip tone={tone}>{rows.length}</Chip>
        </h2>
        {action}
      </div>
      <div className="app-card mt-3 overflow-hidden rounded-2xl">
        <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_6rem_7rem_6.5rem] gap-4 border-b border-app-border bg-ink-50 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500 sm:grid">
          <span>#</span>
          <span>Fuente</span>
          <span className="text-right">Retorno total</span>
          <span className="text-right">Benchmark</span>
          <span className="text-right">Exceso</span>
        </div>
        <ul className="divide-y divide-app-border">
          {rows.map((row) => (
            <RankingRow key={row.id} row={row} portfolio={portfolioById.get(row.id)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function RankingRow({ row, portfolio }: { row: RankedSource; portfolio?: Portfolio }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_7rem_6.5rem] sm:gap-4 sm:px-5">
      <span className="text-[12px] font-medium tabular-nums text-ink-400">
        {row.rank !== null ? String(row.rank).padStart(2, "0") : "—"}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <SourceMark row={row} portfolio={portfolio} size={40} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <NameLink row={row} className="truncate text-[15px] font-medium text-ink-900" />
            {row.smallSample && (
              <Chip className="h-5 shrink-0 px-2 text-[10px] uppercase">{SMALL_SAMPLE_LABEL}</Chip>
            )}
          </div>
          <p className="truncate text-app-caption text-ink-500">
            {row.kind === "estudio" ? "Estudio" : "Portafolio"} · {row.benchmarkLabel}
            {row.startDate ? ` · Retorno total desde ${formatAsOf(row.startDate)}` : ""}
            {row.asOf ? ` · corte ${formatAsOf(row.asOf)}` : ""}
          </p>
          <p className="text-app-caption tabular-nums text-ink-500 sm:hidden">
            {formatPct(row.returnPct)} vs {formatPct(row.benchmarkReturnPct)}
          </p>
          {row.note && <p className="mt-0.5 text-app-caption text-ink-500">{row.note}</p>}
        </div>
      </div>
      <span className={cn("hidden text-right text-[13px] tabular-nums sm:block", toneClass(row.returnPct))}>
        {formatPct(row.returnPct)}
      </span>
      <span className="hidden text-right text-[13px] tabular-nums text-ink-500 sm:block">
        {formatPct(row.benchmarkReturnPct)}
      </span>
      <span
        className={cn(
          "justify-self-end rounded-lg px-2 py-1 text-right text-[13px] font-semibold tabular-nums",
          row.excessReturnPct !== null && row.excessReturnPct > 0 && "bg-positive/10 text-positive",
          row.excessReturnPct !== null && row.excessReturnPct < 0 && "bg-negative/10 text-negative",
          (row.excessReturnPct === null || row.excessReturnPct === 0) && "bg-ink-100 text-ink-500",
        )}
      >
        {formatExcess(row.excessReturnPct)}
      </span>
    </li>
  );
}

function SimpleRow({ row, portfolio, trailing }: { row: RankedSource; portfolio?: Portfolio; trailing: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <SourceMark row={row} portfolio={portfolio} size={40} />
      <div className="min-w-0 flex-1">
        <NameLink row={row} className="block truncate text-[14px] font-medium text-ink-900" />
        <p className="truncate text-app-caption text-ink-500">{row.benchmarkLabel}</p>
      </div>
      {trailing}
    </li>
  );
}

function MethodCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="app-card rounded-2xl p-4">
      <h3 className="text-[14px] font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}
