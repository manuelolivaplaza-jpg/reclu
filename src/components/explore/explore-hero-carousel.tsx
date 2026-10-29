"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { AppLink as Link } from "@/components/app/app-link";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExploreHeroChart } from "@/components/explore/explore-hero-chart";
import type { FeaturedSlide } from "@/components/explore/explore-featured";
import { HERO_PERIODS, type HeroPeriod } from "@/components/explore/explore-periods";

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2).replace(".", ",");
  return `${v > 0 ? "+" : v < 0 ? "\u2212" : ""}${s}%`;
}

const tone = (v: number | null) =>
  v === null ? "text-ink-500" : v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-900";

/** Selector de período (1D…Máx) arriba a la derecha; cambia el gráfico. */
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
    <div role="tablist" aria-label="Período del gráfico" className="inline-flex rounded-full bg-ink-100 p-0.5">
      {HERO_PERIODS.map((p) => {
        const locked = slide.lockedPeriods.includes(p.key);
        const active = p.key === value;
        return (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={locked ? "Disponible con suscripción" : undefined}
            onClick={() => onChange(p.key)}
            className={cn(
              "inline-flex h-7 items-center gap-0.5 rounded-full px-2.5 text-[12px] font-medium tabular-nums transition-colors sm:px-3",
              active ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900",
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
      aria-roledescription="diapositiva"
      aria-label={`${i + 1} de ${total}: ${s.name}`}
      className="flex w-full shrink-0 snap-start snap-always flex-col p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={`/portfolio/${s.slug}`} className="group flex min-w-0 flex-1 items-center gap-3">
          <PortfolioAvatar
            portfolio={{ slug: s.slug, name: s.name, category: s.category, cover_image: s.cover_image, portrait_image: s.portrait_image }}
            size={40}
          />
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-semibold tracking-tight text-ink-900 group-hover:underline sm:text-[22px]">
              {s.name}
            </h2>
            <p className="truncate text-[12px] text-ink-500">
              {CATEGORY_META[s.category]?.label ?? ""} · {s.followers.toLocaleString("es-CL")} seguidores · Más seguido #{i + 1}
              {s.estimated ? " · incluye tramo estimado" : ""}
            </p>
          </div>
        </Link>
        <PeriodTabs slide={s} value={period} onChange={setPeriod} />
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cn("text-[30px] font-semibold leading-none tracking-tight tabular-nums sm:text-[36px]", tone(ret))}>
          {fmtPct(ret)}
        </span>
        <span className="text-[13px] text-ink-500">{meta.long}</span>
      </div>

      <div className="mt-3 min-w-0">
        {locked ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-3 rounded-xl bg-ink-50 text-center sm:h-[320px]">
            <Lock className="size-5 text-ink-500" aria-hidden="true" />
            <p className="max-w-xs text-[13px] text-ink-600">
              El gráfico de {meta.label} es para suscriptores. Sin plan ves hasta 3 meses.
            </p>
            <Link href="/upgrade" className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[13px] font-medium text-white hover:bg-ink-800">
              Suscribirme
            </Link>
          </div>
        ) : (
          <ExploreHeroChart data={data} height={320} className="min-h-[260px]" />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 [&>*:first-child]:flex-1 sm:[&>*:first-child]:max-w-xs">
        <FollowButton portfolioId={s.id} initialFollowing={s.isFollowing} initialIsPro={isPro} portfolioPremium={s.premium} variant="page" />
        <Link
          href={`/portfolio/${s.slug}`}
          className="inline-flex h-11 shrink-0 items-center rounded-full border border-ink-200 px-5 text-[14px] font-medium text-ink-900 hover:bg-ink-50"
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
            <Slide key={s.id} s={s} i={i} total={slides.length} isPro={isPro} />
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
