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
      <main id="main" className="flex-1 bg-white dark:bg-ink-950">
        <div className="container-page pb-16 pt-8 md:pb-24 md:pt-12">
          <header className="max-w-3xl">
            <p className="label-line">Catálogo público</p>
            <h1 className="type-section mt-3 text-ink-900 dark:text-white">Explorar portafolios</h1>
            <p className="type-body mt-5 max-w-2xl">
              Carteras públicas de políticos de EE.UU., corredoras chilenas,
              fondos 13F y temáticas, ordenadas por seguidores. Solo series
              reales: si un portafolio todavía no tiene historial, la tarjeta lo
              dice y no muestra una cifra.
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

/**
 * El esqueleto usa los componentes compartidos (`ExploreHeroSkeleton` y
 * `GridSkeleton`), que ya replican la retícula y el modo oscuro: no se
 * sobreescriben sus clases internas.
 */
function ExploreBodySkeleton() {
  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <p role="status" className="sr-only">
        Cargando portafolios…
      </p>

      <ExploreHeroSkeleton />

      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ink-300 pb-4 dark:border-white/12">
          <div className="space-y-2">
            <div className="h-3.5 w-24 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
            <div className="h-7 w-56 max-w-[70vw] animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
          </div>
          <div className="h-3.5 w-16 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
        </div>

        <div className="flex flex-col gap-3">
          <div className="h-11 w-full animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-1.5 overflow-hidden">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="h-10 w-20 shrink-0 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5"
                />
              ))}
            </div>
            <div className="hidden h-3.5 w-28 shrink-0 animate-pulse bg-ink-100 motion-reduce:animate-none sm:block dark:bg-white/5" />
          </div>
        </div>

        <div>
          <GridSkeleton />
        </div>
      </div>
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
