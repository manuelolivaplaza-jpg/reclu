import { cn } from "@/lib/utils";

/** Barra de carga en el gris de filete: visible sobre blanco. */
function Bar({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-none bg-line", className)} />;
}

/**
 * Esqueleto de la ficha dentro de la app: volver, hero con avatar y gráfico,
 * pestañas, resumen y tabla de posiciones. Sigue el orden real de la página
 * para que el contenido no salte al cargar.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando portafolio"
      className="flex flex-col gap-6"
    >
      <span className="sr-only">Cargando portafolio</span>

      <div aria-hidden="true" className="flex flex-col gap-6">
        {/* Volver a explorar */}
        <Bar className="h-3 w-32" />

        {/* Hero: nombre, retorno y gráfico */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          <div className="min-w-0">
            <Bar className="size-20 rounded-full sm:size-24" />
            <Bar className="mt-4 h-9 w-2/3 max-w-sm" />
            <Bar className="mt-3 h-3 w-40 max-w-full" />
            <Bar className="mt-5 h-4 w-full max-w-md" />
            <Bar className="mt-2 h-4 w-4/5 max-w-sm" />
            <Bar className="mt-6 h-11 w-40 rounded-full" />
          </div>
          <Bar className="h-[220px] w-full sm:h-[280px]" />
        </div>

        {/* Pestañas de sección */}
        <div className="flex gap-2 border-b border-app-border pb-3">
          <Bar className="h-4 w-20" />
          <Bar className="h-4 w-24" />
          <Bar className="h-4 w-16" />
        </div>

        {/* Resumen */}
        <div className="app-panel p-4 sm:p-5">
          <Bar className="h-3 w-24" />
          <Bar className="mt-3 h-4 w-full max-w-lg" />
          <Bar className="mt-2 h-4 w-3/4 max-w-md" />
          <Bar className="mt-4 h-8 w-32" />
        </div>

        {/* Posiciones */}
        <div className="app-panel">
          <div className="border-b border-app-border px-4 py-3.5 sm:px-5">
            <Bar className="h-4 w-28" />
          </div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-t border-app-border px-4 py-3.5 first:border-t-0 sm:px-5"
            >
              <Bar className="h-3.5 w-14 shrink-0" />
              <Bar className="h-3.5 flex-1" />
              <Bar className="h-3.5 w-12 shrink-0" />
              <Bar className="h-3.5 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
