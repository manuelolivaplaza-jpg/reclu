"use client";

import { useEffect, useRef, useState } from "react";
import { ExploreCard } from "@/components/explore/explore-card";
import type { Portfolio } from "@/lib/types";
import type { CardStat } from "@/lib/card-series";
import { PAGE_SIZE, hasMore, nextCount } from "@/lib/explore-paging";

/**
 * Grilla con carga progresiva: el HTML del servidor trae los primeros
 * PAGE_SIZE; el resto se agrega con "Cargar más" o automáticamente al
 * acercarse al final (IntersectionObserver).
 */
export function PortfolioGrid({
  portfolios,
  followedIds,
  isPro,
  noSeriesIds = [],
  cardStats = {},
}: {
  portfolios: Portfolio[];
  followedIds: string[];
  isPro: boolean;
  /** D29: portafolios sin ningún punto de rendimiento (se muestran en gris). */
  noSeriesIds?: string[];
  /** D40: retorno + sparkline reales por id (sin entrada = sin retorno). */
  cardStats?: Record<string, CardStat>;
}) {
  const noSeries = new Set(noSeriesIds);
  const [shown, setShown] = useState(Math.min(PAGE_SIZE, portfolios.length));
  const sentinel = useRef<HTMLDivElement | null>(null);
  const followed = new Set(followedIds);
  const total = portfolios.length;
  const more = hasMore(total, shown);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !more || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown((current) => nextCount(total, current));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, total]);

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {portfolios.slice(0, shown).map((portfolio) => (
          <li key={portfolio.id}>
            <ExploreCard
              portfolio={portfolio}
              isFollowing={followed.has(portfolio.id)}
              isPro={isPro}
              stat={noSeries.has(portfolio.id) ? null : cardStats[portfolio.id] ?? null}
              noSeries={noSeries.has(portfolio.id)}
            />
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-col items-center gap-3">
        <p aria-live="polite" className="text-[13px] text-ink-500">
          Mostrando {shown} de {total}
        </p>
        {more ? (
          <>
            <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
            <button
              type="button"
              onClick={() => setShown((current) => nextCount(total, current))}
              className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
            >
              Cargar más
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
