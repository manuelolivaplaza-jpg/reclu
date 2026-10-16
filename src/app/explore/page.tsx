import { getPortfolios, getFollows, getProfile, getHoldings, getAlerts } from "@/lib/queries";
import { PortfolioCard } from "@/components/portfolio-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StaggerList, StaggerItem } from "@/components/ui/motion";
import { CATEGORY_META, isPaidPlan, type Portfolio, type PortfolioCategory } from "@/lib/types";
import { ExploreFilters } from "@/components/explore-filters";
import { ExploreRankings } from "@/components/explore-rankings";

/** getAlerts recorta por defecto a 20. El ranking cuenta publicadas, no solo las últimas. */
const ALERT_RANKING_LIMIT = 1000;

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

  const [listed, follows, profile, catalog, alerts] = await Promise.all([
    getPortfolios({ category, search }),
    getFollows(),
    getProfile(),
    getPortfolios(),
    getAlerts(undefined, ALERT_RANKING_LIMIT),
  ]);

  const portfolios = symbol
    ? await filterByHoldingSymbol(listed, symbol)
    : listed;

  const followedIds = new Set(follows.map((f) => f.portfolio_id));
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

          <ExploreRankings portfolios={catalog} alerts={alerts} />

          {portfolios.length === 0 ? (
            <p className="mt-16 text-[15px] text-ink-500">
              Sin resultados. Prueba con otra búsqueda o vuelve a “Todos”.
            </p>
          ) : (
            <StaggerList className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {portfolios.map((portfolio) => (
                <StaggerItem key={portfolio.id}>
                  <PortfolioCard
                    portfolio={portfolio}
                    isFollowing={followedIds.has(portfolio.id)}
                    isPro={isPro}
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** Portafolios cuyo listado de holdings incluye el símbolo (ya en mayúsculas). */
async function filterByHoldingSymbol(portfolios: Portfolio[], symbol: string): Promise<Portfolio[]> {
  const matches = await Promise.all(
    portfolios.map(async (portfolio) => {
      const holdings = await getHoldings(portfolio.id);
      return holdings.some((holding) => holding.symbol.trim().toUpperCase() === symbol);
    }),
  );
  return portfolios.filter((_, index) => matches[index]);
}
