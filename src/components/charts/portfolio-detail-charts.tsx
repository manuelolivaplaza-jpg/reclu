"use client";

import { Comparison, type ComparisonPoint } from "./comparison";
import { Composition, type CompositionSlice } from "./composition";
import { Heatmap, type HeatmapRow } from "./heatmap";
import { PortfolioEvolution, type EvolutionPoint } from "./portfolio-evolution";

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
    <section className="border-b border-ink-200 py-8 first:pt-0">
      {title ? <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">{title}</h2> : null}
      <div className="mt-6 min-w-0">{children}</div>
    </section>
  );
}

/**
 * Gráficos del detalle. Composition usa los holdings actuales.
 * Evolución, comparación y heatmap solo aparecen con una serie real:
 * un arreglo vacío no reserva espacio ni muestra un placeholder.
 */
export function PortfolioDetailCharts({
  composition,
  evolution,
  comparison,
  heatmap,
}: PortfolioDetailChartsProps) {
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
          <Comparison portfolio={portfolioSeries} benchmark={benchmarkSeries} />
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
