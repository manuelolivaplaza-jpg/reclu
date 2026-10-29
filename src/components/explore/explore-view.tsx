import { Suspense } from "react";
import { timed } from "@/lib/timing";
import { getPortfolios, getFollows, getProfile, getHoldingSymbolsAdmin, getPortfolioIdsWithSeriesAdmin, getExploreCardStats, pickCardStats } from "@/lib/queries";
import { PortfolioGrid } from "@/components/explore/portfolio-grid";
import { ExploreRankingsSection } from "@/components/explore/explore-rankings-section";
import { RankingsSkeleton } from "@/components/explore/skeletons";
import { portfolioIdsWithSymbol } from "@/lib/explore-paging";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageHeader } from "@/components/app/page-header";
import { CATEGORY_META, isPaidPlan, type Portfolio, type PortfolioCategory } from "@/lib/types";
import { ExploreFilters } from "@/components/explore-filters";


export interface ExploreSearchParams {
  categoria?: string;
  q?: string;
  pais?: string;
  simbolo?: string;
}

/**
 * d47: contenido de Explorar, compartido por /explore (público, SEO) y
 * /app/explorar (dentro del dashboard, sin SiteHeader ni SiteFooter).
 */
export async function ExploreView({ params, inApp = false }: { params: ExploreSearchParams; inApp?: boolean }) {
  const category = params.categoria ?? "all";
  const search = params.q ?? "";
  const symbol = (params.simbolo ?? "").trim().toUpperCase();

  const [listed, follows, profile, withSeries, allStats] = await Promise.all([
    timed("explore.getPortfolios", getPortfolios({ category, search })),
    timed("explore.getFollows", getFollows()),
    timed("explore.getProfile", getProfile()),
    timed("explore.idsWithSeries", getPortfolioIdsWithSeriesAdmin()),
    timed("explore.cardStats", getExploreCardStats()),
  ]);

  const portfolios = symbol
    ? await filterByHoldingSymbol(listed, symbol)
    : listed;

  // D40: retorno y sparkline de cada tarjeta desde la serie real (una
  // consulta .in cacheada); sin serie la tarjeta no muestra cifra.
  // D43: tarjetas ya calculadas (cache remoto), sin bajar las series.
  const cardStats = pickCardStats(portfolios, allStats);

  const followedIds = follows.map((f) => f.portfolio_id);
  const isPro = isPaidPlan(profile?.plan);


  const categories = Object.entries(CATEGORY_META) as [
    PortfolioCategory,
    { label: string; description: string },
  ][];

  const content = (
    <>
          <div className="mt-10">
            <ExploreFilters categories={categories} activeCategory={category} basePath={inApp ? "/app/explorar" : "/explore"} />
          </div>

          <Suspense fallback={<RankingsSkeleton />}>
            <ExploreRankingsSection />
          </Suspense>

          {portfolios.length === 0 ? (
            <p className="mt-16 text-[15px] text-ink-500">
              Sin resultados. Prueba con otra búsqueda o vuelve a “Todos”.
            </p>
          ) : (
            <PortfolioGrid
              portfolios={portfolios}
              followedIds={followedIds}
              isPro={isPro}
              cardStats={cardStats}
              noSeriesIds={withSeries ? portfolios.filter((p) => !withSeries.has(p.id)).map((p) => p.id) : []}
            />
          )}
    </>
  );

  if (inApp) {
    return (
      <>
        <PageHeader title="Explorar" subtitle="Portafolios de inversionistas, fondos y políticos con datos públicos." />
        <div className="[&>div:first-child]:mt-0">{content}</div>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page py-16 md:py-20">
          <h1 className="type-section text-ink-900">Portafolios.</h1>
          {content}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}


/** Portafolios cuyo listado de holdings incluye el símbolo (ya en mayúsculas). Una sola consulta. */
async function filterByHoldingSymbol(portfolios: Portfolio[], symbol: string): Promise<Portfolio[]> {
  const rows = await getHoldingSymbolsAdmin(portfolios.map((portfolio) => portfolio.id));
  const ids = portfolioIdsWithSymbol(rows, symbol);
  return portfolios.filter((portfolio) => ids.has(portfolio.id));
}
