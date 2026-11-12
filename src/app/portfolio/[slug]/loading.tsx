import { SiteHeader } from "@/components/site-header";
import { SkeletonRoot, Sk } from "@/components/app/skeletons";

/**
 * Carga de la ficha: el mismo esqueleto que la página real (volver, hero,
 * resumen con retorno a la derecha, posiciones y alertas). Solo bloques
 * neutros: ningún nombre, cifra ni dato inventado.
 */
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="container-page">
          <SkeletonRoot label="Cargando portafolio">
            <div className="pt-5">
              <Sk className="h-3 w-32" />
            </div>

            <div className="border-b border-line pb-8 pt-6 sm:pt-10">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
                <div className="flex flex-col gap-4">
                  <Sk className="size-24" />
                  <Sk className="h-9 w-3/4" />
                  <Sk className="h-4 w-full max-w-sm" />
                  <Sk className="h-12 w-48 rounded-full" />
                </div>
                <div className="flex flex-col gap-3">
                  <Sk className="h-10 w-40" />
                  <Sk className="h-3 w-56" />
                  <Sk className="mt-2 h-48 w-full sm:h-56" />
                  <div className="grid grid-cols-3 gap-3">
                    <Sk className="h-16" />
                    <Sk className="h-16" />
                    <Sk className="h-16" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
              <div className="max-w-2xl space-y-3">
                <Sk className="h-3 w-40" />
                <Sk className="h-4 w-full" />
                <Sk className="h-4 w-5/6" />
                <Sk className="h-3 w-52" />
              </div>
              <div className="space-y-3 border-b border-line pb-6 lg:border-b-0 lg:border-l lg:pb-0 lg:pl-8">
                <Sk className="h-3 w-24" />
                <Sk className="h-9 w-32" />
              </div>
            </div>

            <div className="grid gap-10 pb-12 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
              <div className="app-panel p-5 sm:p-7">
                <Sk className="h-4 w-40" />
                <Sk className="mt-2 h-3 w-56" />
                <div className="mt-5 space-y-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-6 border-b border-line pb-3"
                    >
                      <Sk className="h-4 w-1/2" />
                      <Sk className="h-4 w-14" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="app-panel p-5 sm:p-7">
                <Sk className="h-4 w-32" />
                <div className="mt-5 space-y-5">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="space-y-2 border-l-2 border-line pl-4">
                      <Sk className="h-3 w-24" />
                      <Sk className="h-4 w-4/5" />
                      <Sk className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SkeletonRoot>
        </div>
      </main>
    </>
  );
}
