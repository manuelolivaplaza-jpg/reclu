"use client";
import { formatPctPlain } from "@/lib/utils";

import { useState } from "react";

export interface CompositionSlice {
  symbol: string;
  weight: number;
  name?: string | null;
}

export interface CompositionProps {
  data: CompositionSlice[];
  /** Cuantos activos se muestran con color propio; el resto va a "Otros". */
  maxSlices?: number;
}

/** Paleta suave estilo Autopilot. */
const PALETTE = ["#6366f1", "#22c55e", "#f59e0b", "#0ea5e9", "#ec4899", "#14b8a6", "#a855f7", "#f97316"];
const OTHERS = "#d4d4d4";

function formatWeight(weight: number): string {
  return formatPctPlain(Number.isFinite(weight) ? weight : 0, 1);
}

/** Barra apilada redondeada + leyenda siempre visible. */
export function Composition({ data, maxSlices = 7 }: CompositionProps) {
  const [hot, setHot] = useState<number | null>(null);

  const clean = (Array.isArray(data) ? data : [])
    .filter((s) => s && Number.isFinite(Number(s.weight)) && Number(s.weight) > 0)
    .map((s) => ({ symbol: String(s.symbol ?? "—"), name: s.name ?? "", weight: Number(s.weight) }))
    .sort((a, b) => b.weight - a.weight);
  const total = clean.reduce((sum, s) => sum + s.weight, 0);

  if (clean.length === 0 || total <= 0) {
    return (
      <p className="rounded-xl bg-neutral-50 px-3 py-10 text-center text-[13px] text-ink-500">
        Sin composición disponible.
      </p>
    );
  }

  const top = clean.slice(0, maxSlices);
  const restWeight = clean.slice(maxSlices).reduce((sum, s) => sum + s.weight, 0);
  const rows = top.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  if (restWeight > 0) {
    rows.push({ symbol: "Otros", name: `${clean.length - top.length} activos`, weight: restWeight, color: OTHERS });
  }

  return (
    <figure className="w-full">
      <div className="flex h-4 w-full gap-[2px]" onPointerLeave={() => setHot(null)}>
        {rows.map((r, i) => (
          <div
            key={`${r.symbol}-${i}`}
            className="h-full min-w-[4px] rounded-full transition-opacity"
            style={{
              flexGrow: r.weight,
              flexBasis: 0,
              background: r.color,
              opacity: hot === null || hot === i ? 1 : 0.35,
            }}
            title={`${r.symbol} ${formatWeight(r.weight)}`}
            onPointerEnter={() => setHot(i)}
          />
        ))}
      </div>
      <ul className="mt-5 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map((r, i) => (
          <li
            key={`${r.symbol}-l-${i}`}
            className={"flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors " + (hot === i ? "bg-neutral-50" : "")}
            onPointerEnter={() => setHot(i)}
            onPointerLeave={() => setHot(null)}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[13px]">
              <span className="font-medium text-ink-900">{r.symbol}</span>
              {r.name ? <span className="ml-1.5 text-ink-500">{r.name}</span> : null}
            </span>
            <span className="num shrink-0 text-[13px] font-medium text-ink-900">{formatWeight(r.weight)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
