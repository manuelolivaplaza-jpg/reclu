export function RankingsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-12 grid gap-6 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-2xl bg-neutral-100 motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-2xl bg-neutral-100 motion-reduce:animate-none" />
      ))}
    </div>
  );
}
