"use client";

import Link from "next/link";
import { useState } from "react";
import type { PortfolioCardData } from "@/lib/chat-ia/tools";
import { Sparkline } from "@/components/chat/sparkline";

function pct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`;
}

function Logo({ card }: { card: PortfolioCardData }) {
  const [failed, setFailed] = useState(false);
  const initials = card.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  if (card.image && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={card.image} alt="" onError={() => setFailed(true)} className="h-10 w-10 rounded-full bg-white object-cover" />;
  }
  return (
    <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-sky-600 text-sm font-semibold text-white">
      {initials}
    </span>
  );
}

export function PortfolioCardWidget({ card }: { card: PortfolioCardData }) {
  const positive = (card.returnPct ?? 0) >= 0;
  return (
    <Link
      href={`/app/portafolio/${encodeURIComponent(card.slug)}`}
      className="group flex min-w-[240px] snap-start items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-emerald-400/40 hover:bg-white/[0.07]"
    >
      <Logo card={card} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{card.name}</p>
        <p className="text-xs text-zinc-400">
          {card.period ?? "Sin métrica"}
          {card.asOf ? ` · al ${card.asOf}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Sparkline values={card.spark} positive={positive} />
        <span className={`text-sm font-semibold tabular-nums ${positive ? "text-emerald-400" : "text-red-400"}`}>{pct(card.returnPct)}</span>
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
