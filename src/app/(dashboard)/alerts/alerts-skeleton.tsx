/**
 * Esqueleto del feed de alertas con la geometría real: control de vistas,
 * buscador, filtros de tipo y filas con avatar, título, resumen y acciones.
 * Todo rectangular (radio 0); el avatar conserva su círculo porque así se
 * pinta en el feed.
 */
export function AlertsSkeleton() {
  return (
    <div
      className="flex min-w-0 flex-col gap-5"
      role="status"
      aria-busy="true"
      aria-label="Cargando alertas"
    >
      <span className="sr-only">Cargando alertas</span>

      <div aria-hidden="true" className="flex flex-col gap-5">
        {/* Control de vistas: 3 segmentos, 44px de alto. */}
        <div className="h-11 w-full animate-pulse rounded-none bg-line sm:max-w-md" />

        <div className="flex flex-col gap-3">
          {/* Buscador: campo real de 44px con filete. */}
          <div className="h-11 w-full border border-app-border bg-app-card" />

          {/* Filtros por tipo. */}
          <div className="flex gap-2 overflow-hidden">
            {[72, 88, 76, 92, 100, 84].map((width) => (
              <div
                key={width}
                className="h-8 shrink-0 animate-pulse rounded-full bg-line"
                style={{ width }}
              />
            ))}
          </div>

          {/* Conteo de alertas. */}
          <div className="h-3 w-24 animate-pulse bg-line" />
        </div>

        {/* Grupo por día. */}
        <div className="flex flex-col gap-2">
          <div className="h-3.5 w-32 animate-pulse bg-line" />

          <div className="app-panel overflow-hidden">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex min-w-0 gap-3 border-t border-app-border p-4 first:border-t-0 sm:gap-4 sm:p-5"
              >
                <div className="size-10 shrink-0 animate-pulse rounded-full bg-line" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3.5 w-40 max-w-full animate-pulse bg-line" />
                      <div className="h-3 w-24 animate-pulse bg-line" />
                    </div>
                    <div className="h-4 w-16 shrink-0 animate-pulse bg-line" />
                  </div>
                  <div className="mt-3 h-4 w-11/12 animate-pulse bg-line" />
                  <div className="mt-3 h-10 w-full animate-pulse bg-line" />
                  <div className="mt-3 h-8 w-28 animate-pulse bg-line" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
