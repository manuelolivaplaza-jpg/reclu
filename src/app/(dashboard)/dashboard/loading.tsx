import { cn } from "@/lib/utils";

/** Barra de esqueleto: rectangular, sin radio. */
function Box({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-none bg-line", className)} />;
}

/**
 * Esqueleto del Resumen con la geometría real: encabezado, carrusel + Mi
 * portafolio, banda de KPIs, pulso y el par alertas / reglas.
 */
export default function Loading() {
  return (
    <div
      className="flex flex-col gap-4 sm:gap-6"
      role="status"
      aria-busy="true"
      aria-label="Cargando resumen"
    >
      <span className="sr-only">Cargando resumen</span>

      {/* Encabezado */}
      <div className="flex flex-col gap-4 border-b border-app-border pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <Box className="h-3 w-24" />
          <Box className="mt-2 h-9 w-40 sm:h-10 sm:w-44" />
          <Box className="mt-3 h-4 w-full max-w-md" />
        </div>
        <div className="flex gap-2">
          <Box className="h-9 w-24 rounded-full" />
          <Box className="h-9 w-28 rounded-full" />
        </div>
      </div>

      {/* Carrusel + Mi portafolio */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="app-panel flex flex-col p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <Box className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Box className="h-4 w-56 max-w-full" />
              <Box className="h-3 w-40 max-w-full" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-px border-y border-app-border bg-app-border">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-app-card px-1 py-2.5">
                <Box className="mx-auto h-2.5 w-6" />
                <Box className="mx-auto mt-1.5 h-3.5 w-10 max-w-full" />
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
            <Box className="h-[190px] sm:h-[250px]" />
            <div className="hidden flex-col gap-2 xl:flex">
              <Box className="h-3 w-28" />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <Box className="h-3.5 w-16" />
                  <Box className="h-3 w-10" />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-app-border pt-3">
            <Box className="h-3 w-28" />
            <Box className="h-3 w-20" />
          </div>
        </div>

        <div className="app-panel flex min-h-[200px] flex-col p-5">
          <Box className="h-3 w-28" />
          <Box className="mt-4 h-8 w-36" />
          <Box className="mt-2 h-3 w-32" />
          <div className="mt-auto border-t border-app-border pt-3">
            <Box className="h-10 w-36 rounded-full" />
          </div>
        </div>
      </div>

      {/* Banda de KPIs */}
      <div className="grid grid-cols-2 gap-px border border-app-border bg-app-border lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-app-card px-4 py-4 sm:px-5">
            <Box className="h-2.5 w-20" />
            <Box className="mt-3 h-7 w-24 max-w-full" />
            <Box className="mt-2 h-3 w-24 max-w-full" />
          </div>
        ))}
      </div>

      {/* Pulso y consenso */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="app-panel flex flex-col p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3 border-b border-app-border pb-4">
            <div>
              <Box className="h-2.5 w-28" />
              <Box className="mt-2 h-5 w-24" />
            </div>
            <Box className="h-3 w-40 max-w-[45%]" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-app-border py-3.5 last:border-b-0">
              <Box className="h-3 w-5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Box className="h-3.5 w-48 max-w-full" />
                <Box className="h-0.5 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="app-panel flex flex-col p-4 sm:p-5">
          <Box className="h-2.5 w-24" />
          <Box className="mt-2 h-5 w-32" />
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-t border-app-border pt-3">
                <Box className="h-3.5 w-32 max-w-full" />
                <Box className="h-4 w-12 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas + reglas */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="app-panel flex flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-app-border px-4 py-3.5 sm:px-5">
            <Box className="h-4 w-32" />
            <Box className="h-3 w-16" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-b border-app-border px-4 py-3 last:border-b-0 sm:px-5">
              <div className="flex items-center gap-2">
                <Box className="h-4 w-16 shrink-0 rounded-full" />
                <Box className="h-3 w-32 max-w-[40%]" />
                <Box className="ml-auto h-3 w-10 shrink-0" />
              </div>
              <Box className="mt-2 h-3.5 w-11/12" />
            </div>
          ))}
        </div>
        <div className="app-panel flex flex-col">
          <div className="border-b border-app-border px-5 py-4">
            <Box className="h-2.5 w-28" />
            <Box className="mt-2 h-5 w-36" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 border-b border-app-border px-5 py-3 last:border-b-0">
              <Box className="mt-0.5 h-2.5 w-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Box className="h-3.5 w-28 max-w-full" />
                <Box className="h-3 w-full" />
              </div>
            </div>
          ))}
          <div className="mt-auto border-t border-app-border px-5 py-3">
            <Box className="h-3 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
