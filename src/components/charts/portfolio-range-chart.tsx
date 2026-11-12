"use client";

import { useMemo, useState } from "react";
import { AreaChart } from "@/components/charts/area-chart";
import { simulateInvestment } from "@/lib/simulated-investment";
import { cn } from "@/lib/utils";

export interface RangeSeriesPoint {
  date: string;
  value_pct: number;
}

type RangeKey = "1D" | "1S" | "1M" | "3M" | "1A" | "MAX";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1D", label: "1D", days: 1 },
  { key: "1S", label: "1S", days: 7 },
  { key: "1M", label: "1M", days: 31 },
  { key: "3M", label: "3M", days: 92 },
  { key: "1A", label: "1A", days: 366 },
  { key: "MAX", label: "Máx", days: null },
];

const RANGE_TEXT: Record<RangeKey, string> = {
  "1D": "del último día",
  "1S": "de la última semana",
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
 * Bloque de rendimiento tipo broker: retorno grande, selector 1D/1S/1M/3M/1A/Máx
 * y gráfico SVG propio a todo el ancho. Solo recibe datos planos (nada de
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
      // d68: incluye el punto previo a la ventana como base (1D = vs cierre anterior).
      const i = sorted.findIndex((p) => p.t >= from);
      const start = i <= 0 ? 0 : i - 1;
      out[r.key] = sorted.slice(start).map(({ date, value_pct }) => ({ date, value_pct }));
    }
    return out;
  }, [sorted]);

  const [range, setRange] = useState<RangeKey>(() => (slices["1A"].length >= 2 ? "1A" : "MAX"));
  const current = slices[range];
  const sim = current.length >= 2 ? simulateInvestment(current, amount) : null;
  const positive = (sim?.gainPct ?? 0) >= 0;

  if (sorted.length < 2 || !sim) {
    return <p className="label-line">Sin serie suficiente para graficar el rango.</p>;
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn("num text-[clamp(2rem,6vw,2.75rem)] leading-none", positive ? "text-positive" : "text-negative")}
            aria-live="polite"
          >
            {fmtPct(sim.gainPct)}
          </p>
          <p className="label-line mt-2">Retorno {RANGE_TEXT[range]}</p>
          {demo ? <p className="label-line mt-1">Serie ilustrativa</p> : null}
        </div>

        <div role="group" aria-label="Rango del gráfico" className="inline-flex border border-line">
          {RANGES.map((r) => {
            const enabled = slices[r.key].length >= 2;
            const active = r.key === range;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={active}
                disabled={!enabled}
                onClick={() => setRange(r.key)}
                className={cn(
                  "inline-flex min-h-10 min-w-11 items-center justify-center border-l border-line px-2.5 text-[13px] tabular-nums transition-colors first:border-l-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                  active
                    ? "bg-ink-900 text-white focus-visible:outline-white"
                    : enabled
                      ? "text-ink-500 hover:text-ink-900"
                      : "cursor-not-allowed text-ink-400",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <AreaChart
          points={sim.points.map((p) => ({ x: p.date, y: p.value }))}
          positive={positive}
          height={260}
          format="usd"
          ariaLabel={`${demo ? "Serie ilustrativa. " : ""}Evolución de ${fmtUsd(amount)} en el ${
            RANGE_TEXT[range]
          }: termina en ${fmtUsd(sim.finalValue)}.`}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3">
        <div className="bg-app-card p-3">
          <dt className="label-line">Si invertías</dt>
          <dd className="num mt-1 text-[15px] text-ink-900">{fmtUsd(amount)}</dd>
        </div>
        <div className="bg-app-card p-3">
          <dt className="label-line">Hoy tendrías</dt>
          <dd className="num mt-1 text-[15px] text-ink-900">{fmtUsd(sim.finalValue)}</dd>
        </div>
        <div className="col-span-2 bg-app-card p-3 sm:col-span-1">
          <dt className="label-line">Ganancia</dt>
          <dd className={cn("num mt-1 text-[15px]", positive ? "text-positive" : "text-negative")}>
            {sim.gain >= 0 ? "+" : "\u2212"}
            {fmtUsd(Math.abs(sim.gain))}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
        Basado en rendimiento histórico. Rentabilidades pasadas no garantizan resultados futuros.
      </p>
    </div>
  );
}
