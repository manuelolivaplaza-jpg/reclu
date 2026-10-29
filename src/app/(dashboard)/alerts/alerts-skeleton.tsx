export function AlertsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando alertas">
      <div className="h-11 w-full animate-pulse rounded-[10px] bg-ink-100 sm:max-w-md" />
      <div className="h-11 w-full animate-pulse rounded-[10px] bg-ink-100" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-ink-100" />
        ))}
      </div>
      <div className="overflow-hidden rounded-app border border-app-border bg-white">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 border-t border-app-border p-4 first:border-t-0">
            <div className="size-10 shrink-0 animate-pulse rounded-2xl bg-ink-100" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-ink-100" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-ink-100" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-ink-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
