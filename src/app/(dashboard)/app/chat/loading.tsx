import { Sk as SkBase } from "@/components/app/skeletons";

/** Barra de carga en el gris de filete. */
function Sk({ className = "" }: { className?: string }) {
  return <SkBase className={`bg-line ${className}`} />;
}

/**
 * Esqueleto del chat con la altura y la estructura reales (historial a la
 * izquierda en escritorio, header, hilo y composer) para que al cargar no
 * haya salto de layout.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando chat"
      className="flex h-[calc(100dvh-var(--app-topbar-h)-var(--app-tabbar-h)-1.75rem)] min-h-0 overflow-hidden border border-app-border bg-app-card lg:h-[calc(100dvh-var(--app-topbar-h)-5.25rem)]"
    >
      <span className="sr-only">Cargando chat</span>

      {/* Historial (escritorio) */}
      <div aria-hidden="true" className="hidden w-64 shrink-0 border-r border-app-border bg-ink-50/40 p-3 md:block">
        <Sk className="h-10 w-full rounded-full" />
        <Sk className="mt-5 h-3 w-20" />
        <div className="mt-3 flex flex-col gap-1.5">
          {["w-full", "w-11/12", "w-10/12"].map((width) => (
            <Sk key={width} className={`h-8 ${width}`} />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header del chat */}
        <div aria-hidden="true" className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-app-border px-3 md:px-5">
          <Sk className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 space-y-1.5">
            <Sk className="h-3.5 w-28" />
            <Sk className="h-2.5 w-48 max-w-[60vw]" />
          </div>
        </div>

        {/* Hilo */}
        <div aria-hidden="true" className="min-h-0 flex-1 overflow-hidden px-4 py-6 md:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <div className="space-y-2">
              <Sk className="h-4 w-3/4" />
              <Sk className="h-4 w-2/3" />
              <Sk className="h-4 w-1/2" />
            </div>
            <Sk className="ml-auto h-10 w-2/3 max-w-sm rounded-none" />
            <div className="space-y-2">
              <Sk className="h-4 w-5/6" />
              <Sk className="h-4 w-4/5" />
              <Sk className="h-4 w-3/5" />
            </div>
          </div>
        </div>

        {/* Composer */}
        <div aria-hidden="true" className="shrink-0 border-t border-app-border px-3 py-3 md:px-5">
          <div className="mx-auto flex max-w-3xl items-center gap-2 border border-app-border p-1.5">
            <Sk className="size-10 shrink-0 rounded-full" />
            <Sk className="h-4 flex-1" />
            <Sk className="h-10 w-24 shrink-0 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
