"use client";

import { useMemo, useState } from "react";
import { AreaChart } from "@/components/charts/area-chart";
import { simulateInvestment } from "@/lib/simulated-investment";
import { cn } from "@/lib/utils";

export interface RangeSeriesPoint {
  date: string;
  value_pct: number;
}

type RangeKey = "1M" | "3M" | "1A" | "MAX";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1M", label: "1M", days: 31 },
  { key: "3M", label: "3M", days: 92 },
  { key: "1A", label: "1A", days: 366 },
  { key: "MAX", label: "Máx", days: null },
];

const RANGE_TEXT: Record<RangeKey, string> = {
  "1M": "último mes",
  "3M": "últimos 3 meses",
  "1A": "último año",
  MAX: "desde el inicio",
};

function toTime(date: string): number {
  return Date.parse(date.includes("T") ? date : `${date.slice(0, 10)}T00:00:00Z`);
}

function fmtPct(value: number): string {
  const abs = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Math.abs(value));
  return `${value >= 0 ? "+" : "\u2212"}${abs}%`;
}

function fmtUsd(value: number): string {
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(value)} USD`;
}

/**
 * Bloque de rendimiento tipo broker: retorno grande, selector 1M/3M/1A/Máx y
 * gráfico SVG propio a todo el ancho. Solo recibe datos planos (nada de
 * funciones ni componentes desde el servidor). Los rangos sin al menos 2
 * puntos se deshabilitan: nunca se inventa un retorno.
 */
export function PortfolioRangeChart({
  series,
  amount = 10_000,
  demo = false,
}: {
  series: RangeSeriesPoint[];
  amount?: number;
  demo?: boolean;
}) {
  const sorted = useMemo(
    () =>
      series
        .filter((p) => Number.isFinite(toTime(p.date)) && Number.isFinite(Number(p.value_pct)))
        .map((p) => ({ date: p.date, value_pct: Number(p.value_pct), t: toTime(p.date) }))
        .sort((a, b) => a.t - b.t),
    [series],
  );

  const slices = useMemo(() => {
    const last = sorted.length ? sorted[sorted.length - 1].t : 0;
    const out = {} as Record<RangeKey, RangeSeriesPoint[]>;
    for (const r of RANGES) {
      const from = r.days === null ? -Infinity : last - r.days * 86_400_000;
      out[r.key] = sorted.filter((p) => p.t >= from).map(({ date, value_pct }) => ({ date, value_pct }));
    }
    return out;
  }, [sorted]);

  const [range, setRange] = useState<RangeKey>("MAX");
  const current = slices[range];
  const sim = current.length >= 2 ? simulateInvestment(current, amount) : null;
  const positive = (sim?.gainPct ?? 0) >= 0;

  if (sorted.length < 2) return null;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className={cn(
              "num text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-none tracking-tight tabular-nums",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {sim ? fmtPct(sim.gainPct) : "—"}
          </p>
          <p className="mt-2 text-[13px] text-ink-500">
            Retorno {RANGE_TEXT[range]}
            {demo ? (
              <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">
                Ejemplo
              </span>
            ) : null}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Rango del gráfico"
          className="inline-flex rounded-full bg-ink-100 p-1"
        >
          {RANGES.map((r) => {
            const enabled = slices[r.key].length >= 2;
            const active = r.key === range;
            return (
              <button
                key={r.key}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!enabled}
                onClick={() => setRange(r.key)}
                className={cn(
                  "min-w-11 rounded-full px-3 py-1.5 text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 disabled:cursor-not-allowed disabled:opacity-40",
                  active ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {sim ? (
        <div className="-mx-4 mt-5 sm:mx-0">
          <AreaChart
            points={sim.points.map((p) => ({ x: p.date, y: p.value }))}
            positive={positive}
            height={220}
            format="usd"
            ariaLabel={`Evolución de ${fmtUsd(amount)} en el ${RANGE_TEXT[range]}: termina en ${fmtUsd(sim.finalValue)}.`}
          />
        </div>
      ) : null}

      {sim ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-ink-50 p-3">
            <dt className="text-[12px] text-ink-500">Si invertías</dt>
            <dd className="num mt-1 text-[15px] font-medium tabular-nums text-ink-900">{fmtUsd(amount)}</dd>
          </div>
          <div className="rounded-xl bg-ink-50 p-3">
            <dt className="text-[12px] text-ink-500">Hoy tendrías</dt>
            <dd className="num mt-1 text-[15px] font-medium tabular-nums text-ink-900">{fmtUsd(sim.finalValue)}</dd>
          </div>
          <div className="col-span-2 rounded-xl bg-ink-50 p-3 sm:col-span-1">
            <dt className="text-[12px] text-ink-500">Ganancia</dt>
            <dd className={cn("num mt-1 text-[15px] font-medium tabular-nums", positive ? "text-positive" : "text-negative")}>
              {sim.gain >= 0 ? "+" : "\u2212"}
              {fmtUsd(Math.abs(sim.gain))}
            </dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-3 text-[11px] text-ink-500">
        Basado en rendimiento histórico. Rentabilidades pasadas no garantizan resultados futuros.
      </p>
    </div>
  );
}
