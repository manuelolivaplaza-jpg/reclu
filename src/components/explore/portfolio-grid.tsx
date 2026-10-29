"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExploreCard } from "@/components/explore/explore-card";
import type { ExploreCardPortfolio, SlimCardStat } from "@/lib/explore-slim";

/** Página de tarjetas (misma forma que devuelve /api/explore/cards). */
export interface PortfolioGridPage {
  items: ExploreCardPortfolio[];
  stats: Record<string, SlimCardStat>;
  noSeriesIds: string[];
  followedIds: string[];
  total: number;
}

/**
 * Grilla con carga progresiva (d62, P2): el HTML trae solo la primera
 * página; las siguientes se piden a /api/explore/cards con "Cargar más" o
 * automáticamente al acercarse al final (IntersectionObserver).
 */
export function PortfolioGrid({
  initial,
  isPro,
  query,
}: {
  initial: PortfolioGridPage;
  isPro: boolean;
  query: { categoria: string; q: string; simbolo: string };
}) {
  const [items, setItems] = useState(initial.items);
  const [stats, setStats] = useState(initial.stats);
  const [noSeries, setNoSeries] = useState(() => new Set(initial.noSeriesIds));
  const [followed, setFollowed] = useState(() => new Set(initial.followedIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const busy = useRef(false);
  const total = initial.total;
  const shown = items.length;
  const more = shown < total;

  const loadMore = useCallback(async () => {
    if (busy.current || !more) return;
    busy.current = true;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ offset: String(shown) });
      if (query.categoria) params.set("categoria", query.categoria);
      if (query.q) params.set("q", query.q);
      if (query.simbolo) params.set("simbolo", query.simbolo);
      const res = await fetch(`/api/explore/cards?${params}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as PortfolioGridPage;
      setItems((cur) => {
        const seen = new Set(cur.map((p) => p.id));
        return [...cur, ...page.items.filter((p) => !seen.has(p.id))];
      });
      setStats((cur) => ({ ...cur, ...page.stats }));
      setNoSeries((cur) => new Set([...cur, ...page.noSeriesIds]));
      setFollowed((cur) => new Set([...cur, ...page.followedIds]));
      if (page.items.length === 0) throw new Error("empty");
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [more, shown, query.categoria, query.q, query.simbolo]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !more || error || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, error, loadMore]);

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((portfolio) => (
          <li key={portfolio.id} className="[contain-intrinsic-size:auto_212px] [content-visibility:auto]">
            <ExploreCard
              portfolio={portfolio}
              isFollowing={followed.has(portfolio.id)}
              isPro={isPro}
              stat={noSeries.has(portfolio.id) ? null : stats[portfolio.id] ?? null}
              noSeries={noSeries.has(portfolio.id)}
            />
          </li>
        ))}
      </ul>
      <div className="mt-8 flex min-h-[76px] flex-col items-center gap-3">
        <p aria-live="polite" className="text-[13px] text-ink-500">
          Mostrando {shown} de {total}
          {error ? " · no se pudieron cargar más" : ""}
        </p>
        {more ? (
          <>
            <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
            >
              {loading ? "Cargando…" : error ? "Reintentar" : "Cargar más"}
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}