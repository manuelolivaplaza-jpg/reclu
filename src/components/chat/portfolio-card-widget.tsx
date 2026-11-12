"use client";

import Link from "next/link";
import { useState } from "react";
import type { PortfolioCardData } from "@/lib/chat-ia/tools";
import { Sparkline } from "@/components/chat/sparkline";

function pct(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`;
}

function Logo({ card }: { card: PortfolioCardData }) {
  const [failed, setFailed] = useState(false);
  const initials = card.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (card.image && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={card.image}
        alt=""
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full border border-ink-200 bg-ink-50 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900 text-[11px] font-medium tracking-wide text-white"
    >
      {initials}
    </span>
  );
}

export function PortfolioCardWidget({ card }: { card: PortfolioCardData }) {
  const positive = (card.returnPct ?? 0) >= 0;
  const formatted = pct(card.returnPct);
  return (
    <Link
      href={`/app/portafolio/${encodeURIComponent(card.slug)}`}
      className="group flex min-w-[248px] snap-start items-center gap-3 border border-ink-200 bg-white p-3.5 transition-colors hover:border-ink-900"
    >
      <Logo card={card} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{card.name}</p>
        <p className="truncate text-xs text-ink-500">
          {card.period ?? "Sin métrica"}
          {card.asOf ? ` · al ${card.asOf}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Sparkline values={card.spark} positive={positive} />
        {formatted === null ? (
          <span className="text-xs font-normal text-ink-400">Sin dato</span>
        ) : (
          <span className={`text-sm font-medium tabular-nums ${positive ? "text-positive" : "text-negative"}`}>{formatted}</span>
        )}
      </div>
    </Link>
  );
}

export function PortfolioCardRail({ cards }: { cards: PortfolioCardData[] }) {
  if (!cards.length) return null;
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible">
      {cards.map((c) => (
        <PortfolioCardWidget key={c.slug} card={c} />
      ))}
    </div>
  );
}
