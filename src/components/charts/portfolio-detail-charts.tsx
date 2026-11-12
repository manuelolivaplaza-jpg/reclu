"use client";

import type { ComparisonPoint } from "./comparison";
import { formatSignedPct } from "@/lib/utils";
import { Composition, type CompositionSlice } from "./composition";
import { Heatmap, type HeatmapRow } from "./heatmap";
import { PortfolioEvolution, type EvolutionPoint } from "./portfolio-evolution";
import { AreaChart } from "./area-chart";

export interface PortfolioDetailChartsProps {
  composition: CompositionSlice[];
  /** Serie de valor. Sin puntos, la sección no se pinta. */
  evolution?: EvolutionPoint[];
  /** Dos series reales. Si falta una, la sección no se pinta. */
  comparison?: {
    portfolio: ComparisonPoint[];
    benchmark: ComparisonPoint[];
  };
  /** Retorno mensual por símbolo. Sin celdas, la sección no se pinta. */
  heatmap?: HeatmapRow[];
}

export function ChartSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-8 first:pt-0">
      {title ? <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">{title}</h2> : null}
      <div className="mt-6 min-w-0">{children}</div>
    </section>
  );
}

interface ReturnPoint {
  date: string;
  ret: number;
}

/** Retorno acumulado % desde el primer valor de la serie. */
function toReturns(series: ComparisonPoint[]): ReturnPoint[] {
  const rows = series
    .filter((point) => Number.isFinite(point.value))
    .map((point, index) => {
      const iso = point.date.includes("T") ? point.date : `${point.date.slice(0, 10)}T00:00:00Z`;
      return { date: point.date, value: point.value, time: Date.parse(iso), index };
    });
  const dated = rows.length > 0 && rows.every((row) => Number.isFinite(row.time));
  const ordered = dated ? [...rows].sort((a, b) => a.time - b.time || a.index - b.index) : rows;
  const base = ordered[0]?.value;
  if (!base) return [];
  return ordered.map((row) => ({
    date: row.date,
    ret: (row.value / base - 1) * 100,
  }));
}

function formatPct(value: number): string {
  return formatSignedPct(value, 1);
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

/**
 * Rendimiento contra el benchmark con el mismo lenguaje del resto: línea
 * negra de 1.5px para el portafolio y gris punteada de 1px para el índice,
 * sin relleno ni degradado. Sin grilla numérica propia: los valores del
 * período están en la leyenda y en el tooltip. Los datos no cambian.
 */
function PerformanceChart({ portfolio, benchmark }: { portfolio: ComparisonPoint[]; benchmark: ComparisonPoint[] }) {
  const portReturns = toReturns(portfolio);
  const benchReturns = toReturns(benchmark);
  if (portReturns.length < 2 || benchReturns.length < 2) {
    return <p className="label-line py-6">Sin serie suficiente para comparar.</p>;
  }

  const benchByDate = new Map(benchReturns.map((point) => [point.date, point.ret]));
  const aligned = portReturns.filter((point) => benchByDate.has(point.date));
  if (aligned.length < 2) {
    return <p className="label-line py-6">Sin fechas en común entre el portafolio y el benchmark.</p>;
  }

  const points = aligned.map((point) => ({ x: point.date, y: point.ret }));
  const secondary = aligned.map((point) => ({ x: point.date, y: benchByDate.get(point.date) ?? 0 }));

  const portEnd = aligned[aligned.length - 1].ret;
  const benchEnd = benchByDate.get(aligned[aligned.length - 1].date) ?? 0;

  return (
    <figure className="w-full">
      <ul className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
        <li className="flex items-center gap-2 text-ink-900">
          <span className="inline-block h-px w-5 bg-ink-900" aria-hidden="true" />
          <span>Portafolio</span>
          <span className={"num " + (portEnd >= 0 ? "text-positive" : "text-negative")}>{formatPct(portEnd)}</span>
        </li>
        <li className="flex items-center gap-2 text-ink-500">
          <span className="inline-block h-px w-5 border-t border-dashed border-ink-500" aria-hidden="true" />
          <span>Benchmark</span>
          <span className={"num " + (benchEnd >= 0 ? "text-positive" : "text-negative")}>{formatPct(benchEnd)}</span>
        </li>
      </ul>

      <AreaChart
        points={points}
        secondary={secondary}
        secondaryLabel="Benchmark"
        positive={portEnd >= 0}
        height={240}
        formatValue={(value) => formatPct(value)}
        ariaLabel={`Rendimiento acumulado del portafolio contra el benchmark: de ${formatPct(
          points[0].y,
        )} el ${formatDate(points[0].x)} a ${formatPct(portEnd)} el ${formatDate(aligned[aligned.length - 1].date)}.`}
      />
    </figure>
  );
}

/**
 * Gráficos del detalle. Composition usa los holdings actuales.
 * Evolución, comparación y heatmap solo aparecen con una serie real:
 * un arreglo vacío no reserva espacio ni muestra un placeholder.
 */
export function PortfolioDetailCharts({ composition, evolution, comparison, heatmap }: PortfolioDetailChartsProps) {
  const slices = composition.filter((slice) => Number.isFinite(slice.weight) && slice.weight > 0);
  const evolutionPoints = (evolution ?? []).filter((point) => Number.isFinite(point.value));
  const portfolioSeries = (comparison?.portfolio ?? []).filter((point) => Number.isFinite(point.value));
  const benchmarkSeries = (comparison?.benchmark ?? []).filter((point) => Number.isFinite(point.value));
  const heatmapRows = (heatmap ?? [])
    .map((row) => ({
      symbol: row.symbol,
      monthly: row.monthly.filter((cell) => Number.isFinite(cell.returnPct)),
    }))
    .filter((row) => row.monthly.length > 0);

  if (
    slices.length === 0 &&
    evolutionPoints.length === 0 &&
    (portfolioSeries.length === 0 || benchmarkSeries.length === 0) &&
    heatmapRows.length === 0
  ) {
    return null;
  }

  return (
    <div>
      {slices.length > 0 ? (
        <ChartSection title="Composición">
          <Composition data={slices} />
        </ChartSection>
      ) : null}
      {evolutionPoints.length > 0 ? (
        <ChartSection title="Evolución">
          <PortfolioEvolution data={evolutionPoints} />
        </ChartSection>
      ) : null}
      {portfolioSeries.length > 0 && benchmarkSeries.length > 0 ? (
        <ChartSection title="Comparación">
          <PerformanceChart portfolio={portfolioSeries} benchmark={benchmarkSeries} />
        </ChartSection>
      ) : null}
      {heatmapRows.length > 0 ? (
        <ChartSection title="Retornos mensuales">
          <Heatmap rows={heatmapRows} />
        </ChartSection>
      ) : null}
    </div>
  );
}
