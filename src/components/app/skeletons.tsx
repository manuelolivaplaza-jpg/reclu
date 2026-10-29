export function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-app bg-ink-100 ${className}`} />;
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
        <div key={i} className="rounded-app border border-ink-100 bg-white p-4">
          <div className="flex items-center gap-3">
            <Sk className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Sk className="h-4 w-2/3" />
              <Sk className="h-3 w-1/3" />
            </div>
          </div>
          <Sk className="mt-4 h-16" />
          <div className="mt-3 flex gap-2">
            <Sk className="h-6 w-16 rounded-full" />
            <Sk className="h-6 w-16 rounded-full" />
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
        <div key={i} className="rounded-app border border-ink-100 bg-white p-4">
          <Sk className="h-3 w-1/2" />
          <Sk className="mt-3 h-6 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function SkRows({ n = 6 }: { n?: number }) {
  return (
    <div className="flex flex-col divide-y divide-ink-100 rounded-app border border-ink-100 bg-white">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
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
          <Sk className="size-14 rounded-2xl" />
          <div className="flex flex-col gap-2">
            <Sk className="h-6 w-48" />
            <Sk className="h-3 w-32" />
          </div>
        </div>
        <Sk className="h-11 w-full sm:w-40 rounded-full" />
      </div>
      <SkStats />
      <Sk className="h-64 sm:h-80" />
      <SkRows n={8} />
    </>
  );
}
