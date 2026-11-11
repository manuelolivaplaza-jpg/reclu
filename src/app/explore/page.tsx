import { Suspense } from "react";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl } from "@/lib/site";
import { getPortfolios } from "@/lib/queries";
import { itemListSchema, withSeo } from "@/lib/seo";
import { INITIAL_CARDS } from "@/lib/explore-cards";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ExploreView, type ExploreSearchParams } from "@/components/explore/explore-view";
import { ExploreHeroSkeleton } from "@/components/explore/explore-hero-section";
import { GridSkeleton } from "@/components/explore/skeletons";

export const metadata = withSeo("/explore", {
  title: "Portafolios",
  description: "Explora todos los portafolios disponibles en fraccion.si",
});

/**
 * d65: shell estático prerenderizado (header, título, esqueletos, footer).
 * Lo que depende de searchParams y de la sesión (plan, seguidos) llega por
 * streaming dentro del Suspense.
 */
export default function ExplorePage({ searchParams }: { searchParams: Promise<ExploreSearchParams> }) {
  return (
    <>
      <ExploreJsonLd />
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-16 pt-8 md:pb-24 md:pt-12">
          <header className="max-w-3xl">
            <p className="label-line">Catálogo público</p>
            <h1 className="type-section mt-3 text-ink-900 dark:text-white">Explorar portafolios</h1>
            <p className="type-body mt-5 max-w-2xl">
              Carteras públicas —políticos de EE.UU., corredoras chilenas, fondos 13F y
              temáticas— ordenadas por seguidores. Solo series reales: si un portafolio
              todavía no tiene historial, la tarjeta lo dice y no muestra una cifra.
            </p>
          </header>
          <div className="mt-8 border-t border-ink-300 pt-8 md:mt-10 md:pt-10 dark:border-white/12">
            <Suspense fallback={<ExploreBodySkeleton />}>
              <ExploreBody searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function ExploreBody({ searchParams }: { searchParams: Promise<ExploreSearchParams> }) {
  const params = await searchParams;
  return <ExploreView params={params} chrome={false} />;
}

function ExploreBodySkeleton() {
  return (
    <div className="flex flex-col gap-10 sm:gap-12" aria-busy="true">
      <ExploreHeroSkeleton />
      <GridSkeleton />
    </div>
  );
}

/**
 * d65: el ItemList solo lista los portafolios que van en el HTML inicial
 * (antes iban los ~120, duplicados en el HTML y en el payload RSC).
 * Lectura pública cacheada, sin cookies: entra en el shell estático.
 */
async function ExploreJsonLd() {
  const portfolios = await getPortfolios().catch(() => []);
  return (
    <JsonLd
      data={itemListSchema(
        "Portafolios en fraccion.si",
        portfolios.slice(0, INITIAL_CARDS).map((p) => ({ name: p.name, url: absoluteUrl(`/portfolio/${canonicalPortfolioSlug(p.slug)}`) })),
      )}
    />
  );
}
