"use client";

import Link from "next/link";
import { useState } from "react";
import type { Period, PortfolioCardData } from "@/lib/chat-ia/tools";
import type { PortfolioCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";
import { formatShortDate, formatSignedPct } from "@/lib/utils";
import { Sparkline } from "@/components/chat/sparkline";

const PERIOD_LABEL: Record<Period, string> = {
  "1M": "último mes",
  "3M": "últimos 3 meses",
  YTD: "lo que va del año",
  "1A": "último año",
  TOTAL: "desde el inicio",
};

/** Frase completa para lectores de pantalla ("de retorno del último mes"). */
const PERIOD_PHRASE: Record<Period, string> = {
  "1M": "del último mes",
  "3M": "de los últimos 3 meses",
  YTD: "de lo que va del año",
  "1A": "del último año",
  TOTAL: "desde el inicio",
};

/** Solo etiquetas conocidas: una categoría nueva no se muestra en crudo. */
function categoryLabel(category: string | null): string | null {
  if (!category) return null;
  return CATEGORY_META[category as PortfolioCategory]?.label ?? null;
}

function Logo({ card }: { card: PortfolioCardData }) {
  const [failed, setFailed] = useState(false);
  const initials = card.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();

  if (card.image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={card.image}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 border border-app-border bg-app-card object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 shrink-0 place-items-center bg-ink-900 text-[11px] font-medium text-white"
    >
      {initials}
    </span>
  );
}

/**
 * Tarjeta de portafolio dentro del hilo del chat. Un solo enlace, sin
 * anidamientos: el nombre es el destino y el retorno va en cifras tabulares.
 */
export function PortfolioCardWidget({ card }: { card: PortfolioCardData }) {
  const hasReturn = card.returnPct !== null && Number.isFinite(card.returnPct);
  const positive = (card.returnPct ?? 0) >= 0;
  const formatted = hasReturn ? formatSignedPct(card.returnPct, 2) : null;
  const period = card.period ? PERIOD_LABEL[card.period] : null;
  const periodPhrase = card.period ? PERIOD_PHRASE[card.period] : null;
  const category = categoryLabel(card.category);
  const meta = [category, period].filter(Boolean).join(" · ");
  const asOf = formatShortDate(card.asOf);

  return (
    <Link
      href={`/app/portafolio/${encodeURIComponent(card.slug)}`}
      className="group flex w-[248px] max-w-full shrink-0 snap-start flex-col justify-between gap-3 border border-app-border bg-app-card p-3.5 transition-colors hover:border-ink-900 sm:w-full"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Logo card={card} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-snug tracking-[-0.01em] text-ink-900 group-hover:underline group-hover:underline-offset-2">
            {card.name}
          </p>
          <p className="mt-0.5 truncate text-[12px] leading-snug text-ink-500">
            {meta || "Cartera pública"}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <Sparkline values={card.spark} className="h-8 w-[104px] shrink-0" />
        <div className="min-w-0 text-right">
          {formatted === null ? (
            <span className="text-[12px] leading-tight text-ink-500">Sin retorno</span>
          ) : (
            <>
              <span
                className={`num block text-[16px] leading-tight ${positive ? "text-positive" : "text-negative"}`}
              >
                {formatted}
              </span>
              <span className="sr-only"> de retorno {periodPhrase ?? ""}</span>
              {asOf ? (
                <span className="mt-0.5 block text-[11px] leading-tight text-ink-500">
                  Al {asOf}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Carrusel en el celular, grilla de dos columnas desde `sm`. */
export function PortfolioCardRail({ cards }: { cards: PortfolioCardData[] }) {
  if (!cards.length) return null;

  return (
    <div
      role="group"
      aria-label={cards.length === 1 ? "Portafolio mencionado" : "Portafolios mencionados"}
      className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0"
    >
      {cards.map((card) => (
        <PortfolioCardWidget key={card.slug} card={card} />
      ))}
    </div>
  );
}
