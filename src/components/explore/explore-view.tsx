import { Suspense } from "react";
import { timed } from "@/lib/timing";
import { getFollows, getProfile } from "@/lib/queries";
import { PortfolioGrid } from "@/components/explore/portfolio-grid";
import { ExploreRankingsSection } from "@/components/explore/explore-rankings-section";
import { RankingsSkeleton } from "@/components/explore/skeletons";
import { exploreCardsPage, INITIAL_CARDS, listExplorePortfolios } from "@/lib/explore-cards";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATEGORY_META, isPaidPlan, type PortfolioCategory } from "@/lib/types";
import { ExploreToolbar } from "@/components/explore/explore-toolbar";
import { ExploreHeroSection, ExploreHeroSkeleton } from "@/components/explore/explore-hero-section";



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
export async function ExploreView({
  params,
  inApp = false,
  chrome = !inApp,
}: {
  params: ExploreSearchParams;
  inApp?: boolean;
  /** d65: false cuando la página ya pinta header/footer en su shell estático. */
  chrome?: boolean;
}) {
  const category = params.categoria ?? "all";
  const search = params.q ?? "";
  const symbol = (params.simbolo ?? "").trim().toUpperCase();

  const [portfolios, follows, profile] = await Promise.all([
    listExplorePortfolios({ category, search, symbol }),
    timed("explore.getFollows", getFollows()),
    timed("explore.getProfile", getProfile()),
  ]);

  // d62 (P2): el HTML trae solo las primeras INITIAL_CARDS tarjetas con los
  // campos que se dibujan (sparklines <= 60 pts, 2 decimales); el resto se
  // pide a /api/explore/cards al hacer scroll o "Cargar más".
  const first = await exploreCardsPage(portfolios, 0, INITIAL_CARDS, follows.map((f) => f.portfolio_id));
  const isPro = isPaidPlan(profile?.plan);


  const categories = Object.entries(CATEGORY_META) as [
    PortfolioCategory,
    { label: string; description: string },
  ][];

  const pills = categories.map(([value, meta]) => ({ value, label: meta.label }));
  const filtering = category !== "all" || Boolean(search.trim()) || Boolean(symbol);

  // d54: panel principal (carrusel de los más seguidos) arriba; buscador y
  // filtros discretos; todo lo demás en tarjetas. Sin título gigante.
  const content = (
    <div className="flex flex-col gap-6 sm:gap-8">
      {chrome ? <h1 className="sr-only">Explorar portafolios</h1> : null}

      {!filtering ? (
        <Suspense fallback={<ExploreHeroSkeleton />}>
          <ExploreHeroSection />
        </Suspense>
      ) : null}

      <section aria-labelledby="todos-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="todos-heading" className="text-[17px] font-semibold tracking-tight text-ink-900">
            {filtering ? "Resultados" : "Todos los portafolios"}
          </h2>
          <span className="text-[12px] tabular-nums text-ink-500">{portfolios.length}</span>
        </div>
        <ExploreToolbar categories={pills} activeCategory={category} basePath={inApp ? "/app/explorar" : "/explore"} />

        {portfolios.length === 0 ? (
          <div className="app-card rounded-2xl px-6 py-12 text-center">
            <p className="text-[15px] font-medium text-ink-900">Sin resultados</p>
            <p className="mt-1 text-[13px] text-ink-500">Prueba con otra búsqueda o vuelve a “Todos”.</p>
          </div>
        ) : (
          <PortfolioGrid
            initial={first}
            isPro={isPro}
            query={{ categoria: category === "all" ? "" : category, q: search, simbolo: symbol }}
          />
        )}
      </section>

      {!filtering ? (
        <Suspense fallback={<RankingsSkeleton />}>
          <ExploreRankingsSection />
        </Suspense>
      ) : null}
    </div>
  );

  if (!chrome) return content;

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-app-canvas">
        <div className="container-page py-6 md:py-10">{content}</div>
      </main>
      <SiteFooter />
    </>
  );
}

