import { Suspense } from "react";
import { getPortfolios, getFollows, getProfile, getHoldingSymbolsAdmin, getPortfolioIdsWithSeriesAdmin } from "@/lib/queries";
import { PortfolioGrid } from "@/components/explore/portfolio-grid";
import { ExploreRankingsSection } from "@/components/explore/explore-rankings-section";
import { RankingsSkeleton } from "@/components/explore/skeletons";
import { portfolioIdsWithSymbol } from "@/lib/explore-paging";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATEGORY_META, isPaidPlan, type Portfolio, type PortfolioCategory } from "@/lib/types";
import { ExploreFilters } from "@/components/explore-filters";

export const metadata = {
  title: "Portafolios",
  description: "Explora todos los portafolios disponibles en reclu.cl",
};
// Lee searchParams + cookies de auth por request — nunca se prerenderiza.
export const instant = false;

interface ExplorePageProps {
  searchParams: Promise<{ categoria?: string; q?: string; pais?: string; simbolo?: string }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const category = params.categoria ?? "all";
  const search = params.q ?? "";
  const symbol = (params.simbolo ?? "").trim().toUpperCase();

  const [listed, follows, profile, withSeries] = await Promise.all([
    getPortfolios({ category, search }),
    getFollows(),
    getProfile(),
    getPortfolioIdsWithSeriesAdmin(),
  ]);

  const portfolios = symbol
    ? await filterByHoldingSymbol(listed, symbol)
    : listed;

  const followedIds = follows.map((f) => f.portfolio_id);
  const isPro = isPaidPlan(profile?.plan);


  const categories = Object.entries(CATEGORY_META) as [
    PortfolioCategory,
    { label: string; description: string },
  ][];

  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page py-16 md:py-20">
          <h1 className="type-section text-ink-900">Portafolios.</h1>

          <div className="mt-10">
            <ExploreFilters categories={categories} activeCategory={category} />
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
              noSeriesIds={withSeries ? portfolios.filter((p) => !withSeries.has(p.id)).map((p) => p.id) : []}
            />
          )}
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
