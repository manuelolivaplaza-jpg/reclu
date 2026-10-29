import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPortfolioBySlug, getPerformance } from "@/lib/queries";
import { getPortfolioPerformanceData } from "@/lib/performance-queries";
import { computePerformanceMetrics, fromPctToLevel } from "@/lib/performance";
import { EmbeddedPerformanceChart } from "@/components/embedded-performance-chart";

/**
 * Gráfico incrustable (P4/M6): mini curva portafolio vs S&P 500 apta para
 * iframe en medios y creadores. Marca "Datos de reclu.cl" siempre visible.
 * CSP: /embed/* permite frame-ancestors (ver next.config.ts); el resto sigue
 * 'none'.
 */
export const instant = false;

interface EmbedPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: EmbedPageProps) {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  return {
    title: portfolio ? `${portfolio.name} — Datos de fraccion.si` : "fraccion.si",
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
    <EmbeddedPerformanceChart
      name={portfolio.name}
      slug={portfolio.slug}
      benchmarkLabel={data.benchmarkLabel}
      portfolioSeries={data.portfolioSeries.length >= 2 ? data.portfolioSeries : fromPctToLevel(performanceSeries)}
      benchmarkSeries={data.benchmarkSeries}
      metrics={metrics}
    />
  );
}
