import type { JSX } from "react";
import { AppLink as Link } from "@/components/app/app-link";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import { getKnownTickerSymbols } from "@/lib/public-tickers";
import { getPortfolios } from "@/lib/queries";
import { relatedPortfolios, relatedTickers, type KnownTicker } from "@/lib/related-portfolios";
import type { Portfolio } from "@/lib/types";
import { formatCompact } from "@/lib/utils";

/**
 * Enlaces internos al pie de la ficha de portafolio (T3 · B8):
 * "Portafolios relacionados" (misma categoría, href canónico) y
 * "Acciones más seguidas en Fraccion" (lista global del sitio, sin pesos ni
 * conteos por portafolio).
 *
 * Regla de Manu: si no hay datos, no hay bloque → null. Los tickers salen de
 * `getKnownTickerSymbols` (datos ya públicos hoy), nunca de las posiciones de
 * este portafolio si no es abierto a anónimos.
 */
export async function PortfolioRelated({
  slug,
  category,
}: {
  slug: string;
  category: string | null;
}): Promise<JSX.Element | null> {
  const [catalog, known] = await Promise.all([
    getPortfolios().catch((): Portfolio[] => []),
    getKnownTickerSymbols().catch((): KnownTicker[] => []),
  ]);

  const portfolios = relatedPortfolios(slug, category, catalog);
  const tickers = relatedTickers(known);

  if (portfolios.length === 0 && tickers.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      {portfolios.length > 0 ? (
        <section aria-labelledby="relacionados-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="relacionados-heading" className="text-[17px] font-semibold tracking-tight text-ink-900">
              Portafolios relacionados
            </h2>
            <p className="hidden text-[12px] text-ink-500 sm:block">Misma categoría, otras carteras</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {portfolios.map((portfolio) => (
              <li key={portfolio.id}>
                <Link
                  href={`/portfolio/${canonicalPortfolioSlug(portfolio.slug)}`}
                  className="app-card flex h-full flex-col justify-between gap-3 rounded-2xl p-4 transition-shadow hover:shadow-app-raised"
                >
                  <span className="line-clamp-2 text-[14px] font-medium text-ink-900">{portfolio.name}</span>
                  <span>
                    <span className="block text-[22px] font-semibold leading-none tabular-nums text-ink-900">
                      {formatCompact(portfolio.followers)}
                    </span>
                    <span className="text-[12px] text-ink-500">seguidores</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tickers.length > 0 ? (
        <section aria-labelledby="acciones-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="acciones-heading" className="text-[17px] font-semibold tracking-tight text-ink-900">
              Acciones más seguidas en Fraccion
            </h2>
            <p className="hidden text-[12px] text-ink-500 sm:block">Tickers presentes en más carteras</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {tickers.map((symbol) => (
              <li key={symbol}>
                <Link
                  href={`/accion/${encodeURIComponent(symbol.toLowerCase())}`}
                  className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3.5 text-[13px] font-medium text-ink-900 hover:bg-ink-50"
                >
                  {symbol}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
