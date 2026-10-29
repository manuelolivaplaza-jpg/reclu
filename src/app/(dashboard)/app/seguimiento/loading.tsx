import { SkeletonRoot, Sk, SkStats, SkRows } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <SkeletonRoot label="Cargando seguimiento">
      <Sk className="h-7 w-44" />
      <SkStats />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Sk className="h-64 sm:h-80 lg:col-span-2" />
        <SkRows n={5} />
      </div>
      <SkRows n={6} />
    </SkeletonRoot>
  );
}
