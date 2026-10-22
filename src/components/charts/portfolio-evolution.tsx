"use client";

import { useMemo } from "react";
import { AreaChart } from "@/components/charts/area-chart";

export interface EvolutionPoint {
  date: string;
  value: number;
}

export interface PortfolioEvolutionProps {
  data: EvolutionPoint[];
}

function formatDate(date: string): string {
  const iso = date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return date;
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(time));
}

function orderPoints(data: EvolutionPoint[]): EvolutionPoint[] {
  const rows = data
    .filter((point) => Number.isFinite(point.value))
    .map((point, index) => ({ point, index, time: Date.parse(point.date.includes("T") ? point.date : `${point.date}T00:00:00Z`) }));
  if (rows.length === 0 || rows.some((row) => !Number.isFinite(row.time))) {
    return rows.map((row) => row.point);
  }
  return [...rows]
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map((row) => row.point);
}

/**
 * Evolución del valor del portafolio.
 *
 * Mismo lenguaje visual que el hero: área con degradado, línea fina de
 * 1.5px (verde si sube, roja si baja), sin grilla ni ejes numéricos y
 * tooltip mínimo con la fecha y el valor. Los datos no cambian: es la misma
 * serie que antes, con otra pintura.
 */
export function PortfolioEvolution({ data }: PortfolioEvolutionProps) {
  const points = useMemo(() => orderPoints(data), [data]);

  if (points.length === 0) {
    return (
      <p className="border border-ink-200 px-3 py-10 text-[13px] text-ink-500">Sin serie de valor.</p>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const positive = last.value >= first.value;

  return (
    <figure className="w-full">
      <AreaChart
        points={points.map((point) => ({ x: point.date, y: point.value }))}
        positive={positive}
        height={240}
        formatValue={(value) =>
          new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value)
        }
        ariaLabel={`Evolución del portafolio: de ${first.value} el ${formatDate(
          first.date,
        )} a ${last.value} el ${formatDate(last.date)}.`}
      />
      <div className="mt-2 flex justify-between gap-3 text-[11px] tabular-nums text-ink-500">
        <span>{formatDate(first.date)}</span>
        {first.date !== last.date ? <span>{formatDate(last.date)}</span> : null}
      </div>
    </figure>
  );
}
