"use client";

import { useState } from "react";
import { cn, formatPctPlain } from "@/lib/utils";

export interface CompositionSlice {
  symbol: string;
  weight: number;
  name?: string | null;
}

export interface CompositionProps {
  data: CompositionSlice[];
  /** Cuántos activos se muestran con tono propio; el resto va a "Otros". */
  maxSlices?: number;
}

/** Escala de grises: el negro es el mayor peso y el gris claro el menor. */
const RAMP = ["#0a0a0a", "#2e2e2e", "#4d4d4d", "#6b6b6b", "#8f8f8f", "#b3b3b3", "#cfcfcf"];
const OTHERS = "#e6e6e6";

function formatWeight(weight: number): string {
  return formatPctPlain(Number.isFinite(weight) ? weight : 0, 1);
}

/**
 * Barra apilada de composición + leyenda siempre visible con el peso de cada
 * activo. Sin colores de marca ni degradados: la jerarquía se lee en grises.
 * La barra es decorativa; la lista es la fuente accesible de los datos.
 */
export function Composition({ data, maxSlices = 7 }: CompositionProps) {
  const [hot, setHot] = useState<number | null>(null);

  const clean = (Array.isArray(data) ? data : [])
    .filter((s) => s && Number.isFinite(Number(s.weight)) && Number(s.weight) > 0)
    .map((s) => {
      const symbol = String(s.symbol ?? "Sin símbolo");
      const name = String(s.name ?? "").trim();
      // Nunca "BE BE": el nombre solo se muestra si aporta algo al ticker.
      return { symbol, name: name.toUpperCase() === symbol.toUpperCase() ? "" : name, weight: Number(s.weight) };
    })
    .sort((a, b) => b.weight - a.weight);
  const total = clean.reduce((sum, s) => sum + s.weight, 0);

  if (clean.length === 0 || total <= 0) {
    return <p className="label-line py-8">Sin composición disponible.</p>;
  }

  const top = clean.slice(0, maxSlices);
  const restWeight = clean.slice(maxSlices).reduce((sum, s) => sum + s.weight, 0);
  const rows = top.map((s, i) => ({ ...s, color: RAMP[i % RAMP.length] }));
  if (restWeight > 0) {
    rows.push({
      symbol: "Otros",
      name: `${clean.length - top.length} activos`,
      weight: restWeight,
      color: OTHERS,
    });
  }

  return (
    <figure className="w-full">
      <div className="flex h-3 w-full gap-px" aria-hidden="true" onPointerLeave={() => setHot(null)}>
        {rows.map((r, i) => (
          <span
            key={`${r.symbol}-bar-${i}`}
            className="block h-full min-w-[3px]"
            style={{
              flexGrow: r.weight,
              flexBasis: 0,
              backgroundColor: r.color,
              opacity: hot === null || hot === i ? 1 : 0.35,
            }}
            onPointerEnter={() => setHot(i)}
          />
        ))}
      </div>

      <ul className="mt-5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map((r, i) => (
          <li
            key={`${r.symbol}-${i}`}
            className={cn("flex items-start gap-3 py-1.5 text-[13px] leading-snug", hot === i && "bg-ink-50")}
            onPointerEnter={() => setHot(i)}
            onPointerLeave={() => setHot(null)}
          >
            <span
              className="mt-1 size-2.5 shrink-0 border border-line"
              style={{ backgroundColor: r.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-ink-900">{r.symbol}</span>
              {r.name ? <span className="ml-1.5 text-ink-500">{r.name}</span> : null}
            </span>
            <span className="num shrink-0 text-ink-900">{formatWeight(r.weight)}</span>
          </li>
        ))}
      </ul>

      <figcaption className="sr-only">
        Composición del portafolio por activo, como porcentaje del total.
      </figcaption>
    </figure>
  );
}
