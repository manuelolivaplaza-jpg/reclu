import Link from "next/link";
import { cn, formatCompact } from "@/lib/utils";
import type { HeroCard } from "@/lib/hero-portfolios";
import { PortfolioAvatar } from "@/components/portfolio-avatar";

/**
 * Tarjetas del hero (D28): tres tarjetas grandes, sin marco de teléfono ni
 * recuadro alrededor. La del centro (Trump dice) va destacada y más alta.
 * Orden visual en escritorio: izquierda, centro, derecha. En móvil se
 * apilan con la destacada primero.
 */

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Math.abs(rounded).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${text}%`;
}

function Sparkline({ points, positive, className }: { points: number[]; positive: boolean; className?: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 100;
  const h = 32;
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(2)},${(h - ((v - min) / span) * h).toFixed(2)}`)
    .join(" ");
  const stroke = positive ? "#15803d" : "#dc2626";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-12 w-full", className)} aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={stroke} opacity={0.08} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Card({ card }: { card: HeroCard }) {
  const positive = card.returnPct >= 0;
  const featured = card.featured === true;
  return (
    <Link
      href={card.isExample ? "/explore" : `/portfolio/${card.slug}`}
      className={cn(
        "group relative flex w-full flex-col rounded-3xl border border-neutral-200/80 bg-white text-left transition duration-200 hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px_rgba(15,23,42,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950",
        featured
          ? "z-10 p-7 shadow-[0_40px_80px_-24px_rgba(15,23,42,0.35)] md:p-8"
          : "p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]",
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-7 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-medium tracking-wide text-white">
          Destacado
        </span>
      ) : null}
      <div className="flex items-center gap-4">
        <PortfolioAvatar portfolio={card} size={64} className={featured ? "" : "scale-[0.875]"} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold tracking-tight text-neutral-950", featured ? "text-xl" : "text-[17px]")}>
            {card.name}
          </p>
          {card.manager ? <p className="mt-0.5 truncate text-[14px] text-neutral-500">{card.manager}</p> : null}
        </div>
        {card.isExample ? (
          <span className="shrink-0 rounded-full border border-neutral-200/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Ejemplo
          </span>
        ) : null}
      </div>

      <div className="mt-7">
        <p
          className={cn(
            "num font-semibold tracking-tight",
            featured ? "text-5xl md:text-6xl" : "text-4xl",
            positive ? "text-green-700" : "text-red-600",
          )}
        >
          {formatPct(card.returnPct)}
        </p>
        <p className="mt-1.5 text-[13px] text-neutral-500">
          Rendimiento {card.periodLabel || "YTD"}
          {card.estimated ? " · incluye tramo estimado" : ""}
        </p>
      </div>

      {card.spark && card.spark.length > 1 ? (
        <Sparkline points={card.spark} positive={positive} className={featured ? "mt-6 h-16" : "mt-5"} />
      ) : null}

      <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4 text-[13px] text-neutral-500">
        {card.followers !== null ? <span>{formatCompact(card.followers)} seguidores</span> : <span />}
        <span className="font-medium text-neutral-950 transition-transform group-hover:translate-x-0.5">Ver portafolio →</span>
      </div>
    </Link>
  );
}

/** Tres tarjetas; la destacada al centro. Con menos tarjetas se centran. */
export function PhoneMockups({ cards }: { cards: HeroCard[] }) {
  if (cards.length === 0) return null;
  const list = cards.slice(0, 3);
  const center = list.findIndex((c) => c.featured);
  // Móvil: destacada primero. Escritorio: orden original (izq, centro, der).
  return (
    <div className="mx-auto mt-16 grid w-full max-w-6xl grid-cols-1 items-center gap-6 md:mt-20 md:grid-cols-3 md:gap-6 lg:gap-8">
      {list.map((card, index) => (
        <div
          key={card.slug}
          className={cn(
            "min-w-0",
            index === center ? "order-first md:order-none md:scale-[1.06]" : "md:mt-6",
          )}
        >
          <Card card={card} />
        </div>
      ))}
    </div>
  );
}
