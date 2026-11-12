import { absoluteUrl } from "@/lib/site";
import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import {
  getTickerOverview,
  normalizeSymbol,
  topSymbolsByCount,
  type TickerHolder,
} from "@/lib/ticker-queries";
import { getTickerPublicSummary } from "@/lib/public-tickers";
import { getPortfolios, getHoldings } from "@/lib/queries";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AccionPublicSummary } from "@/components/accion-public-summary";
import { CATEGORY_META } from "@/lib/types";
import { timeAgo, formatDecimal, formatPctPlain, formatShortDate } from "@/lib/utils";

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

/**
 * Título y descripción sin nombres de fondos ni de políticos: el resumen
 * público no expone quién tiene el ticker. `withSeo` agrega canonical y OG;
 * la página no lleva noindex.
 */
export async function generateMetadata({ params }: AccionPageProps): Promise<Metadata> {
  const { symbol: raw } = await params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) notFound();

  const [overview, summary] = await Promise.all([
    getTickerOverview(symbol),
    getTickerPublicSummary(symbol),
  ]);

  const hasContent =
    overview.consensus.holders.length > 0 || overview.alerts.length > 0;
  // Regla 1b: solo un ticker inexistente da 404 (el proxy además lo resuelve
  // antes del streaming). Ante la duda, se deja pasar.
  if (!summary && !hasContent) notFound();

  const name = summary?.name ?? overview.displayName ?? symbol;
  const who = summary?.portfolioCount ?? overview.consensus.portfolioCount;
  const title =
    name.toUpperCase() !== symbol
      ? `¿Quién tiene ${symbol}? ${name}`
      : `¿Quién tiene ${symbol}?`;

  return withSeo(`/accion/${symbol.toLowerCase()}`, {
    title,
    description:
      who > 0
        ? `${who} ${who === 1 ? "portafolio" : "portafolios"} de Fraccion incluyen ${name} (${symbol}). Datos agregados de fuentes públicas; el detalle de cada cartera es para suscriptores.`
        : `Ficha pública de ${name} (${symbol}) en Fraccion. Datos agregados de fuentes públicas; el detalle de cada cartera es para suscriptores.`,
  });
}

export default async function AccionPage({ params }: AccionPageProps) {
  // timeAgo usa Date.now(). Sin esto, el prerender de /accion/nvda aborta el build.
  await connection();
  const { symbol: raw } = await params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) notFound();

  const [overview, summary] = await Promise.all([
    getTickerOverview(symbol),
    getTickerPublicSummary(symbol),
  ]);

  const { holders, avgWeight, maxWeight } = overview.consensus;
  const hasHolders = holders.length > 0;
  const hasAlerts = overview.alerts.length > 0;

  // Regla 1b (Manu): un ticker real NUNCA da 404, aunque el rol actual vea 0
  // carteras. Solo se da 404 cuando no existe y la ficha tampoco trae nada.
  if (!summary && !hasHolders && !hasAlerts) notFound();

  const displayName = summary?.name ?? overview.displayName ?? symbol;
  // El rótulo de ejemplo sale del resumen cuando existe: `overview.isDemo` es
  // true también cuando un rol ve 0 carteras en una base real, y ahí no aplica.
  const isDemo = summary ? Boolean(summary.isDemo) : overview.isDemo;
  // Los símbolos relacionados salen del catálogo con posiciones: solo se
  // enlazan cuando la tabla de carteras ya es visible (decisión 2).
  const related = hasHolders ? (await getRelatedSymbols(symbol)).slice(0, 6) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 bg-canvas">
        <div className="container-page py-10 md:py-14">
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            <span aria-hidden>←</span>
            Volver a explorar
          </Link>

          {hasHolders ? (
            /* Encabezado del ticker (carteras visibles para el rol) */
            <header className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="label-line">Acción · Ticker</p>
                <h1 className="type-section mt-3 text-ink-900">{symbol}</h1>
                {displayName !== symbol && (
                  <p className="mt-2 text-[17px] leading-snug text-ink-500">{displayName}</p>
                )}
                <p className="mt-4 max-w-[40rem] text-[15px] leading-relaxed text-ink-500">
                  Está en <span className="num text-ink-900">{holders.length}</span>{" "}
                  {holders.length === 1 ? "portafolio" : "portafolios"} de Fraccion.
                  Abajo, el peso de cada cartera que la tiene en su último corte.
                </p>
              </div>
              <dl className="grid w-full grid-cols-3 gap-px border border-line bg-line sm:w-auto">
                <div className="bg-canvas px-4 py-3">
                  <dt className="text-[13px] leading-tight text-ink-500">Carteras</dt>
                  <dd className="num mt-1.5 text-[22px] leading-none text-ink-900">
                    {holders.length}
                  </dd>
                </div>
                <div className="bg-canvas px-4 py-3">
                  <dt className="text-[13px] leading-tight text-ink-500">Peso medio</dt>
                  <dd className="num mt-1.5 text-[22px] leading-none text-ink-900">
                    {formatPctPlain(avgWeight, 1)}
                  </dd>
                </div>
                <div className="bg-canvas px-4 py-3">
                  <dt className="text-[13px] leading-tight text-ink-500">Peso máximo</dt>
                  <dd className="num mt-1.5 text-[22px] leading-none text-ink-900">
                    {formatPctPlain(maxWeight, 1)}
                  </dd>
                </div>
              </dl>
            </header>
          ) : summary ? (
            /* Resumen público: símbolo, nombre, sector y número agregado */
            <div className="mt-8">
              <AccionPublicSummary
                symbol={symbol}
                name={displayName}
                sector={summary.sector}
                portfolioCount={summary.portfolioCount}
              />
              {summary.portfolioCount === 0 ? (
                <p className="mt-8 max-w-[42rem] text-[15px] leading-relaxed text-ink-500">
                  Ningún portafolio de Fraccion tiene este símbolo en su último
                  corte. Puede volver a aparecer cuando una fuente lo declare.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-8">
              <p className="label-line">Acción · Ticker</p>
              <h1 className="type-section mt-3 text-ink-900">{symbol}</h1>
              {displayName !== symbol && (
                <p className="mt-2 text-[17px] leading-snug text-ink-500">{displayName}</p>
              )}
              {!hasAlerts ? (
                <p className="mt-6 max-w-[42rem] text-[15px] leading-relaxed text-ink-500">
                  Todavía no hay datos agregados para este símbolo. Si aparece en
                  una cartera que seguimos, se publicará en el próximo corte.
                </p>
              ) : null}
            </div>
          )}

          {isDemo ? (
            <p className="mt-4 text-[13px] text-ink-500">
              Datos de ejemplo: el sitio corre sin la base de datos conectada.
            </p>
          ) : null}

          {hasHolders && (
            /* Quiénes la tienen — tabla con filetes */
            <section
              aria-labelledby="tenedores-heading"
              className="mt-12 border-t border-line pt-6"
            >
              <h2
                id="tenedores-heading"
                className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
              >
                ¿Quién tiene {symbol}?
              </h2>
              <p className="mt-2 max-w-[46rem] text-[13px] leading-relaxed text-ink-500">
                Peso según la última composición declarada por cada fuente. “Desde”
                es la primera fecha con el símbolo en la cartera.
              </p>
              <table className="mt-5 w-full border-collapse text-left">
                <caption className="sr-only">
                  Portafolios de Fraccion que incluyen {symbol}, con peso, cambio y
                  retorno.
                </caption>
                <thead>
                  <tr className="border-b border-line">
                    <th
                      scope="col"
                      className="py-2.5 pr-3 text-[13px] font-normal text-ink-500"
                    >
                      Cartera
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-normal text-ink-500"
                    >
                      Peso
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-normal text-ink-500"
                    >
                      Cambio
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap py-2.5 pl-3 text-right text-[13px] font-normal text-ink-500"
                    >
                      Retorno
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((holder) => (
                    <HolderRow key={holder.portfolio.id} holder={holder} />
                  ))}
                </tbody>
              </table>
              <p className="mt-4 max-w-[46rem] text-[13px] leading-relaxed text-ink-500">
                Peso declarado por cada fuente en su último corte; no es una cartera
                ejecutable ni una recomendación. Cómo se calcula:{" "}
                <Link
                  href="/metodologia"
                  className="text-ink-900 underline underline-offset-4"
                >
                  Metodología
                </Link>
                .
              </p>
            </section>
          )}

          {/* Movimientos recientes (alertas). En el resumen público no se
              muestran: traen nombres de carteras (decisión 1b). */}
          {hasAlerts && (hasHolders || !summary) && (
            <section
              aria-labelledby="movimientos-heading"
              className="mt-12 border-t border-line pt-6"
            >
              <h2
                id="movimientos-heading"
                className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
              >
                Quién movió {symbol} recientemente
              </h2>
              <div className="mt-5 flex flex-col gap-5">
                {overview.alerts.slice(0, 8).map((alert) => (
                  <div key={alert.id} className="border-l-2 border-ink-900 pl-4">
                    <Link
                      href={`/portfolio/${alert.portfolio?.slug}`}
                      className="text-[13px] text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
                    >
                      {alert.portfolio?.name ?? "Portafolio"} · {timeAgo(alert.created_at)}
                    </Link>
                    <p className="mt-1 text-[15px] font-medium leading-snug text-ink-900">
                      {alert.title}
                    </p>
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

          {/* Símbolos relacionados (solo con carteras visibles) */}
          {hasHolders && related.length > 0 && (
            <section
              aria-labelledby="relacionados-heading"
              className="mt-12 border-t border-line pt-6"
            >
              <h2
                id="relacionados-heading"
                className="text-[20px] font-medium tracking-[-0.02em] text-ink-900"
              >
                Otros símbolos con consenso
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {related.map((rel) => (
                  <li key={rel.symbol}>
                    <Link
                      href={`/accion/${rel.symbol.toLowerCase()}`}
                      aria-label={`${rel.symbol}: ${rel.count} ${
                        rel.count === 1 ? "portafolio" : "portafolios"
                      }`}
                      className="inline-flex h-11 items-center gap-2 border border-line px-4 text-[13px] font-medium text-ink-900 transition-colors hover:border-ink-900"
                    >
                      {rel.symbol}
                      <span aria-hidden className="num font-normal text-ink-500">
                        {rel.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Disclaimer */}
          <p className="mt-12 border-t border-line pt-6 text-[12px] leading-relaxed text-ink-500">
            La información presentada proviene de fuentes públicas (PTR de la
            Cámara, filings 13F, informes de corredoras) y tiene fines
            exclusivamente informativos. No constituye asesoría de inversión ni
            recomendación de compra o venta. Los informes oficiales de EE.UU.
            siguen públicos y gratis en los sitios de la Cámara, el Senado y la
            OGE.
          </p>
        </div>
      </main>

      {/* JSON-LD básico — solo con los holders que ya ve el rol actual */}
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

/** Porcentaje con signo explícito solo en positivos; coma decimal es-CL. */
function signedPct(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${formatPctPlain(value, digits)}`;
}

function HolderRow({ holder }: { holder: TickerHolder }) {
  const delta =
    holder.previousWeight !== null ? holder.weight - holder.previousWeight : null;
  const meta = CATEGORY_META[holder.portfolio.category];
  return (
    <tr className="border-b border-line align-top">
      <td className="py-3 pr-3">
        <Link
          href={`/portfolio/${holder.portfolio.slug}`}
          className="text-[15px] font-medium leading-snug text-ink-900 underline-offset-4 hover:underline"
        >
          {holder.portfolio.name}
        </Link>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-500">
          {meta.label}
          {holder.portfolio.manager ? ` · ${holder.portfolio.manager}` : ""}
          {holder.firstSeen ? ` · desde ${formatShortDate(holder.firstSeen)}` : ""}
        </p>
      </td>
      <td className="num whitespace-nowrap px-3 py-3 text-right text-[14px] text-ink-900">
        {formatPctPlain(holder.weight, 1)}
      </td>
      <td className="num whitespace-nowrap px-3 py-3 text-right text-[14px]">
        {delta !== null && delta !== 0 ? (
          <span className={delta > 0 ? "text-positive" : "text-negative"}>
            {delta > 0 ? "+" : ""}
            {formatDecimal(delta, 1)} pp
          </span>
        ) : (
          <span className="text-ink-500">—</span>
        )}
      </td>
      <td className="num whitespace-nowrap py-3 pl-3 text-right text-[14px]">
        {holder.returnPct !== null ? (
          <span className={holder.returnPct >= 0 ? "text-positive" : "text-negative"}>
            {signedPct(holder.returnPct, 1)}
          </span>
        ) : (
          <span className="text-ink-500">—</span>
        )}
      </td>
    </tr>
  );
}

function tickerJsonLd(symbol: string, name: string, holders: TickerHolder[]) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `¿Quién tiene ${symbol}? Datos agregados`,
    description: `Ficha pública de ${name} (${symbol}) en Fraccion: cuántos portafolios lo incluyen en su último corte. El detalle de cada cartera es para suscriptores.`,
    url: absoluteUrl(`/accion/${symbol.toLowerCase()}`),
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
              url: absoluteUrl(`/portfolio/${h.portfolio.slug}`),
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
