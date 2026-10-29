"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PortfolioAvatar, type AvatarPortfolio } from "@/components/portfolio-avatar";
import { cn, formatSignedPct } from "@/lib/utils";
import { PerformanceChart } from "./performance-chart";
import { PERIOD_LABELS, type PeriodKey, type SeriesPt } from "./periods";

export interface CarouselSlide {
  id: string;
  href: string;
  avatar: AvatarPortfolio;
  name: string;
  subtitle: string;
  changes: Record<PeriodKey, number | null>;
  points: SeriesPt[];
  asOf: string | null;
  estimated: boolean;
  top: { symbol: string; name: string; weight: number }[];
}

const KEYS: PeriodKey[] = ["1D", "1S", "1M", "YTD", "1A"];

/** Tarjeta grande con carrusel (swipe nativo con scroll-snap, flechas y puntos). Solo datos planos. */
export function FollowedCarousel({ slides }: { slides: CarouselSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(slides.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }, [slides.length]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const on = () => setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="app-card relative overflow-hidden">
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(idx + 1);
          if (e.key === "ArrowLeft") go(idx - 1);
        }}
        tabIndex={0}
        aria-roledescription="carrusel"
        aria-label="Portafolios que sigues"
      >
        {slides.map((s, i) => (
          <article
            key={s.id}
            className="w-full shrink-0 snap-start p-4 sm:p-6"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${slides.length}: ${s.name}`}
          >
            <header className="flex items-center gap-3">
              <PortfolioAvatar portfolio={s.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <Link href={s.href} className="block truncate text-app-title font-semibold tracking-tight text-ink-900 hover:underline">
                  {s.name}
                </Link>
                <p className="truncate text-app-caption text-ink-500">{s.subtitle}</p>
              </div>
            </header>

            <dl className="mt-4 grid grid-cols-5 gap-1 rounded-app-control bg-app-canvas p-1">
              {KEYS.map((k) => {
                const v = s.changes[k];
                return (
                  <div key={k} className="rounded-[6px] px-1 py-1.5 text-center">
                    <dt className="text-[10px] font-medium tracking-wide text-ink-500 uppercase sm:text-[11px]">{PERIOD_LABELS[k]}</dt>
                    <dd
                      className={cn(
                        "mt-0.5 text-[13px] font-semibold tabular-nums sm:text-[15px]",
                        v === null ? "text-ink-400" : v >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {v === null ? "—" : formatSignedPct(v, Math.abs(v) < 10 ? 2 : 1)}
                    </dd>
                  </div>
                );
              })}
            </dl>

            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <PerformanceChart points={s.points} className="h-[200px] sm:h-[260px]" />
              <div>
                <p className="mb-2 text-app-caption font-medium text-ink-500">Principales posiciones</p>
                {s.top.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {s.top.map((h) => (
                      <li key={h.symbol} className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-canvas text-[10px] font-semibold text-ink-700">
                          {h.symbol.slice(0, 4)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink-900">{h.name || h.symbol}</p>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-app-canvas">
                            <div className="h-full rounded-full bg-ink-900" style={{ width: `${Math.min(100, h.weight)}%` }} />
                          </div>
                        </div>
                        <span className="w-12 text-right text-[13px] font-semibold tabular-nums text-ink-900">
                          {h.weight.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-app-caption text-ink-400">Sin posiciones visibles en tu plan.</p>
                )}
              </div>
            </div>

            <footer className="mt-4 flex items-center justify-between border-t border-app-border pt-3 text-app-caption text-ink-500">
              <span>
                {s.asOf ? `Al ${s.asOf}` : "Sin fecha"}
                {s.estimated ? " · estimado" : ""}
              </span>
              <Link href={s.href} className="font-medium text-ink-900 hover:underline">
                Ver portafolio
              </Link>
            </footer>
          </article>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-between gap-3 px-4 pb-4 sm:px-6">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Elegir portafolio">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                aria-label={s.name}
                onClick={() => go(i)}
                className={cn("h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-ink-900" : "w-1.5 bg-ink-300 hover:bg-ink-500")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => go(idx - 1)}
              disabled={idx === 0}
              className="inline-flex size-9 items-center justify-center rounded-full border border-app-border bg-white text-ink-900 hover:bg-app-canvas disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => go(idx + 1)}
              disabled={idx === slides.length - 1}
              className="inline-flex size-9 items-center justify-center rounded-full border border-app-border bg-white text-ink-900 hover:bg-app-canvas disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
