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
 *
 * D10: este componente no pinta el <h1>. En /explore el titular editorial
 * (label-line + type-section) vive en el shell estático de `explore/page.tsx`,
 * así que hay exactamente un <h1> visible y ninguno duplicado.
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
  // filtros discretos; todo lo demás en tarjetas. Sin título gigante: el h1
  // vive en el shell estático de `src/app/explore/page.tsx` (uno solo).
  const content = (
    <div className="flex flex-col gap-10 sm:gap-12">
      {!filtering ? (
        <Suspense fallback={<ExploreHeroSkeleton />}>
          <ExploreHeroSection />
        </Suspense>
      ) : null}

      <section aria-labelledby="todos-heading" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ink-300 pb-4 dark:border-white/12">
          <div className="min-w-0">
            <p className="label-line">{filtering ? "Filtros activos" : "Catálogo"}</p>
            <h2
              id="todos-heading"
              className="mt-2 text-[clamp(1.375rem,2.4vw,1.875rem)] font-medium leading-[1.1] tracking-[-0.03em] text-ink-900 dark:text-white"
            >
              {filtering ? "Resultados" : "Todos los portafolios"}
            </h2>
          </div>
          {portfolios.length > 0 ? (
            <p className="num shrink-0 text-[13px] text-ink-500 dark:text-white/55">
              {portfolios.length} {portfolios.length === 1 ? "portafolio" : "portafolios"}
            </p>
          ) : null}
        </div>
        <ExploreToolbar categories={pills} activeCategory={category} basePath={inApp ? "/app/explorar" : "/explore"} />

        {portfolios.length === 0 ? (
          <div className="border border-ink-300 px-6 py-14 text-center dark:border-white/12">
            <p className="text-[15px] font-medium text-ink-900 dark:text-white">Sin resultados</p>
            <p className="type-body mx-auto mt-2 max-w-sm">Prueba con otra búsqueda o vuelve a “Todos”.</p>
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
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page py-8 md:py-12">{content}</div>
      </main>
      <SiteFooter />
    </>
  );
}

