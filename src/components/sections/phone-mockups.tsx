import Link from "next/link";
import { cn, formatCompact, formatShortDate, formatSignedPct } from "@/lib/utils";
import type { HeroCard } from "@/lib/hero-portfolios";
import { PortfolioAvatar } from "@/components/portfolio-avatar";

/**
 * Tarjetas del hero (D28): tres tarjetas grandes, sin marco de teléfono ni
 * recuadro alrededor. La del centro (Trump dice) va destacada y más alta.
 * Orden visual en escritorio: izquierda, centro, derecha. En móvil se
 * apilan con la destacada primero.
 *
 * Sistema editorial: radio 0, filete de 1px, cero sombras. El hover solo
 * cambia el filete. Las cifras usan los tokens `positive`/`negative`, que ya
 * suben de luminancia en modo oscuro.
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
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-12 w-full", positive ? "text-positive" : "text-negative", className)}
      aria-hidden
    >
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="currentColor" opacity={0.08} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
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
      href={`/portfolio/${card.slug}`}
      className={cn(
        "group relative flex w-full flex-col rounded-none border border-ink-300 bg-white text-left",
        "transition-colors duration-150 hover:border-ink-900",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[3px] focus-visible:outline-ink-900",
        "dark:border-white/12 dark:bg-ink-950 dark:hover:border-white/40 dark:focus-visible:outline-white",
        s.box,
        featured && "z-10",
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-7 border border-ink-900 bg-white px-2 py-1 text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-ink-900 dark:border-white dark:bg-ink-950 dark:text-white md:left-8">
          Destacado
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-4">
        <span className="flex shrink-0 items-center justify-center" style={{ width: s.avatarBox, height: s.avatarBox }}>
          <PortfolioAvatar portfolio={card} size={s.avatar} className={cn("shrink-0", s.avatarScale)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-medium leading-tight tracking-tight text-ink-900 dark:text-white", s.name)} title={card.name}>
            {card.name}
          </p>
          <p className="mt-0.5 h-5 truncate text-[14px] leading-5 text-ink-500 dark:text-ink-400">{card.manager ?? "\u00a0"}</p>
        </div>
      </div>

      <div className="mt-6 shrink-0">
        <p className={cn("num truncate leading-none tracking-tight", s.num, positive ? "text-positive" : "text-negative")}>
          {formatPct(card.returnPct)}
        </p>
        <p
          className="mt-2 h-5 truncate text-[13px] leading-5 text-ink-500 dark:text-ink-400"
          title={card.estimated ? "La serie incluye un tramo estimado" : undefined}
        >
          Rendimiento {card.periodLabel || "YTD"}
          {card.estimated ? " \u00b7 estimado" : ""}
        </p>
        <p className="h-4 truncate text-[12px] leading-4 text-ink-500 dark:text-ink-400">
          {card.asOf ? `Actualizado el ${formatShortDate(card.asOf)}` : "\u00a0"}
        </p>
      </div>

      <div className={cn("mt-auto w-full shrink-0 pt-4", s.spark)}>
        {card.spark && card.spark.length > 1 ? (
          <Sparkline points={card.spark} positive={positive} className="h-full" />
        ) : null}
      </div>

      <div className="mt-4 flex shrink-0 items-center justify-between gap-4 border-t border-ink-200 pt-4 text-[13px] text-ink-500 dark:border-white/12 dark:text-ink-400">
        <span className="truncate">{card.followers !== null ? `${formatCompact(card.followers)} seguidores` : "\u00a0"}</span>
        <span className="shrink-0 font-medium text-ink-900 underline-offset-4 group-hover:underline dark:text-white">
          Ver portafolio {"\u2192"}
        </span>
      </div>
    </Link>
  );
}

/** Linea esqueleto con la altura exacta del texto que reemplaza. */
function Bone({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn("block select-none rounded-none bg-ink-100 text-transparent dark:bg-white/10", className)}>
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
      className={cn(
        "relative flex w-full animate-pulse flex-col rounded-none border border-ink-300 bg-white text-left dark:border-white/12 dark:bg-ink-950",
        s.box,
        featured && "z-10",
      )}
    >
      <div className="flex shrink-0 items-center gap-4">
        <span className="block shrink-0 rounded-2xl bg-ink-100 dark:bg-white/10" style={{ width: s.avatarBox, height: s.avatarBox }} />
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
        <span className="block h-full w-full rounded-none bg-ink-100 dark:bg-white/10" />
      </div>
      <div className="mt-4 flex shrink-0 items-center justify-between border-t border-ink-200 pt-4 text-[13px] dark:border-white/12">
        <Bone className="w-1/3" />
        <Bone className="w-1/4" />
      </div>
    </div>
  );
}

/*
 * Grilla: desde lg, columnas fijas [lateral | destacada mas ancha | lateral]
 * (laterales identicas). Antes de lg manda la pila movil: destacada primero a
 * todo el ancho y las dos laterales debajo, iguales entre si (2 columnas
 * desde sm, apiladas en xs).
 */
const GRID =
  "mx-auto mt-16 grid w-full max-w-6xl grid-cols-1 items-center gap-5 sm:grid-cols-2 md:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] md:gap-6 lg:gap-8";
const FEATURED_CELL = "min-w-0 order-first sm:col-span-2 lg:order-none lg:col-span-1";
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
