import { AppLink as Link } from "@/components/app/app-link";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import type { Portfolio } from "@/lib/types";
import type { BeatMarketRow } from "@/lib/performance-queries";
import { BeatMarketRanking } from "@/components/beat-market-ranking";
import type { ConsensusTicker } from "@/components/explore-rankings";

/**
 * d54/D10: lo que antes iba como filas bajo "Lo más seguido", ahora en
 * tarjetas editoriales: más alertas, radar de consenso y el ranking vs.
 * mercado. Filete de 1px, radio 0 y cero sombras; el verde y el rojo quedan
 * solo en el porcentaje de rendimiento.
 * ("Top seguidos" vive en el carrusel principal y "Mejor rendimiento" en la
 * lista lateral.)
 */

/** Datos del bloque de rankings. */
interface RankingsData {
  portfolios: Portfolio[];
  alertCounts: Record<string, number>;
  consensus: ConsensusTicker[];
  beatMarket: BeatMarketRow[];
}

/**
 * ¿Hay algo real que mostrar? Se usa aquí y en `explore-rankings-section.tsx`
 * para no montar un `<section>` vacío (ni un filete suelto) cuando todas las
 * listas están en cero.
 */
export function hasRankingsData({ portfolios, alertCounts, consensus, beatMarket }: RankingsData): boolean {
  if (consensus.length > 0 || beatMarket.length > 0) return true;
  return portfolios.some((portfolio) => (alertCounts[portfolio.id] ?? 0) > 0);
}

/** Cabecera de bloque: título 22px y meta a la derecha, sobre un filete. */
function BlockHeader({ id, title, meta }: { id: string; title: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-ink-300 pb-3 dark:border-white/12">
      <h2
        id={id}
        className="min-w-0 text-[22px] font-medium leading-[1.1] tracking-[-0.03em] text-ink-900 dark:text-white"
      >
        {title}
      </h2>
      <p className="label-line shrink-0">{meta}</p>
    </div>
  );
}

export function ExploreRankingsCards({ portfolios, alertCounts, consensus, beatMarket }: RankingsData) {
  const mostAlerts = portfolios
    .map((p) => ({ p, n: alertCounts[p.id] ?? 0 }))
    .filter((r) => r.n > 0)
    .toSorted((a, b) => b.n - a.n)
    .slice(0, 4);
  const radar = consensus.slice(0, 8);

  if (!hasRankingsData({ portfolios, alertCounts, consensus, beatMarket })) return null;

  return (
    <div className="flex flex-col gap-12">
      {radar.length > 0 ? (
        <section aria-labelledby="radar-heading">
          <BlockHeader id="radar-heading" title="Radar de consenso" meta="Tickers presentes en más carteras" />
          <ul className="no-scrollbar -mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
            {radar.map((t, i) => (
              <li key={t.symbol} className="w-32 min-w-0 shrink-0 snap-start sm:w-auto">
                <Link
                  href={`/accion/${encodeURIComponent(t.symbol.toLowerCase())}`}
                  className="group flex h-full flex-col gap-3 border border-ink-300 bg-white p-3.5 transition-colors hover:border-ink-900 focus-visible:outline-offset-[-2px] dark:border-white/12 dark:bg-panel dark:hover:border-white"
                >
                  <span className="num text-[11px] text-ink-500 dark:text-white/55">#{i + 1}</span>
                  <span className="num text-[20px] leading-none tracking-[-0.02em] text-ink-900 dark:text-white">
                    {t.symbol}
                  </span>
                  <span className="mt-auto text-[12px] leading-snug text-ink-500 dark:text-white/55">
                    {t.count} cartera{t.count !== 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mostAlerts.length > 0 ? (
        <section aria-labelledby="alertas-heading">
          <BlockHeader id="alertas-heading" title="Más movimientos" meta="Carteras con más alertas publicadas" />
          <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {mostAlerts.map(({ p, n }) => (
              <li key={p.id} className="min-w-0">
                <Link
                  href={`/portfolio/${canonicalPortfolioSlug(p.slug)}`}
                  className="group flex h-full flex-col justify-between gap-6 border border-ink-300 bg-white p-4 transition-colors hover:border-ink-900 focus-visible:outline-offset-[-2px] dark:border-white/12 dark:bg-panel dark:hover:border-white"
                >
                  <h3 className="line-clamp-2 text-[14px] font-medium leading-snug text-ink-900 group-hover:underline dark:text-white">
                    {p.name}
                  </h3>
                  <span className="block">
                    <span className="num block text-[28px] leading-none text-ink-900 dark:text-white">
                      {n.toLocaleString("es-CL")}
                    </span>
                    <span className="mt-1 block text-[12px] leading-none text-ink-500 dark:text-white/55">
                      alertas publicadas
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {beatMarket.length > 0 ? (
        <section className="min-w-0 [&>*:first-child]:mt-0">
          <BeatMarketRanking rows={beatMarket} />
        </section>
      ) : null}
    </div>
  );
}
