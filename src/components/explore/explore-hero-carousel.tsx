"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppLink as Link } from "@/components/app/app-link";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExploreHeroChart } from "@/components/explore/explore-hero-chart";
import type { FeaturedSlide } from "@/components/explore/explore-featured";
import { LockedHoldings } from "@/components/locked-holdings";

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2).replace(".", ",");
  return `${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${s}%`;
}

const tone = (v: number | null) =>
  v === null ? "text-ink-500" : v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-900";

const PERIODS = [
  { key: "d1", label: "1D" },
  { key: "w1", label: "1S" },
  { key: "m1", label: "1M" },
  { key: "y1", label: "1A" },
] as const;

/**
 * Panel principal de Explorar (d54), estilo Polymarket: un carrusel con los
 * portafolios más seguidos. Scroll-snap nativo (se desliza con el dedo),
 * flechas y puntos. Solo recibe datos planos.
 */
export function ExploreHeroCarousel({ slides, isPro }: { slides: FeaturedSlide[]; isPro: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = el.children.length;
    const next = ((i % n) + n) % n;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (slides.length === 0) return null;

  return (
    <section aria-roledescription="carrusel" aria-label="Portafolios más seguidos" className="min-w-0">
      <div className="app-card relative overflow-hidden rounded-2xl shadow-app-raised max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
        <div
          ref={track}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(index + 1);
            if (e.key === "ArrowLeft") go(index - 1);
          }}
        >
          {slides.map((s, i) => (
            <article
              key={s.id}
              aria-roledescription="diapositiva"
              aria-label={`${i + 1} de ${slides.length}: ${s.name}`}
              className="w-full shrink-0 snap-start snap-always p-4 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/portfolio/${s.slug}`} className="group flex min-w-0 items-center gap-3">
                  <PortfolioAvatar
                    portfolio={{ slug: s.slug, name: s.name, category: s.category, cover_image: s.cover_image, portrait_image: s.portrait_image }}
                    size={40}
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-[18px] font-semibold tracking-tight text-ink-900 group-hover:underline sm:text-[22px]">
                      {s.name}
                    </h2>
                    <p className="text-[12px] text-ink-500">
                      {CATEGORY_META[s.category]?.label ?? ""} · {s.followers.toLocaleString("es-CL")} seguidores
                      {s.estimated ? " · incluye tramo estimado" : ""}
                    </p>
                  </div>
                </Link>
                <span className="hidden shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-700 sm:inline-flex">
                  Más seguido #{i + 1}
                </span>
              </div>

              <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:gap-8">
                <div className="order-2 flex flex-col gap-4 lg:order-1">
                  <dl className="grid grid-cols-4 gap-2">
                    {PERIODS.map((p) => (
                      <div key={p.key} className="rounded-xl bg-ink-50 px-2 py-2 text-center">
                        <dt className="text-[11px] font-medium text-ink-500">{p.label}</dt>
                        <dd className={cn("mt-0.5 text-[13px] font-semibold tabular-nums sm:text-[14px]", tone(s.returns[p.key]))}>
                          {fmtPct(s.returns[p.key])}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {s.holdingsLocked ? (
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-500">Principales posiciones</p>
                      <LockedHoldings compact />
                    </div>
                  ) : s.top.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-500">Principales posiciones</p>
                      <ul className="flex flex-col gap-2.5">
                        {s.top.map((h) => (
                          <li key={h.symbol} className="min-w-0">
                            <div className="flex items-baseline justify-between gap-3 text-[13px]">
                              <span className="min-w-0 truncate">
                                <span className="font-semibold text-ink-900">{h.symbol}</span>{" "}
                                <span className="text-ink-500">{h.name !== h.symbol ? h.name : ""}</span>
                              </span>
                              <span className="shrink-0 font-medium tabular-nums text-ink-900">
                                {h.weight.toFixed(1).replace(".", ",")}%
                              </span>
                            </div>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-100">
                              <div className="h-full rounded-full bg-ink-900" style={{ width: `${Math.min(100, Math.max(2, h.weight))}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-auto flex items-center gap-2 [&>*:first-child]:flex-1">
                    <FollowButton portfolioId={s.id} initialFollowing={s.isFollowing} initialIsPro={isPro} portfolioPremium={s.premium} variant="page" />
                    <Link
                      href={`/portfolio/${s.slug}`}
                      className="inline-flex h-11 shrink-0 items-center rounded-full border border-ink-200 px-4 text-[14px] font-medium text-ink-900 hover:bg-ink-50"
                    >
                      Ver
                    </Link>
                  </div>
                </div>

                <div className="order-1 min-w-0 lg:order-2">
                  <ExploreHeroChart data={s.chart} height={240} />
                  <p className="mt-1 text-right text-[11px] text-ink-400">
                    {isPro ? "Último año" : "Últimos 90 días"} · rendimiento acumulado
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {slides.length > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-app-border px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Elegir portafolio">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Ir a ${s.name}`}
                  onClick={() => go(i)}
                  className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-ink-900" : "w-1.5 bg-ink-300 hover:bg-ink-500")}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Anterior" onClick={() => go(index - 1)} className="inline-flex size-9 items-center justify-center rounded-full border border-ink-200 text-ink-700 hover:bg-ink-50">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" aria-label="Siguiente" onClick={() => go(index + 1)} className="inline-flex size-9 items-center justify-center rounded-full border border-ink-200 text-ink-700 hover:bg-ink-50">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
