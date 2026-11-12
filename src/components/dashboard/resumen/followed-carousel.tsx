"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LockedHoldings } from "@/components/locked-holdings";
import { PortfolioAvatar, type AvatarPortfolio } from "@/components/portfolio-avatar";
import { cn, formatPctPlain, formatShortDate, formatSignedPct } from "@/lib/utils";
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
  /** Fecha del último cierre de la serie, ISO (AAAA-MM-DD). */
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
  const hintId = useId();
  const trackId = `${hintId}-track`;
  const [idx, setIdx] = useState(0);
  const last = Math.max(0, slides.length - 1);
  const current = Math.min(Math.max(idx, 0), last);

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
    const on = () => {
      const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      setIdx((prev) => (prev === next ? prev : next));
    };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="app-panel relative overflow-hidden">
      <p id={hintId} className="sr-only">
        Carrusel de portafolios. Usa las flechas izquierda y derecha para cambiar de diapositiva; Inicio y Fin van a la
        primera y a la última.
      </p>

      <div
        ref={track}
        id={trackId}
        role="region"
        aria-roledescription="carrusel"
        aria-label="Portafolios que sigues"
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={(e) => {
          // Solo cuando el foco está en el carrusel; dentro de un enlace, las
          // flechas no deben mover la diapositiva enfocada.
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(current + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(current - 1);
          } else if (e.key === "Home") {
            e.preventDefault();
            go(0);
          } else if (e.key === "End") {
            e.preventDefault();
            go(slides.length - 1);
          }
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-ink-900"
      >
        {slides.map((s, i) => (
          <article
            key={s.id}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${slides.length}: ${s.name}`}
            inert={i !== current}
            className="w-full shrink-0 snap-start p-4 sm:p-6"
          >
            <header className="flex items-center gap-3">
              <PortfolioAvatar portfolio={s.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <Link
                  href={s.href}
                  className="block truncate text-[18px] font-medium tracking-[-0.025em] text-ink-900 underline-offset-4 hover:underline sm:text-[20px]"
                >
                  {s.name}
                </Link>
                <p className="mt-0.5 truncate text-[12px] text-ink-500">{s.subtitle}</p>
              </div>
            </header>

            <dl className="mt-4 grid grid-cols-5 divide-x divide-line border-y border-line">
              {KEYS.map((k) => {
                const v = s.changes[k];
                return (
                  <div key={k} className="min-w-0 px-1 py-2.5 text-center">
                    <dt className="text-[11px] text-ink-500">
                      <span aria-hidden="true">{SHORT[k]}</span>
                      <span className="sr-only">{PERIOD_LABELS[k]}</span>
                    </dt>
                    <dd
                      className={cn(
                        "mt-1 text-[11px] leading-tight sm:text-[13px] xl:text-[14px]",
                        v === null ? "text-ink-500" : cn("num whitespace-nowrap", v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-700"),
                      )}
                    >
                      {v === null ? "Sin dato" : formatSignedPct(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0)}
                    </dd>
                  </div>
                );
              })}
            </dl>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
              <PerformanceChart points={s.points} className="h-[180px] sm:h-[220px] xl:h-[240px]" />
              <div className="min-w-0">
                <p className="mb-1.5 label-line">Principales posiciones</p>
                {s.holdingsLocked ? (
                  <LockedHoldings compact />
                ) : s.top.length > 0 ? (
                  <ul className="flex flex-col">
                    {s.top.map((h, j) => (
                      <li key={h.symbol} className={j ? "border-t border-line" : undefined}>
                        <Link href={stockHref(h.symbol)} className="group block py-2">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-[12px] font-medium text-ink-900">
                              {h.symbol}
                              <span className="ml-1.5 font-normal text-ink-500 group-hover:underline">
                                {h.name || "Sin nombre"}
                              </span>
                            </span>
                            <span className="num shrink-0 text-[12px] text-ink-900">{formatPctPlain(h.weight, 1)}</span>
                          </div>
                          <div className="mt-1.5 h-px bg-ink-100" aria-hidden="true">
                            <div
                              className="h-px bg-ink-900"
                              style={{ width: `${Math.max(1, Math.min(100, h.weight))}%` }}
                            />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-1 text-[12px] leading-relaxed text-ink-500">
                    Sin posiciones publicadas todavía.
                  </p>
                )}
              </div>
            </div>

            <footer className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[12px] text-ink-500">
              <span className="min-w-0 truncate">
                {s.asOf ? `Al ${formatShortDate(s.asOf)}` : "Sin fecha de cierre"}
                {s.estimated ? " · serie estimada" : ""}
              </span>
              <Link href={s.href} className="shrink-0 font-medium text-ink-900 underline-offset-4 hover:underline">
                Ver portafolio
              </Link>
            </footer>
          </article>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <p className="num shrink-0 text-[12px] text-ink-500" aria-live="polite">
              {current + 1} / {slides.length}
            </p>
            <div className="hidden items-center sm:flex" role="group" aria-label="Ir a un portafolio">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Ir a ${s.name}`}
                  aria-current={i === current ? "true" : undefined}
                  aria-controls={trackId}
                  onClick={() => go(i)}
                  className="group flex h-8 w-6 items-center justify-center"
                >
                  <span
                    className={cn(
                      "h-px w-full transition-colors",
                      i === current ? "bg-ink-900" : "bg-ink-400 group-hover:bg-ink-500",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Portafolio anterior"
              aria-controls={trackId}
              onClick={() => go(current - 1)}
              disabled={current === 0}
              className="inline-flex size-9 items-center justify-center border border-line text-ink-900 transition-colors hover:border-ink-900 disabled:opacity-40 disabled:hover:border-line"
            >
              <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Portafolio siguiente"
              aria-controls={trackId}
              onClick={() => go(current + 1)}
              disabled={current === last}
              className="inline-flex size-9 items-center justify-center border border-line text-ink-900 transition-colors hover:border-ink-900 disabled:opacity-40 disabled:hover:border-line"
            >
              <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
