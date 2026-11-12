"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { AppLink as Link } from "@/components/app/app-link";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META } from "@/lib/types";
import { cn, formatSignedPct } from "@/lib/utils";
import { ExploreHeroChart } from "@/components/explore/explore-hero-chart";
import type { FeaturedSlide } from "@/components/explore/explore-featured";
import { HERO_PERIODS, type HeroPeriod } from "@/components/explore/explore-periods";

/** Verde/rojo solo en la cifra; el cero se queda en tinta. */
const tone = (v: number) => (v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-900 dark:text-white");

/** Selector de período (1D…Máx) junto al nombre; cambia el gráfico. */
function PeriodTabs({
  slide,
  value,
  onChange,
}: {
  slide: FeaturedSlide;
  value: HeroPeriod;
  onChange: (p: HeroPeriod) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Período del gráfico"
      className="inline-flex shrink-0 self-start border border-ink-300 dark:border-white/15"
    >
      {HERO_PERIODS.map((p) => {
        const locked = slide.lockedPeriods.includes(p.key);
        const active = p.key === value;
        return (
          <button
            key={p.key}
            type="button"
            aria-pressed={active}
            aria-label={locked ? `${p.label} (disponible con suscripción)` : p.label}
            onClick={() => onChange(p.key)}
            className={cn(
              "inline-flex h-9 items-center gap-1 border-l border-ink-300 px-2.5 text-[12px] font-medium tabular-nums transition-colors first:border-l-0 sm:px-3",
              "dark:border-white/15",
              active
                ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900"
                : "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white",
            )}
          >
            {p.label}
            {locked ? <Lock className="size-2.5" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Slide({ s, i, total, isPro }: { s: FeaturedSlide; i: number; total: number; isPro: boolean }) {
  const [period, setPeriod] = useState<HeroPeriod>(s.defaultPeriod);
  const meta = HERO_PERIODS.find((p) => p.key === period)!;
  const locked = s.lockedPeriods.includes(period);
  const data = s.charts[period] ?? [];
  const ret = s.returns[period];

  return (
    <article
      role="group"
      aria-roledescription="diapositiva"
      aria-label={`${i + 1} de ${total}: ${s.name}`}
      className="flex w-full shrink-0 snap-start snap-always flex-col p-4 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <Link
          href={`/portfolio/${canonicalPortfolioSlug(s.slug)}`}
          className="group flex min-w-0 items-center gap-3 focus-visible:outline-offset-2 sm:flex-1"
        >
          <PortfolioAvatar
            portfolio={{ slug: s.slug, name: s.name, category: s.category, cover_image: s.cover_image, portrait_image: s.portrait_image }}
            size={40}
          />
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-semibold tracking-tight text-ink-900 group-hover:underline dark:text-white sm:text-[22px]">
              {s.name}
            </h3>
            <p className="truncate text-[12px] text-ink-500 dark:text-white/55">
              {CATEGORY_META[s.category]?.label ?? ""} · {s.followers.toLocaleString("es-CL")} seguidores · Más seguido #{i + 1}
              {s.estimated ? " · incluye tramo estimado" : ""}
            </p>
          </div>
        </Link>
        <PeriodTabs slide={s} value={period} onChange={setPeriod} />
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {ret === null ? (
          <span className="text-[15px] font-medium text-ink-500 dark:text-white/55">
            Sin dato en este período
          </span>
        ) : (
          <>
            <span className={cn("text-[30px] font-semibold leading-none tracking-tight tabular-nums sm:text-[36px]", tone(ret))}>
              {formatSignedPct(ret)}
            </span>
            <span className="text-[13px] text-ink-500 dark:text-white/55">{meta.long}</span>
          </>
        )}
      </div>

      <div className="mt-3 min-w-0">
        {locked ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-3 border border-dashed border-ink-300 bg-ink-50 px-4 text-center dark:border-white/15 dark:bg-white/[0.03] sm:h-[320px]">
            <Lock className="size-5 text-ink-500 dark:text-white/55" aria-hidden="true" />
            <p className="max-w-xs text-[13px] leading-relaxed text-ink-600 dark:text-white/60">
              El gráfico de {meta.label} es para suscriptores. Sin plan ves hasta 3 meses.
            </p>
            <Link
              href="/upgrade"
              className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[13px] font-medium text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100"
            >
              Suscribirme
            </Link>
          </div>
        ) : (
          <ExploreHeroChart key={period} data={data} height={320} className="min-h-[260px]" />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 [&>*:first-child]:flex-1 sm:[&>*:first-child]:max-w-xs">
        <FollowButton portfolioId={s.id} initialFollowing={s.isFollowing} initialIsPro={isPro} portfolioPremium={s.premium} variant="page" />
        <Link
          href={`/portfolio/${canonicalPortfolioSlug(s.slug)}`}
          className="inline-flex h-11 shrink-0 items-center rounded-full border border-ink-300 px-5 text-[14px] font-medium text-ink-900 transition-colors hover:border-ink-900 hover:bg-ink-50 dark:border-white/20 dark:text-white dark:hover:border-white dark:hover:bg-white/[0.06]"
        >
          Ver
        </Link>
      </div>
    </article>
  );
}

/**
 * Panel principal de Explorar (d54/d68), estilo Polymarket: carrusel de los
 * portafolios más seguidos con gráfico protagonista y selector de período.
 * Scroll-snap nativo, flechas y puntos. Solo recibe datos planos.
 *
 * Sin autoplay a propósito: nada avanza solo ni roba el foco. Las flechas y
 * los puntos son botones reales; la pista se puede recorrer con el teclado.
 */
export function ExploreHeroCarousel({ slides, isPro }: { slides: FeaturedSlide[]; isPro: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const trackId = useId();
  const [index, setIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const n = el.children.length;
      if (n === 0) return;
      const next = ((i % n) + n) % n;
      const reduce =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
      const name = slides[next]?.name;
      setAnnouncement(`Diapositiva ${next + 1} de ${n}${name ? `: ${name}` : ""}`);
    },
    [slides],
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const n = el.children.length;
        const raw = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        setIndex(Math.min(Math.max(0, raw), Math.max(0, n - 1)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (slides.length === 0) return null;

  const current = Math.min(index, slides.length - 1);

  return (
    <section
      role="region"
      aria-roledescription="carrusel"
      aria-label="Portafolios más seguidos"
      className="min-w-0"
    >
      <div className="relative overflow-hidden border border-ink-300 bg-white max-sm:-mx-4 max-sm:border-x-0 dark:border-white/12 dark:bg-panel">
        <div
          ref={track}
          id={trackId}
          role="group"
          aria-label="Diapositivas"
          tabIndex={0}
          onKeyDown={(e) => {
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
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-offset-[-2px]"
        >
          {slides.map((s, i) => (
            <Slide key={s.id} s={s} i={i} total={slides.length} isPro={isPro} />
          ))}
        </div>

        {slides.length > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-ink-300 px-4 py-2 sm:px-6 dark:border-white/12">
            <div role="group" aria-label="Elegir portafolio" className="flex items-center">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Ir a ${s.name} (${i + 1} de ${slides.length})`}
                  aria-current={i === current ? "true" : undefined}
                  aria-controls={trackId}
                  onClick={() => go(i)}
                  className="inline-flex h-9 w-6 items-center justify-center transition-opacity hover:opacity-70"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "block h-[3px] transition-all",
                      i === current ? "w-5 bg-ink-900 dark:bg-white" : "w-3 bg-ink-300 dark:bg-white/25",
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Portafolio anterior"
                aria-controls={trackId}
                onClick={() => go(current - 1)}
                className="inline-flex size-9 items-center justify-center rounded-full border border-ink-300 text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900 dark:border-white/20 dark:text-white/70 dark:hover:border-white dark:hover:text-white"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Portafolio siguiente"
                aria-controls={trackId}
                onClick={() => go(current + 1)}
                className="inline-flex size-9 items-center justify-center rounded-full border border-ink-300 text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900 dark:border-white/20 dark:text-white/70 dark:hover:border-white dark:hover:text-white"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </div>
    </section>
  );
}
