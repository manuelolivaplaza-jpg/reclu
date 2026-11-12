/** Bloques de carga con la geometría exacta del contenido real (sin CLS). */

/** Esqueleto del bloque de rankings: filete + tira de tarjetas pequeñas. */
export function RankingsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-12">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink-300 pb-3 dark:border-white/12">
          <div className="h-5 w-40 animate-pulse rounded-none bg-ink-100 motion-reduce:animate-none dark:bg-white/10" />
          <div className="h-3 w-28 animate-pulse rounded-none bg-ink-50 motion-reduce:animate-none dark:bg-white/5" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="h-[104px] animate-pulse rounded-none border border-ink-300 bg-ink-50 motion-reduce:animate-none dark:border-white/12 dark:bg-white/5"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Esqueleto de la grilla de Explorar. Repite la grilla real (1 / 2 / 3 / 4
 * columnas) y el alto de la tarjeta: cabecera de 40px, cifra de 24px,
 * sparkline de 56px y pie con filete. Así el contenido no salta al llegar.
 */
export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 2xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex h-full flex-col rounded-none border border-ink-300 bg-white p-4 dark:border-white/12 dark:bg-ink-950"
        >
          <div className="flex items-center gap-3">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-ink-100 motion-reduce:animate-none dark:bg-white/10" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-3/4 animate-pulse rounded-none bg-ink-100 motion-reduce:animate-none dark:bg-white/10" />
              <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded-none bg-ink-50 motion-reduce:animate-none dark:bg-white/5" />
            </div>
          </div>
          <div className="mt-4 h-6 w-24 animate-pulse rounded-none bg-ink-100 motion-reduce:animate-none dark:bg-white/10" />
          <div className="mt-2 h-14 w-full animate-pulse rounded-none bg-ink-50 motion-reduce:animate-none dark:bg-white/5" />
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-200 pt-4 dark:border-white/10">
            <div className="h-3 w-20 animate-pulse rounded-none bg-ink-50 motion-reduce:animate-none dark:bg-white/5" />
            <div className="h-9 w-[88px] animate-pulse rounded-full bg-ink-100 motion-reduce:animate-none dark:bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
