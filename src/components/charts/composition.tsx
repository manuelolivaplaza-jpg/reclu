"use client";

import { useRef, useState } from "react";

export interface CompositionSlice {
  symbol: string;
  weight: number;
}

export interface CompositionProps {
  data: CompositionSlice[];
}

interface Tip {
  index: number;
  x: number;
  edge: number;
}

function formatWeight(weight: number): string {
  return `${weight.toFixed(1)}%`;
}

/**
 * Barras horizontales apiladas. Cada holding es negro y el ancho
 * es su peso sobre el total, de modo que la pista cierra en 100%.
 */
export function Composition({ data }: CompositionProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const slices = data.filter((slice) => Number.isFinite(slice.weight) && slice.weight > 0);
  const total = slices.reduce((sum, slice) => sum + slice.weight, 0);

  function place(segment: HTMLButtonElement, index: number) {
    const bar = barRef.current;
    if (!bar) return;
    const segmentBox = segment.getBoundingClientRect();
    const track = bar.getBoundingClientRect();
    const x = segmentBox.left - track.left + segmentBox.width / 2;
    const edge = track.width > 0 ? x / track.width : 0.5;
    setTip({ index, x, edge });
  }

  if (slices.length === 0 || total <= 0) {
    return (
      <p className="border border-ink-200 px-3 py-10 text-[13px] text-ink-500">Sin composición.</p>
    );
  }

  const active = tip !== null ? slices[tip.index] : undefined;
  const edge = tip ? tip.edge : 0.5;

  return (
    <figure className="w-full">
      <div ref={barRef} className="relative flex h-9 w-full sm:h-11" onPointerLeave={() => setTip(null)}>
        {slices.map((slice, index) => {
          const hot = tip === null || tip.index === index;
          return (
            <button
              key={`${slice.symbol}-${index}`}
              type="button"
              className={
                "h-full min-w-0 border-r border-white p-0 last:border-r-0 " +
                (hot ? "bg-ink-900" : "bg-ink-400")
              }
              style={{ flexGrow: slice.weight, flexShrink: 1, flexBasis: "0%" }}
              aria-label={`${slice.symbol} ${formatWeight(slice.weight)}`}
              onPointerEnter={(event) => place(event.currentTarget, index)}
              onPointerMove={(event) => place(event.currentTarget, index)}
              onFocus={(event) => place(event.currentTarget, index)}
              onBlur={() => setTip(null)}
            />
          );
        })}
        {active && tip ? (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-2 border border-ink-200 bg-white px-2.5 py-1.5"
            style={{
              left: tip.x,
              transform: edge < 0.15 ? "translateX(0)" : edge > 0.85 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            <p className="text-[13px] text-ink-900">
              <span className="font-medium">{active.symbol}</span>{" "}
              <span className="num">{formatWeight(active.weight)}</span>
            </p>
          </div>
        ) : null}
      </div>
      <p className="mt-2 min-h-5 text-[13px] text-ink-900">
        {active ? (
          <>
            <span className="font-medium">{active.symbol}</span>{" "}
            <span className="num text-ink-500">{formatWeight(active.weight)}</span>
          </>
        ) : (
          <span className="text-ink-500">Peso sobre el total de la cartera.</span>
        )}
      </p>
    </figure>
  );
}
