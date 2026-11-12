import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPortfolioBySlug, getPerformance } from "@/lib/queries";
import { getPortfolioPerformanceData } from "@/lib/performance-queries";
import { computePerformanceMetrics, fromPctToLevel } from "@/lib/performance";
import { EmbeddedPerformanceChart } from "@/components/embedded-performance-chart";

/**
 * Gráfico incrustable (P4/M6): mini curva portafolio vs S&P 500 apta para
 * iframe en medios y creadores. Marca "Datos de fraccion.si" siempre visible.
 * CSP: /embed/* permite frame-ancestors (ver next.config.ts); el resto sigue
 * 'none'.
 *
 * El iframe no hereda el tema del sitio anfitrión: el lienzo es blanco
 * explícito y las cifras de rendimiento usan los verdes y rojos del esquema
 * claro, aunque el sitio propio esté en oscuro.
 */
export const instant = false;

interface EmbedPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: EmbedPageProps) {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  return {
    title: portfolio
      ? { absolute: `${portfolio.name} · Datos de fraccion.si` }
      : { absolute: "Datos de fraccion.si" },
    robots: { index: false },
  };
}

export default async function EmbedPage({ params }: EmbedPageProps) {
  await connection();
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) notFound();

  const performanceSeries = await getPerformance(portfolio.id);
  const data = await getPortfolioPerformanceData({
    portfolioId: portfolio.id,
    country: portfolio.country,
    performanceSeries,
  });

  // Sin datos reales: estado vacío honesto (no se inventa la curva).
  const metrics =
    data.metrics ??
    (performanceSeries.length >= 2
      ? computePerformanceMetrics({ portfolio: fromPctToLevel(performanceSeries) })
      : null);

  return (
    <div className="min-h-dvh w-full overflow-x-clip bg-white text-ink-900 [color-scheme:light] [--color-positive:#0f7a32] [--color-negative:#c81e1e]">
      <EmbeddedPerformanceChart
        name={portfolio.name}
        slug={portfolio.slug}
        benchmarkLabel={data.benchmarkLabel}
        portfolioSeries={
          data.portfolioSeries.length >= 2
            ? data.portfolioSeries
            : fromPctToLevel(performanceSeries)
        }
        benchmarkSeries={data.benchmarkSeries}
        metrics={metrics}
      />
    </div>
  );
}
