import { getPortfolios, getFollows, getProfile } from "@/lib/queries";
import { PortfolioCard } from "@/components/portfolio-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATEGORY_META, type PortfolioCategory } from "@/lib/types";
import { ExploreFilters } from "@/components/explore-filters";

export const metadata = {
  title: "Portafolios",
  description: "Explora todos los portafolios disponibles en reclu.cl",
};
// Lee searchParams + cookies de auth por request — nunca se prerenderiza.
export const instant = false;

interface ExplorePageProps {
  searchParams: Promise<{ categoria?: string; q?: string; pais?: string }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const category = params.categoria ?? "all";
  const search = params.q ?? "";

  const [portfolios, follows, profile] = await Promise.all([
    getPortfolios({ category, search }),
    getFollows(),
    getProfile(),
  ]);

  const followedIds = new Set(follows.map((f) => f.portfolio_id));
  const isPro = profile?.plan === "pro";

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

          {portfolios.length === 0 ? (
            <p className="mt-16 text-[15px] text-ink-500">
              Sin resultados. Prueba con otra búsqueda o vuelve a “Todos”.
            </p>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {portfolios.map((portfolio) => (
                <PortfolioCard
                  key={portfolio.id}
                  portfolio={portfolio}
                  isFollowing={followedIds.has(portfolio.id)}
                  isPro={isPro}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
