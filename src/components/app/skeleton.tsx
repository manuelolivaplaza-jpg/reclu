import { cn } from "@/lib/utils";

/** Barra de carga rectangular (sin radio: el radio es solo para avatares y píldoras). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-none bg-ink-100", className)} />;
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-none border border-ink-200 bg-white p-4 sm:p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-ink-200 rounded-none border border-ink-200 bg-white">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-12 items-center gap-3 px-3 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de pantalla completa (loading.tsx del dashboard). */
export function SkeletonPage() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-busy="true" aria-label="Cargando">
      <span className="sr-only">Cargando</span>
      <Skeleton className="h-8 w-48" />
      <SkeletonStatGrid />
      <SkeletonList />
    </div>
  );
}
