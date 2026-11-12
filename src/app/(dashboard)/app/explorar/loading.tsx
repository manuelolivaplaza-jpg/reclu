import { SkeletonRoot, Sk as SkBase } from "@/components/app/skeletons";

/** Barra de carga en el gris de filete. */
function Sk({ className = "" }: { className?: string }) {
  return <SkBase className={`bg-line ${className}`} />;
}

/** Esqueleto de Explorar (app): encabezado, panel destacado, filtros y grilla. */
export default function Loading() {
  return (
    <SkeletonRoot label="Cargando portafolios">
      {/* Encabezado de página */}
      <div className="border-b border-app-border pb-5">
        <Sk className="h-7 w-32 sm:h-8" />
        <Sk className="mt-3 h-4 w-full max-w-md" />
        <Sk className="mt-2 h-4 w-3/4 max-w-sm" />
      </div>

      {/* Panel destacado */}
      <div className="border border-app-border bg-app-card p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Sk className="h-5 w-40" />
          <Sk className="h-8 w-20 rounded-full" />
        </div>
        <Sk className="mt-4 h-56 sm:h-72" />
      </div>

      {/* Título de sección + filtros */}
      <div className="flex flex-col gap-5">
        <div className="border-b border-app-border pb-4">
          <Sk className="h-3 w-16" />
          <Sk className="mt-2 h-6 w-56 max-w-full" />
        </div>
        <div className="flex items-stretch gap-2">
          <div className="h-11 min-w-0 flex-1 border border-app-border bg-app-card" />
          <Sk className="h-11 w-24 shrink-0 rounded-full" />
        </div>
        <div className="flex gap-1.5 overflow-hidden">
          {["w-16", "w-24", "w-20", "w-28", "w-24"].map((width) => (
            <Sk key={width} className={`h-8 shrink-0 rounded-full ${width}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <div key={card} className="app-panel p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Sk className="size-10 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Sk className="h-4 w-2/3" />
                  <Sk className="h-3 w-1/3" />
                </div>
              </div>
              <Sk className="mt-4 h-16" />
              <div className="mt-3 flex gap-2">
                <Sk className="h-6 w-16" />
                <Sk className="h-6 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRoot>
  );
}
