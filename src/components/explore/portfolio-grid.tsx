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
 *
 * D9: retícula editorial 1 / 2 / 3 columnas para el lienzo de 1560px
 * (`container-page`). A 3 columnas la tarjeta nueva (gráfico de 148px con
 * selector de período) respira sin apretar la cifra; la tarjeta actual
 * hereda el mismo ancho. El estado "Sin resultados" no vive aquí: lo pinta
 * `explore-view.tsx` antes de montar la grilla.
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
      <ul
        role="list"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5 xl:grid-cols-3"
      >
        {items.map((portfolio) => (
          <li
            key={portfolio.id}
            className="min-w-0 [contain-intrinsic-size:auto_480px] [content-visibility:auto]"
          >
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
      {/* D9: centinela invisible para la carga automática (600px de margen). */}
      <div ref={sentinel} aria-hidden="true" className="h-px w-full" />

      <div className="mt-6 border-t border-ink-300 pt-5 dark:border-white/12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            role="status"
            className="text-[13px] leading-snug tabular-nums text-ink-500 dark:text-white/55"
          >
            Mostrando <span className="text-ink-900 dark:text-white">{shown}</span> de {total}
            {loading ? " · cargando…" : ""}
            {error ? " · no se pudieron cargar más" : ""}
          </p>
          {more ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              aria-busy={loading || undefined}
              className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-full bg-ink-900 px-6 text-sm font-medium leading-none text-white transition-colors hover:bg-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 disabled:pointer-events-none disabled:opacity-45 sm:w-auto dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100 dark:focus-visible:outline-white"
            >
              {loading ? "Cargando…" : error ? "Reintentar" : "Cargar más"}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}