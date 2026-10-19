import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getTickerOverview,
  normalizeSymbol,
  topSymbolsByCount,
  type TickerHolder,
} from "@/lib/ticker-queries";
import { getPortfolios, getHoldings } from "@/lib/queries";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATEGORY_META } from "@/lib/types";
import { timeAgo, formatCompact } from "@/lib/utils";

interface AccionPageProps {
  params: Promise<{ symbol: string }>;
}

// Con Supabase vivo, getTickerOverview lee cookies (auth) — nunca prerender
// instantáneo total; PPR mantiene el shell estático (misma regla que /explore).
export const instant = false;

/** Símbolos más buscados — prerender estático (SEO + respuesta instantánea). */
const COMMON_SYMBOLS = [
  "NVDA",
  "AAPL",
  "MSFT",
  "TSLA",
  "AMZN",
  "GOOGL",
  "META",
  "PLTR",
  "SQM-B",
  "COPEC",
  "BAC",
  "XOM",
];

export function generateStaticParams() {
  return COMMON_SYMBOLS.map((symbol) => ({ symbol: symbol.toLowerCase() }));
}

export async function generateMetadata({ params }: AccionPageProps): Promise<Metadata> {
  const { symbol: raw } = await params;
  const symbol = normalizeSymbol(raw);
  const overview = await getTickerOverview(symbol);
  const name = overview.displayName ?? symbol;
  const who = overview.consensus.portfolioCount;
  const title = `¿Quién tiene ${symbol}? Políticos y fondos que la compran | Reclu`;
  return {
    title: who > 0 ? title : `${symbol} — Ticker en reclu.cl`,
    description: `Consulta quiénes tienen ${name} (${symbol}): ${who} ${who === 1 ? "cartera" : "carteras"} entre políticos de EE.UU., corredoras chilenas y fondos 13F, con peso, antigüedad y últimos movimientos.`,
    alternates: { canonical: `/accion/${symbol.toLowerCase()}` },
  };
}

export default async function AccionPage({ params }: AccionPageProps) {
  await connection();
  const { symbol: raw } = await params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) notFound();

  const overview = await getTickerOverview(symbol);
  const { holders, avgWeight, maxWeight } = overview.consensus;
  const displayName = overview.displayName ?? symbol;
  const related = (await getRelatedSymbols(symbol)).slice(0, 6);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="container-page py-10 md:py-14">
          <Link
            href="/explore"
            className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" />
            Volver a explorar
          </Link>

          {/* Encabezado del ticker */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="label-line">Acción · Ticker</p>
              <h1 className="type-section mt-3 text-ink-900">{symbol}</h1>
              {displayName !== symbol && (
                <p className="type-body mt-2 text-ink-500">{displayName}</p>
              )}
              {overview.isDemo && (
                <p className="mt-3 inline-block border border-ink-200 px-2.5 py-1 text-[11px] tracking-[0.08em] text-ink-500 uppercase">
                  Datos de ejemplo
                </p>
              )}
            </div>
            {holders.length > 0 && (
              <dl className="grid grid-cols-3 gap-px border border-ink-200 bg-ink-200 text-center">
                <div className="bg-white px-4 py-4 sm:px-6">
                  <dt className="text-[11px] tracking-[0.08em] text-ink-500 uppercase">Carteras</dt>
                  <dd className="num mt-1 text-2xl font-medium text-ink-900">{holders.length}</dd>
                </div>
                <div className="bg-white px-4 py-4 sm:px-6">
                  <dt className="text-[11px] tracking-[0.08em] text-ink-500 uppercase">Peso medio</dt>
                  <dd className="num mt-1 text-2xl font-medium text-ink-900">{avgWeight.toFixed(1)}%</dd>
                </div>
                <div className="bg-white px-4 py-4 sm:px-6">
                  <dt className="text-[11px] tracking-[0.08em] text-ink-500 uppercase">Máximo</dt>
                  <dd className="num mt-1 text-2xl font-medium text-ink-900">{maxWeight.toFixed(1)}%</dd>
                </div>
              </dl>
            )}
          </div>

          {holders.length === 0 && overview.alerts.length === 0 ? (
            <div className="mt-12 border border-ink-200 p-10 text-center">
              <p className="font-medium text-ink-900">Sin registros para {symbol}</p>
              <p className="mt-2 text-sm text-ink-500">
                Ninguna cartera del catálogo reporta este símbolo aún. Vuelve a
                explorar o busca por otro ticker.
              </p>
              <Link
                href="/explore"
                className="mt-6 inline-flex h-11 items-center rounded-full bg-ink-900 px-5 text-sm font-medium text-white transition-colors hover:bg-black"
              >
                Explorar portafolios
              </Link>
            </div>
          ) : (
            <>
              {/* Quiénes la tienen — tabla con scroll horizontal en móvil */}
              <section className="mt-12">
                <h2 className="text-[15px] font-medium text-ink-900">
                  ¿Quién tiene {symbol}?
                </h2>
                <div className="mt-4 overflow-x-auto no-scrollbar">
                  <table className="w-full min-w-[560px] text-[15px]">
                    <thead>
                      <tr className="border-b border-ink-200 text-left text-[13px] text-ink-500">
                        <th className="py-3 pr-4 font-normal">Cartera</th>
                        <th className="py-3 px-4 text-right font-normal">Peso</th>
                        <th className="py-3 px-4 text-right font-normal">Cambio</th>
                        <th className="py-3 px-4 text-right font-normal">Desde</th>
                        <th className="pl-4 py-3 text-right font-normal">Retorno</th>
                        </tr>
                    </thead>
                    <tbody>
                      {holders.map((holder) => (
                        <HolderRow key={holder.portfolio.id} holder={holder} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                  Peso según la última composición declarada por cada fuente.
                  “Desde” es la primera fecha con el símbolo en la cartera.
                </p>
              </section>

              {/* Movimientos recientes (alertas) */}
              {overview.alerts.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-[15px] font-medium text-ink-900">
                    Quién movió {symbol} recientemente
                  </h2>
                  <div className="mt-4 flex flex-col gap-4">
                    {overview.alerts.slice(0, 8).map((alert) => (
                      <div key={alert.id} className="border-l-2 border-ink-900 pl-4">
                        <Link
                          href={`/portfolio/${alert.portfolio?.slug}`}
                          className="text-[13px] text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
                        >
                          {alert.portfolio?.name ?? "Portafolio"} · {timeAgo(alert.created_at)}
                        </Link>
                        <p className="mt-1 text-[15px] font-medium text-ink-900">{alert.title}</p>
                        {alert.summary && (
                          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-500">
                            {alert.summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Símbolos relacionados */}
              {related.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-[15px] font-medium text-ink-900">Otros símbolos con consenso</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {related.map((rel) => (
                      <Link
                        key={rel.symbol}
                        href={`/accion/${rel.symbol.toLowerCase()}`}
                        className="inline-flex h-11 items-center border border-ink-200 px-4 text-[13px] font-medium text-ink-900 transition-colors hover:border-ink-900"
                      >
                        {rel.symbol}
                        <span className="ml-1.5 text-[12px] font-normal text-ink-500">{rel.count}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Disclaimer */}
          <p className="mt-12 border-t border-ink-200 pt-8 text-xs leading-relaxed text-ink-500">
            La información presentada proviene de fuentes públicas (PTR de la
            Cámara, filings 13F, informes de corredoras) y tiene fines
            exclusivamente informativos. No constituye asesoría de inversión ni
            recomendación de compra o venta.
          </p>
        </div>
      </main>

      {/* JSON-LD básico */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(tickerJsonLd(symbol, displayName, holders)),
        }}
      />

      <SiteFooter />
    </div>
  );
}

function HolderRow({ holder }: { holder: TickerHolder }) {
  const delta =
    holder.previousWeight !== null ? holder.weight - holder.previousWeight : null;
  const meta = CATEGORY_META[holder.portfolio.category];
  return (
    <tr className="border-b border-ink-200">
      <td className="py-3.5 pr-4">
        <Link
          href={`/portfolio/${holder.portfolio.slug}`}
          className="font-medium text-ink-900 underline-offset-4 hover:underline"
        >
          {holder.portfolio.name}
        </Link>
        <div className="text-[13px] text-ink-500">
          {meta.label}
          {holder.portfolio.manager ? ` · ${holder.portfolio.manager}` : ""} ·{" "}
          {formatCompact(holder.portfolio.followers)} seguidores
        </div>
      </td>
      <td className="px-4 py-3.5 text-right font-medium tabular-nums text-ink-900">
        {holder.weight.toFixed(1)}%
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums">
        {delta !== null && delta !== 0 ? (
          <span className={delta > 0 ? "text-positive" : "text-negative"}>
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} pp
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right text-[13px] text-ink-500 tabular-nums">
        {holder.firstSeen ? formatShortDate(holder.firstSeen) : "—"}
      </td>
      <td className="py-3.5 pl-4 text-right tabular-nums">
        {holder.returnPct !== null ? (
          <span className={holder.returnPct >= 0 ? "text-positive" : "text-negative"}>
            {holder.returnPct >= 0 ? "+" : ""}
            {holder.returnPct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>
    </tr>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function tickerJsonLd(symbol: string, name: string, holders: TickerHolder[]) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `¿Quién tiene ${symbol}? Políticos y fondos que la compran | Reclu`,
    description: `Carteras de reclu.cl que incluyen ${name} (${symbol}), con peso, antigüedad y movimientos recientes.`,
    url: `https://reclu.cl/accion/${symbol.toLowerCase()}`,
    about: { "@type": "Corporation", name, tickerSymbol: symbol },
    ...(holders.length > 0
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: holders.length,
            itemListElement: holders.slice(0, 10).map((h, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: h.portfolio.name,
              url: `https://reclu.cl/portfolio/${h.portfolio.slug}`,
            })),
          },
        }
      : {}),
  };
}

/** Símbolos con consenso del catálogo, excluyendo el actual. */
async function getRelatedSymbols(
  exclude: string,
  limit = 12,
): Promise<{ symbol: string; count: number }[]> {
  const catalog = await getPortfolios();
  const holdingsByPortfolio = await Promise.all(
    catalog.map(async (portfolio) => ({
      portfolioId: portfolio.id,
      symbols: (await getHoldings(portfolio.id)).map((h) =>
        normalizeSymbol(h.symbol),
      ),
    })),
  );
  return topSymbolsByCount(holdingsByPortfolio, limit + 1).filter(
    (entry) => entry.symbol !== exclude,
  );
}
