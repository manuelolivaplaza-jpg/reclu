import { SkeletonRoot, Sk as SkBase } from "@/components/app/skeletons";

/** Barra de carga en el gris de filete: visible sobre blanco sin ser un bloque. */
function Sk({ className = "" }: { className?: string }) {
  return <SkBase className={`bg-line ${className}`} />;
}

/** Esqueleto de Seguimiento: encabezado, barra del plan y filas de carteras. */
export default function Loading() {
  return (
    <SkeletonRoot label="Cargando seguimiento">
      {/* Encabezado */}
      <div>
        <Sk className="h-3 w-28" />
        <Sk className="mt-2 h-7 w-44 sm:h-8" />
        <Sk className="mt-2 h-4 w-40" />
      </div>

      {/* Capacidad del plan */}
      <div className="grid gap-4 border-y border-app-border py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-10 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <Sk className="h-3.5 w-20" />
            <Sk className="h-3.5 w-32" />
          </div>
          <Sk className="mt-3 h-[3px] w-full" />
          <Sk className="mt-2 h-3 w-48 max-w-full" />
        </div>
        <div className="flex items-center gap-8 sm:justify-end">
          <div className="sm:border-l sm:border-app-border sm:pl-8">
            <Sk className="h-3 w-24" />
            <Sk className="mt-2 h-6 w-20" />
          </div>
          <div className="flex flex-col gap-2">
            <Sk className="h-3.5 w-32" />
            <Sk className="h-3 w-28" />
          </div>
        </div>
      </div>

      {/* Filas de portafolios seguidos */}
      <div className="flex flex-col">
        <div className="hidden items-center gap-3 pb-2 lg:flex">
          <Sk className="h-3 w-20" />
          <Sk className="ml-auto h-3 w-10" />
          <Sk className="h-3 w-8" />
          <Sk className="h-3 w-8" />
          <Sk className="h-3 w-8" />
          <Sk className="h-3 w-14" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="border-t border-app-border py-5 last:border-b">
            <div className="flex items-center gap-3">
              <Sk className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Sk className="h-4 w-56 max-w-full" />
                <Sk className="h-3 w-40 max-w-full" />
              </div>
              <Sk className="h-9 w-14 shrink-0" />
              <div className="hidden shrink-0 items-center gap-3 lg:flex">
                <Sk className="h-3.5 w-12" />
                <Sk className="h-3.5 w-12" />
                <Sk className="h-3.5 w-12" />
                <Sk className="h-5 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SkeletonRoot>
  );
}
