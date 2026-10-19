import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getHoldings, getPortfolios, getPortfolioBySlug } from "@/lib/queries";
import { getInsiderTrades, formatUsd, formatIsoDate } from "@/lib/insider-queries";
import {
  benchmarkSymbolForCountry,
  getBeatTheMarketRanking,
} from "@/lib/performance-queries";
import {
  benchmarkLabelForSymbol,
  rankSources,
  type RankingSourceInput,
} from "@/lib/ranking";
import { RESEARCH_RESULTS } from "@/lib/research-results";
import { formatPercent } from "@/lib/utils";

/**
 * Widgets incrustables para medios (F52).
 *
 * Cuatro tipos: consenso de corredoras, AFP, últimas compras de insiders y
 * ranking honesto. Todos llevan la atribución visible "Datos de reclu.cl".
 * Solo /embed/* puede vivir dentro de un iframe (CSP en next.config.ts).
 *
 * Los datos de funcionarios de EE.UU. son públicos y gratis: 5 U.S.C. § 13107
 * exige disponibilidad sin muro. Ningún widget usa datos personales de
 * InfoProbidad ni entrega recomendaciones personalizadas.
 */
export const instant = false;

export const WIDGET_TIPOS = [
  "consenso-corredoras",
  "afp",
  "insiders",
  "ranking",
] as const;

export type WidgetTipo = (typeof WIDGET_TIPOS)[number];

const WIDGET_META: Record<
  WidgetTipo,
  { label: string; title: string; description: string; height: number }
> = {
  "consenso-corredoras": {
    label: "Consenso de corredoras",
    title: "Consenso de corredoras",
    description:
      "Peso promedio de cada acción entre las corredoras chilenas con cartera completa (BICE y MBI).",
    height: 380,
  },
  afp: {
    label: "AFP",
    title: "AFP: acciones chilenas",
    description:
      "Acciones nacionales declaradas por las AFP chilenas en los reportes de la Superintendencia de Pensiones.",
    height: 400,
  },
  insiders: {
    label: "Insiders",
    title: "Últimas compras de insiders",
    description:
      "Compras en mercado abierto (Form 4) de ejecutivos y directores de empresas que cotizan en EE.UU.",
    height: 400,
  },
  ranking: {
    label: "Ranking",
    title: "Ranking honesto",
    description:
      "Cada portafolio y estudio contra el benchmark de su país, ordenado por exceso de retorno. Incluye los que pierden.",
    height: 400,
  },
};

export function isWidgetTipo(value: string): value is WidgetTipo {
  return (WIDGET_TIPOS as readonly string[]).includes(value);
}

export function widgetIframeHeight(tipo: WidgetTipo): number {
  return WIDGET_META[tipo].height;
}

/** Código de iframe listo para pegar. La atribución va dentro del widget. */
export function widgetIframeCode(tipo: WidgetTipo, baseUrl: string): string {
  const src = `${baseUrl.replace(/\/+$/, "")}/embed/widget/${tipo}`;
  return `<iframe src="${src}" width="100%" height="${widgetIframeHeight(tipo)}" style="border:0" title="Datos de reclu.cl" loading="lazy"></iframe>`;
}

/**
 * Semilla pública de la migración 024, corte 2026-10-05. Solo se usa cuando
 * Supabase no está configurado o el portafolio agregado todavía no existe.
 * Son datos públicos agregados de BICE y MBI, no una recomendación.
 */
export const CONSENSO_SEMILLA = [
  { symbol: "LTM", name: "LATAM Airlines", weight: 20 },
  { symbol: "SQM-B", name: "SQM-B", weight: 17.5 },
  { symbol: "FALABELLA", name: "Falabella", weight: 10 },
  { symbol: "COPEC", name: "Copec", weight: 10 },
  { symbol: "ITAUCL", name: "Itau Corpbanca", weight: 10 },
] as const;

export const CONSENSO_AS_OF = "2026-10-05";

interface EmbedPageProps {
  params: Promise<{ tipo: string }>;
}

export async function generateMetadata({ params }: EmbedPageProps): Promise<Metadata> {
  const { tipo } = await params;
  if (!isWidgetTipo(tipo)) return { title: "reclu.cl", robots: { index: false } };
  return {
    title: `${WIDGET_META[tipo].title} — Datos de reclu.cl`,
    description: WIDGET_META[tipo].description,
    robots: { index: false },
  };
}

export default async function WidgetPage({ params }: EmbedPageProps) {
  await connection();
  const { tipo } = await params;
  if (!isWidgetTipo(tipo)) notFound();

  return (
    <WidgetFrame
      eyebrow={WIDGET_META[tipo].label}
      title={WIDGET_META[tipo].title}
      footerNote={footerNoteFor(tipo)}
    >
      {tipo === "consenso-corredoras" ? <ConsensoWidget /> : null}
      {tipo === "afp" ? <AfpWidget /> : null}
      {tipo === "insiders" ? <InsidersWidget /> : null}
      {tipo === "ranking" ? <RankingWidget /> : null}
    </WidgetFrame>
  );
}

function footerNoteFor(tipo: WidgetTipo): string {
  switch (tipo) {
    case "consenso-corredoras":
      return "Información pública agregada. No es una recomendación.";
    case "afp":
      return "Fuente: Superintendencia de Pensiones. No es una recomendación.";
    case "insiders":
      return "Fuente: SEC Form 4. Compras públicas, no una señal de inversión.";
    case "ranking":
      return "Exceso de retorno en pp vs el benchmark de cada país.";
  }
}

function WidgetFrame({
  eyebrow,
  title,
  footerNote,
  children,
}: {
  eyebrow: string;
  title: string;
  footerNote: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen w-full flex-col bg-white px-5 py-4 text-ink-900">
      <header className="shrink-0 border-b border-ink-200 pb-2.5">
        <p className="text-[11px] leading-none text-ink-500">{eyebrow}</p>
        <h1 className="mt-1.5 truncate text-[16px] font-medium leading-tight tracking-[-0.02em]">
          {title}
        </h1>
      </header>

      <div className="min-h-0 flex-1 pt-2">{children}</div>

      <footer className="mt-2 flex shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-ink-200 pt-2 text-[10px] leading-snug text-ink-500">
        <span className="min-w-0">{footerNote}</span>
        <a
          href="/?utm_source=embed&utm_medium=widget"
          target="_top"
          rel="noreferrer"
          className="shrink-0 font-medium text-ink-900 underline underline-offset-4"
        >
          Datos de reclu.cl
        </a>
      </footer>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex h-full items-center justify-center border border-ink-200 px-4">
      <p className="text-center text-[12px] text-ink-500">Sin datos disponibles.</p>
    </div>
  );
}

function WeightRow({
  rank,
  symbol,
  name,
  weight,
}: {
  rank: number;
  symbol: string;
  name: string;
  weight: number;
}) {
  return (
    <li className="flex items-baseline gap-3 border-b border-ink-200 py-1.5 last:border-b-0">
      <span className="num w-5 shrink-0 text-[11px] text-ink-500">
        {String(rank).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-900">
        <span className="font-medium">{symbol}</span>
        {name && name.toLowerCase() !== symbol.toLowerCase() ? (
          <span className="text-ink-500"> · {name}</span>
        ) : null}
      </span>
      <span className="num shrink-0 text-[13px]">{weight.toFixed(1)}%</span>
    </li>
  );
}

async function ConsensoWidget() {
  const portfolio = await getPortfolioBySlug("consenso-corredoras-cl");
  const holdings = portfolio
    ? await getHoldings(portfolio.id, { role: "anon" })
    : [];

  const rows =
    holdings.length > 0
      ? holdings.slice(0, 5).map((h) => ({
          symbol: h.symbol,
          name: h.name,
          weight: h.weight,
        }))
      : CONSENSO_SEMILLA.map((h) => ({ ...h }));
  const asOf = holdings[0]?.as_of?.slice(0, 10) ?? CONSENSO_AS_OF;

  if (rows.length === 0) return <RowSkeleton />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 text-[11px] text-ink-500">
        Peso promedio BICE + MBI · corte {formatShortDate(asOf)}
      </p>
      <ul className="mt-1">
        {rows.map((row, index) => (
          <WeightRow
            key={row.symbol}
            rank={index + 1}
            symbol={row.symbol}
            name={row.name}
            weight={row.weight}
          />
        ))}
      </ul>
      <p className="mt-auto pt-1.5 text-[10px] leading-snug text-ink-500">
        Carteras parciales (Itaú, Credicorp) no entran al promedio.
      </p>
    </div>
  );
}

async function AfpWidget() {
  const portfolio =
    (await getPortfolioBySlug("afp-modelo-acciones-cl")) ??
    (await getPortfolioBySlug("afp-consenso-chile"));
  const holdings = portfolio
    ? await getHoldings(portfolio.id, { role: "anon" })
    : [];

  if (holdings.length === 0) return <RowSkeleton />;

  const asOf = holdings[0]?.as_of?.slice(0, 10) ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 text-[11px] text-ink-500">
        {portfolio?.slug === "afp-modelo-acciones-cl"
          ? "AFP Modelo, Cuadro 14"
          : "Tenencias agregadas de las AFP"}
        {asOf ? ` · corte ${formatShortDate(asOf)}` : ""}
      </p>
      <ul className="mt-1">
        {holdings.slice(0, 5).map((holding, index) => (
          <WeightRow
            key={holding.symbol}
            rank={index + 1}
            symbol={holding.symbol}
            name={holding.name}
            weight={holding.weight}
          />
        ))}
      </ul>
      <p className="mt-auto pt-1.5 text-[10px] leading-snug text-ink-500">
        El peso es sobre la cartera de acciones chilenas, no sobre el fondo completo.
      </p>
    </div>
  );
}

async function InsidersWidget() {
  const { trades } = await getInsiderTrades(5);

  if (trades.length === 0) return <RowSkeleton />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 text-[11px] text-ink-500">
        Compras en mercado abierto (código P) · Form 4
      </p>
      <ul className="mt-1">
        {trades.map((trade) => (
          <li
            key={trade.id}
            className="flex items-baseline gap-2 border-b border-ink-200 py-1.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-tight text-ink-900">
                <span className="font-medium">{trade.symbol}</span>
                <span className="text-ink-500"> · {trade.ownerName}</span>
              </span>
              <span className="block truncate text-[10px] leading-tight text-ink-500">
                {formatIsoDate(trade.transDate)}
              </span>
            </span>
            <span className="num shrink-0 text-[12px]">
              {formatUsd(trade.valueUsd)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-1.5 text-[10px] leading-snug text-ink-500">
        Datos públicos de la SEC. No es recomendación de inversión.
      </p>
    </div>
  );
}

async function RankingWidget() {
  const [portfolios, metrics] = await Promise.all([
    getPortfolios(),
    getBeatTheMarketRanking(100),
  ]);

  const metricsByPortfolio = new Map(metrics.map((row) => [row.portfolio_id, row]));
  const portfolioSources: RankingSourceInput[] = portfolios.map((portfolio) => {
    const metric = metricsByPortfolio.get(portfolio.id);
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
    };
  });

  const rows = rankSources([...portfolioSources, ...RESEARCH_RESULTS])
    .filter((row) => row.rank !== null)
    .slice(0, 5);

  if (rows.length === 0) return <RowSkeleton />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 text-[11px] text-ink-500">
        Fuentes vs su benchmark · exceso en puntos porcentuales
      </p>
      <ul className="mt-1">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-baseline gap-2 border-b border-ink-200 py-1.5 last:border-b-0"
          >
            <span className="num w-5 shrink-0 text-[11px] text-ink-500">
              {String(row.rank).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-900">
              {row.name}
            </span>
            <span
              className={
                "num shrink-0 text-[13px] " +
                (row.excessReturnPct !== null && row.excessReturnPct > 0
                  ? "text-positive"
                  : row.excessReturnPct !== null && row.excessReturnPct < 0
                    ? "text-negative"
                    : "text-ink-900")
              }
            >
              {row.excessReturnPct === null
                ? "—"
                : `${formatPercent(row.excessReturnPct, 1).replace("%", "")} pp`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-1.5 text-[10px] leading-snug text-ink-500">
        Incluye las fuentes que pierden. Metodología en reclu.cl/metodologia.
      </p>
    </div>
  );
}

function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
