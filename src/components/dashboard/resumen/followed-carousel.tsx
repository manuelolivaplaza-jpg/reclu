"use client";

import { LockedHoldings } from "@/components/locked-holdings";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PortfolioAvatar, type AvatarPortfolio } from "@/components/portfolio-avatar";
import { cn, formatPctPlain, formatSignedPct } from "@/lib/utils";
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
  /** D55: posiciones bloqueadas para el plan. */
  holdingsLocked?: boolean;
}

const KEYS: PeriodKey[] = ["1D", "1S", "1M", "YTD", "1A"];
const SHORT: Record<PeriodKey, string> = { "1D": "1D", "1S": "1S", "1M": "1M", YTD: "YTD", "1A": "1A" };

const stockHref = (symbol: string) => `/accion/${encodeURIComponent(symbol.toLowerCase())}`;

/** Tarjeta grande con carrusel (swipe nativo, flechas y teclado). Solo datos planos. */
export function FollowedCarousel({ slides }: { slides: CarouselSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const n = Math.max(0, Math.min(slides.length - 1, i));
      el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    },
    [slides.length],
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const on = () => setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-app border border-ink-200 bg-white">
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(idx + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(idx - 1);
          } else if (e.key === "Home") {
            e.preventDefault();
            go(0);
          } else if (e.key === "End") {
            e.preventDefault();
            go(slides.length - 1);
          }
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
                <Link
                  href={s.href}
                  className="block truncate text-[17px] font-semibold tracking-tight text-ink-900 hover:underline"
                >
                  {s.name}
                </Link>
                <p className="truncate text-[11.5px] text-ink-500">{s.subtitle}</p>
              </div>
            </header>

            <dl className="mt-4 grid grid-cols-5 divide-x divide-ink-200 border-y border-ink-200">
              {KEYS.map((k) => {
                const v = s.changes[k];
                return (
                  <div key={k} className="min-w-0 px-1 py-2.5 text-center">
                    <dt className="text-[9px] font-medium tracking-[0.1em] text-ink-500 uppercase sm:text-[10px]">
                      <span aria-hidden="true">{SHORT[k]}</span>
                      <span className="sr-only">{PERIOD_LABELS[k]}</span>
                    </dt>
                    <dd
                      className={cn(
                        "mt-1 truncate text-[13px] font-semibold tabular-nums sm:text-[15px]",
                        v === null ? "text-ink-400" : v >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {v === null ? (
                        <span className="text-[9px] font-normal text-ink-400 sm:text-[10px]">Sin dato</span>
                      ) : (
                        formatSignedPct(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>

            <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
              <PerformanceChart points={s.points} className="h-[190px] sm:h-[250px]" />
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-medium tracking-[0.12em] text-ink-500 uppercase">
                  Principales posiciones
                </p>
                {s.holdingsLocked ? (
                  <LockedHoldings compact />
                ) : s.top.length > 0 ? (
                  <ul className="flex flex-col">
                    {s.top.map((h, j) => (
                      <li key={h.symbol} className={j ? "border-t border-ink-100" : undefined}>
                        <Link href={stockHref(h.symbol)} className="group block py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="flex min-w-0 items-baseline gap-1.5">
                              <span className="shrink-0 text-[11px] font-semibold tracking-wide text-ink-900 uppercase group-hover:underline">
                                {h.symbol}
                              </span>
                              <span className="truncate text-[11px] text-ink-500">{h.name || "Sin nombre"}</span>
                            </div>
                            <span className="shrink-0 text-[12px] font-semibold text-ink-900 tabular-nums">
                              {formatPctPlain(h.weight, 1)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-0.5 bg-ink-100" aria-hidden="true">
                            <div
                              className="h-0.5 bg-ink-900"
                              style={{ width: `${Math.max(1, Math.min(100, h.weight))}%` }}
                            />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-[11px] text-ink-400">Sin posiciones visibles en tu plan.</p>
                )}
              </div>
            </div>

            <footer className="mt-4 flex items-center justify-between gap-3 border-t border-ink-200 pt-3 text-[11px] text-ink-500">
              <span className="min-w-0 truncate">
                {s.asOf ? `Al ${s.asOf}` : "Sin fecha"}
                {s.estimated ? " · estimado" : ""}
              </span>
              <Link href={s.href} className="shrink-0 font-medium text-ink-900 hover:underline">
                Ver portafolio
              </Link>
            </footer>
          </article>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <p className="shrink-0 text-[11px] text-ink-500 tabular-nums" aria-live="polite">
              {idx + 1} / {slides.length}
            </p>
            <div className="hidden items-center sm:flex">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Ver ${s.name}`}
                  aria-current={i === idx ? "true" : undefined}
                  onClick={() => go(i)}
                  className="group flex h-10 w-5 items-center justify-center"
                >
                  <span
                    className={cn(
                      "h-0.5 w-full transition-colors",
                      i === idx ? "bg-ink-900" : "bg-ink-300 group-hover:bg-ink-500",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Portafolio anterior"
              onClick={() => go(idx - 1)}
              disabled={idx === 0}
              className="inline-flex size-10 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-900 hover:border-ink-900 disabled:opacity-40 sm:size-9"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Portafolio siguiente"
              onClick={() => go(idx + 1)}
              disabled={idx === slides.length - 1}
              className="inline-flex size-10 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-900 hover:border-ink-900 disabled:opacity-40 sm:size-9"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
