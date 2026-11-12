/**
 * Carga genérica del panel: encabezado + bloques con filete. Las rutas con
 * geometría propia (Resumen, Alertas, Comparar, Seguimiento, Explorar, Chat)
 * traen su propio loading.tsx; esto cubre Mi portafolio, Ajustes y Suscripción.
 */
export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando"
      className="flex flex-col gap-6"
    >
      <span className="sr-only">Cargando</span>
      <div aria-hidden="true">
        <div className="h-3 w-28 animate-pulse bg-line" />
        <div className="mt-2 h-7 w-48 animate-pulse bg-line sm:h-8" />
        <div className="mt-3 h-4 w-full max-w-md animate-pulse bg-line" />
      </div>
      <div aria-hidden="true" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div className="app-panel h-64 p-5">
          <div className="h-4 w-40 animate-pulse bg-line" />
          <div className="mt-4 h-3 w-full animate-pulse bg-line" />
          <div className="mt-2 h-3 w-4/5 animate-pulse bg-line" />
          <div className="mt-6 h-10 w-full animate-pulse bg-line" />
          <div className="mt-3 h-10 w-full animate-pulse bg-line" />
        </div>
        <div className="app-panel h-40 p-5">
          <div className="h-4 w-32 animate-pulse bg-line" />
          <div className="mt-4 h-3 w-full animate-pulse bg-line" />
          <div className="mt-2 h-3 w-2/3 animate-pulse bg-line" />
        </div>
      </div>
    </div>
  );
}