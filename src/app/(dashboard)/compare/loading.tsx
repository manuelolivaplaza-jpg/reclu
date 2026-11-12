import { SkeletonRoot, Sk as SkBase } from "@/components/app/skeletons";

/** Barra de carga en el gris de filete: visible sobre blanco sin ser un bloque. */
function Sk({ className = "" }: { className?: string }) {
  return <SkBase className={`bg-line ${className}`} />;
}

/** Esqueleto de Comparar: encabezado, panel de cartera y panel de alineación. */
export default function Loading() {
  return (
    <SkeletonRoot label="Cargando comparación">
      {/* Encabezado de página */}
      <div className="border-b border-app-border pb-5">
        <Sk className="h-3 w-40" />
        <Sk className="mt-3 h-7 w-32 sm:h-8 sm:w-36" />
        <Sk className="mt-3 h-4 w-full max-w-xl" />
        <Sk className="mt-2 h-4 w-2/3 max-w-sm" />
      </div>

      {/* Paso 1: tu cartera */}
      <div className="app-panel p-5 sm:p-6">
        <div className="border-b border-app-border pb-4">
          <Sk className="h-3 w-16" />
          <Sk className="mt-2 h-5 w-56 max-w-full" />
          <Sk className="mt-2 h-3.5 w-full max-w-lg" />
        </div>

        <div className="mt-6">
          <Sk className="h-6 w-32" />
          <Sk className="mt-2 h-4 w-full max-w-sm" />
          <div className="mt-5 flex gap-6 border-b border-app-border pb-3">
            <Sk className="h-4 w-40 max-w-[45%]" />
            <Sk className="h-4 w-36 max-w-[40%]" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[0, 1].map((card) => (
              <div key={card} className="border border-app-border p-4">
                <Sk className="h-4 w-28" />
                <Sk className="mt-2 h-3 w-full" />
                <Sk className="mt-2 h-3 w-4/5" />
                <Sk className="mt-4 h-9 w-32 rounded-full" />
              </div>
            ))}
          </div>
          <div className="mt-4 border border-app-border">
            <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
              <Sk className="h-4 w-24" />
              <Sk className="h-3 w-20" />
            </div>
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-t border-app-border px-4 py-3 first:border-t-0"
              >
                <Sk className="h-3.5 w-16" />
                <Sk className="h-3.5 flex-1" />
                <Sk className="h-3.5 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Paso 2: alineación */}
      <div className="app-panel p-5 sm:p-6">
        <div className="border-b border-app-border pb-4">
          <Sk className="h-3 w-16" />
          <Sk className="mt-2 h-5 w-64 max-w-full" />
          <Sk className="mt-2 h-3.5 w-full max-w-lg" />
        </div>
        <div className="mt-6 border border-app-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Sk className="h-4 w-48 max-w-full" />
              <Sk className="mt-3 h-10 w-56 max-w-full" />
              <Sk className="mt-3 h-3 w-44 max-w-full" />
            </div>
            <Sk className="h-10 w-24" />
          </div>
        </div>
      </div>
    </SkeletonRoot>
  );
}
