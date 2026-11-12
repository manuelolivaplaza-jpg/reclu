import { cn } from "@/lib/utils";

/** Barra de carga rectangular (sin radio: el radio es solo para avatares y píldoras). */
export function Sk({ className = "" }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-none bg-ink-100", className)} />;
}

export function SkeletonRoot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkCardGrid({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="app-panel p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Sk className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Sk className="h-4 w-2/3" />
              <Sk className="h-3 w-1/3" />
            </div>
          </div>
          <Sk className="mt-4 h-16" />
          <div className="mt-3 flex gap-2">
            <Sk className="h-6 w-16" />
            <Sk className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkStats({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="app-panel p-4 sm:p-5">
          <Sk className="h-3 w-1/2" />
          <Sk className="mt-3 h-6 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function SkRows({ n = 6 }: { n?: number }) {
  return (
    <div className="flex flex-col divide-y divide-line rounded-none border border-line bg-app-card">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex min-h-12 items-center gap-3 px-3 py-3">
          <Sk className="size-8 rounded-full" />
          <Sk className="h-4 flex-1" />
          <Sk className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkPortfolioDetail() {
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Sk className="size-14" />
          <div className="flex flex-col gap-2">
            <Sk className="h-6 w-48" />
            <Sk className="h-3 w-32" />
          </div>
        </div>
        <Sk className="h-11 w-full rounded-full sm:w-40" />
      </div>
      <SkStats />
      <div className="app-panel p-4 sm:p-5">
        <Sk className="h-3 w-28" />
        <Sk className="mt-4 h-48 sm:h-64" />
      </div>
      <SkRows n={8} />
    </>
  );
}
