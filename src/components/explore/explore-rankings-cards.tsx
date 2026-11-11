import { AppLink as Link } from "@/components/app/app-link";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import type { Portfolio } from "@/lib/types";
import type { BeatMarketRow } from "@/lib/performance-queries";
import { BeatMarketRanking } from "@/components/beat-market-ranking";
import type { ConsensusTicker } from "@/components/explore-rankings";

/**
 * d54: lo que antes iba como filas bajo "Lo más seguido", ahora en
 * tarjetas: más alertas, radar de consenso y el ranking vs. mercado.
 * ("Top seguidos" vive en el carrusel principal y "Mejor rendimiento" en la
 * lista lateral.)
 */
export function ExploreRankingsCards({
  portfolios,
  alertCounts,
  consensus,
  beatMarket,
}: {
  portfolios: Portfolio[];
  alertCounts: Record<string, number>;
  consensus: ConsensusTicker[];
  beatMarket: BeatMarketRow[];
}) {
  const mostAlerts = portfolios
    .map((p) => ({ p, n: alertCounts[p.id] ?? 0 }))
    .filter((r) => r.n > 0)
    .toSorted((a, b) => b.n - a.n)
    .slice(0, 4);
  const radar = consensus.slice(0, 8);

  if (!mostAlerts.length && !radar.length && !beatMarket.length) return null;

  return (
    <div className="flex flex-col gap-8">
      {radar.length > 0 ? (
        <section aria-labelledby="radar-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="radar-heading" className="text-[17px] font-semibold tracking-tight text-ink-900">
              Radar de consenso
            </h2>
            <p className="hidden text-[12px] text-ink-500 sm:block">Tickers presentes en más carteras</p>
          </div>
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
            {radar.map((t, i) => (
              <li key={t.symbol} className="w-32 shrink-0 snap-start sm:w-auto">
                <Link
                  href={`/accion/${encodeURIComponent(t.symbol.toLowerCase())}`}
                  className="app-card flex h-full flex-col gap-3 rounded-2xl p-3.5 transition-shadow hover:shadow-app-raised"
                >
                  <span className="text-[11px] tabular-nums text-ink-400">#{i + 1}</span>
                  <span className="text-[20px] font-semibold leading-none tracking-tight text-ink-900">{t.symbol}</span>
                  <span className="text-[12px] text-ink-500">
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
          <h2 id="alertas-heading" className="mb-3 text-[17px] font-semibold tracking-tight text-ink-900">
            Más movimientos
          </h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {mostAlerts.map(({ p, n }) => (
              <li key={p.id}>
                <Link
                  href={`/portfolio/${canonicalPortfolioSlug(p.slug)}`}
                  className="app-card flex h-full flex-col justify-between gap-3 rounded-2xl p-4 transition-shadow hover:shadow-app-raised"
                >
                  <span className="line-clamp-2 text-[14px] font-medium text-ink-900">{p.name}</span>
                  <span>
                    <span className="block text-[22px] font-semibold leading-none tabular-nums text-ink-900">
                      {n.toLocaleString("es-CL")}
                    </span>
                    <span className="text-[12px] text-ink-500">alertas publicadas</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {beatMarket.length > 0 ? (
        <section className="app-card rounded-2xl p-4 sm:p-5 [&>*:first-child]:mt-0">
          <BeatMarketRanking rows={beatMarket} />
        </section>
      ) : null}
    </div>
  );
}
