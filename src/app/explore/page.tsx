import { getPortfolios, getFollows, getProfile } from "@/lib/queries";
import { PortfolioCard } from "@/components/portfolio-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATEGORY_META, type PortfolioCategory } from "@/lib/types";
import { ExploreFilters } from "@/components/explore-filters";

export const metadata = {
  title: "Explorar portafolios",
  description: "Explora todos los portafolios disponibles en reclu.cl",
};
// Reads searchParams + optional auth cookies per request — never prerendered.
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

  const categories = Object.entries(CATEGORY_META) as [PortfolioCategory, { label: string; description: string }][];

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-surface">
        {/* Page header */}
        <div className="border-b border-ink-200 bg-white">
          <div className="container-page py-12">
            <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Explorar portafolios
            </h1>
            <p
              className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-600"
            >
              {portfolios.length} portafolio{portfolios.length !== 1 ? "s" : ""} disponible
              {portfolios.length !== 1 ? "s" : ""}. Sigue los que te interesen y recibe
              alertas por email.
            </p>
          </div>
        </div>

        <div className="container-page py-10">
          {/* Filters */}
          <ExploreFilters categories={categories} activeCategory={category} />

          {/* Grid */}
          {portfolios.length === 0 ? (
            <div className="mt-12 rounded-card border border-dashed border-ink-300 bg-white p-16 text-center">
              <p className="text-lg font-medium text-ink-900">Sin resultados</p>
              <p className="mt-2 text-sm text-ink-600">
                No encontramos portafolios con esos filtros. Prueba con otra búsqueda.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
