"use client";

import { useEffect, useRef, useState } from "react";
import { PortfolioCard } from "@/components/portfolio-card";
import type { Portfolio } from "@/lib/types";
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
}: {
  portfolios: Portfolio[];
  followedIds: string[];
  isPro: boolean;
}) {
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
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {portfolios.slice(0, shown).map((portfolio) => (
          <li key={portfolio.id}>
            <PortfolioCard
              portfolio={portfolio}
              isFollowing={followed.has(portfolio.id)}
              isPro={isPro}
            />
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-col items-center gap-3">
        <p aria-live="polite" className="text-sm text-neutral-500">
          Mostrando {shown} de {total}
        </p>
        {more ? (
          <>
            <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
            <button
              type="button"
              onClick={() => setShown((current) => nextCount(total, current))}
              className="rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
            >
              Cargar más
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
