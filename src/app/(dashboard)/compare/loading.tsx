export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando comparación">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-40 animate-pulse rounded-[8px] bg-ink-100" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded bg-ink-100" />
      </div>
      <div className="h-56 animate-pulse rounded-app bg-ink-100 sm:h-72" />
      <div className="overflow-hidden rounded-app border border-app-border bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-t border-app-border p-4 first:border-t-0">
            <div className="size-10 shrink-0 animate-pulse rounded-2xl bg-ink-100" />
            <div className="h-4 flex-1 animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-14 animate-pulse rounded bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
