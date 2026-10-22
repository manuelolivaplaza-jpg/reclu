import { cn, formatCompact } from "@/lib/utils";
import type { HeroCard } from "@/lib/hero-portfolios";

/**
 * PhoneMockups — tres teléfonos con tarjetas de portafolios reales.
 *
 * Mockups en HTML/CSS puro (sin imágenes): marco de 1px negro redondeado,
 * rotación leve, sombra suave. El contenido son los portafolios que
 * entrega la home (ver `src/lib/hero-portfolios.ts`).
 */

/** Rotaciones y alturas distintas para que el grupo se vea superpuesto. */
const TILTS = [
  { tilt: "-rotate-6", lift: "translate-y-3", z: "z-10" },
  { tilt: "rotate-1", lift: "-translate-y-2", z: "z-20" },
  { tilt: "rotate-6", lift: "translate-y-4", z: "z-10" },
];

function returnPill(returnPct: number) {
  const positive = returnPct >= 0;
  return {
    label: `${positive ? "+" : ""}${returnPct.toFixed(1)}%`,
    className: positive
      ? "bg-green-50 text-green-700"
      : "bg-red-50 text-red-600",
  };
}

function PhoneCard({ card }: { card: HeroCard }) {
  const pill = returnPill(card.returnPct);

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-neutral-950">
            {card.name}
          </p>
          {card.manager ? (
            <p className="mt-0.5 truncate text-[13px] text-neutral-500">
              {card.manager}
            </p>
          ) : null}
        </div>
        {card.isExample ? (
          <span className="shrink-0 rounded-full border border-neutral-200/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Ejemplo
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span
          className={cn(
            "num rounded-full px-2.5 py-1 text-[13px] font-semibold",
            pill.className,
          )}
        >
          {pill.label}
          <span className="ml-1 text-[11px] font-medium opacity-80">YTD</span>
        </span>
        {card.followers !== null ? (
          <span className="text-[12px] text-neutral-500">
            {formatCompact(card.followers)} seguidores
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Phone({ card, index }: { card: HeroCard; index: number }) {
  const { tilt, lift, z } = TILTS[index % TILTS.length];

  return (
    <div
      className={cn(
        "w-[248px] shrink-0 rounded-[2.5rem] border-8 border-neutral-950 bg-white p-3",
        "shadow-[0_18px_50px_-20px_rgba(10,10,10,0.45)]",
        tilt,
        lift,
        z,
      )}
    >
      {/* Barra superior del mockup: una línea y un punto, sin texto. */}
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
        <span className="size-1.5 rounded-full bg-neutral-300" aria-hidden />
      </div>
      <PhoneCard card={card} />
    </div>
  );
}

/**
 * Grupo de mockups. Con menos de tres tarjetas, el grupo se centra.
 */
export function PhoneMockups({ cards }: { cards: HeroCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="relative mt-16 flex justify-center overflow-hidden md:mt-24">
      <div className="flex -space-x-10 sm:-space-x-12 md:-space-x-16">
        {cards.slice(0, 3).map((card, index) => (
          <Phone key={card.slug} card={card} index={index} />
        ))}
      </div>
    </div>
  );
}
