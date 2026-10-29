import Link from "next/link";
import { cn, formatCompact, formatShortDate, formatSignedPct } from "@/lib/utils";
import type { HeroCard } from "@/lib/hero-portfolios";
import { PortfolioAvatar } from "@/components/portfolio-avatar";

/**
 * Tarjetas del hero (D28): tres tarjetas grandes, sin marco de teléfono ni
 * recuadro alrededor. La del centro (Trump dice) va destacada y más alta.
 * Orden visual en escritorio: izquierda, centro, derecha. En móvil se
 * apilan con la destacada primero.
 */

function formatPct(value: number): string {
  return formatSignedPct(value, 1);
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

/*
 * D59: medidas fijas. Las tarjetas laterales (Berkshire, iShares) comparten
 * EXACTAMENTE la misma caja: alto fijo, mismo padding, avatar, tipografia y
 * sparkline de alto fijo. Las lineas opcionales siempre reservan su espacio
 * y los textos se truncan, asi el contenido no cambia el tamano.
 * La destacada (Trump dice) es mas ancha, mas alta y con cifra/grafico mayores.
 */
const SIZE = {
  featured: {
    box: "h-[25rem] p-7 md:h-[29rem] md:p-8",
    avatar: 64, avatarBox: 64, avatarScale: "",
    name: "text-xl md:text-2xl",
    num: "text-5xl md:text-6xl",
    spark: "h-20 md:h-24",
  },
  side: {
    box: "h-[21rem] p-6",
    avatar: 64, avatarBox: 56, avatarScale: "scale-[0.875]",
    name: "text-[17px]",
    num: "text-4xl",
    spark: "h-14",
  },
} as const;

function Card({ card }: { card: HeroCard }) {
  const positive = card.returnPct >= 0;
  const featured = card.featured === true;
  const s = featured ? SIZE.featured : SIZE.side;
  return (
    <Link
      href={card.isExample ? "/explore" : `/portfolio/${card.slug}`}
      className={cn(
        "group relative flex w-full flex-col overflow-visible rounded-3xl border border-neutral-200/80 bg-white text-left transition duration-200 hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px_rgba(15,23,42,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950",
        s.box,
        featured
          ? "z-10 shadow-[0_40px_80px_-24px_rgba(15,23,42,0.35)]"
          : "shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]",
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-7 rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-medium tracking-wide text-white">
          Destacado
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-4">
        <span className="flex shrink-0 items-center justify-center" style={{ width: s.avatarBox, height: s.avatarBox }}>
          <PortfolioAvatar portfolio={card} size={s.avatar} className={cn("shrink-0", s.avatarScale)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold leading-tight tracking-tight text-neutral-950", s.name)} title={card.name}>
            {card.name}
          </p>
          <p className="mt-0.5 h-5 truncate text-[14px] leading-5 text-neutral-500">{card.manager ?? "\u00a0"}</p>
        </div>
        {card.isExample ? (
          <span className="shrink-0 rounded-full border border-neutral-200/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Ejemplo
          </span>
        ) : null}
      </div>

      <div className="mt-6 shrink-0">
        <p className={cn("num truncate font-semibold leading-none tracking-tight", s.num, positive ? "text-green-700" : "text-red-600")}>
          {formatPct(card.returnPct)}
        </p>
        <p className="mt-2 h-5 truncate text-[13px] leading-5 text-neutral-500">
          Rendimiento {card.periodLabel || "YTD"}
          {card.estimated ? " \u00b7 incluye tramo estimado" : ""}
        </p>
        <p className="h-4 truncate text-[12px] leading-4 text-neutral-400">
          {card.asOf ? `Actualizado el ${formatShortDate(card.asOf)}` : "\u00a0"}
        </p>
      </div>

      <div className={cn("mt-auto w-full shrink-0 pt-4", s.spark)}>
        {card.spark && card.spark.length > 1 ? (
          <Sparkline points={card.spark} positive={positive} className="h-full" />
        ) : null}
      </div>

      <div className="mt-4 flex shrink-0 items-center justify-between border-t border-neutral-100 pt-4 text-[13px] text-neutral-500">
        <span className="truncate">{card.followers !== null ? `${formatCompact(card.followers)} seguidores` : "\u00a0"}</span>
        <span className="shrink-0 font-medium text-neutral-950 transition-transform group-hover:translate-x-0.5">
          Ver portafolio {"\u2192"}
        </span>
      </div>
    </Link>
  );
}

/** Linea esqueleto con la altura exacta del texto que reemplaza. */
function Bone({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn("block select-none rounded-md bg-neutral-100 text-transparent", className)}>
      &nbsp;
    </span>
  );
}

/** D36/D59: esqueleto con las MISMAS medidas fijas que `Card` (sin CLS). */
function SkeletonCard({ featured }: { featured: boolean }) {
  const s = featured ? SIZE.featured : SIZE.side;
  return (
    <div
      aria-hidden
      className={cn("relative flex w-full animate-pulse flex-col rounded-3xl border border-neutral-200/80 bg-white text-left", s.box, featured && "z-10")}
    >
      <div className="flex shrink-0 items-center gap-4">
        <span className="block shrink-0 rounded-full bg-neutral-100" style={{ width: s.avatarBox, height: s.avatarBox }} />
        <div className="min-w-0 flex-1">
          <Bone className={cn("w-3/4 leading-tight", s.name)} />
          <Bone className="mt-0.5 h-5 w-1/2 text-[14px] leading-5" />
        </div>
      </div>
      <div className="mt-6 shrink-0">
        <Bone className={cn("num w-1/2 leading-none", s.num)} />
        <Bone className="mt-2 h-5 w-2/3 text-[13px] leading-5" />
        <Bone className="h-4 w-1/2 text-[12px] leading-4" />
      </div>
      <div className={cn("mt-auto w-full shrink-0 pt-4", s.spark)}>
        <span className="block h-full w-full rounded-md bg-neutral-100" />
      </div>
      <div className="mt-4 flex shrink-0 items-center justify-between border-t border-neutral-100 pt-4 text-[13px]">
        <Bone className="w-1/3" />
        <Bone className="w-1/4" />
      </div>
    </div>
  );
}

/*
 * Grilla: escritorio con columnas fijas [lateral | destacada mas ancha | lateral]
 * (laterales identicas). Movil: destacada primero a todo el ancho y las dos
 * laterales debajo, iguales entre si (2 columnas desde sm, apiladas en xs).
 */
const GRID =
  "mx-auto mt-16 grid w-full max-w-6xl grid-cols-1 items-center gap-5 sm:grid-cols-2 md:mt-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] md:gap-6 lg:gap-8";
const FEATURED_CELL = "min-w-0 order-first sm:col-span-2 md:order-none md:col-span-1";
const SIDE_CELL = "min-w-0";

/** Fallback del hero: tres tarjetas esqueleto en la misma grilla. */
export function PhoneMockupsSkeleton() {
  return (
    <div role="status" aria-label="Cargando portafolios" className={GRID}>
      {[false, true, false].map((featured, index) => (
        <div key={index} className={featured ? FEATURED_CELL : SIDE_CELL}>
          <SkeletonCard featured={featured} />
        </div>
      ))}
    </div>
  );
}

/** Tres tarjetas; la destacada al centro. */
export function PhoneMockups({ cards }: { cards: HeroCard[] }) {
  if (cards.length === 0) return null;
  const list = cards.slice(0, 3);
  return (
    <div className={GRID}>
      {list.map((card) => (
        <div key={card.slug} className={card.featured ? FEATURED_CELL : SIDE_CELL}>
          <Card card={card} />
        </div>
      ))}
    </div>
  );
}