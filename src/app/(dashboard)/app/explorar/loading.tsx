import { SkeletonRoot, Sk, SkCardGrid } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <SkeletonRoot label="Cargando portafolios">
      <div className="rounded-app border border-ink-100 bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Sk className="h-5 w-40" />
          <Sk className="h-8 w-20 rounded-full" />
        </div>
        <Sk className="mt-4 h-56 sm:h-72" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Sk key={i} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <SkCardGrid n={6} />
    </SkeletonRoot>
  );
}
