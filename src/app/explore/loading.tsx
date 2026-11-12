import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ExploreHeroSkeleton } from "@/components/explore/explore-hero-section";
import { GridSkeleton } from "@/components/explore/skeletons";

/**
 * Esqueleto de la ruta /explore: repite el shell estático (header, titular
 * editorial, filete de 1px, panel de más seguidos y grilla) para que la
 * navegación no salte ni destelle en blanco sobre el modo oscuro.
 */
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1 bg-white dark:bg-ink-950">
        <div className="container-page pb-16 pt-8 md:pb-24 md:pt-12">
          <div aria-hidden="true" className="max-w-3xl">
            <div className="h-3.5 w-28 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
            <div className="mt-3 h-9 w-[min(22rem,90%)] animate-pulse bg-ink-100 motion-reduce:animate-none lg:h-14 dark:bg-white/5" />
            <div className="mt-5 space-y-2.5">
              <div className="h-4 w-full max-w-2xl animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
              <div className="h-4 w-2/3 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
            </div>
          </div>

          <p role="status" className="sr-only">
            Cargando portafolios…
          </p>

          <div className="mt-8 border-t border-ink-300 pt-8 md:mt-10 md:pt-10 dark:border-white/12">
            <div className="flex flex-col gap-10 sm:gap-12">
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
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
