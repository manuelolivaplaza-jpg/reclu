import { GridSkeleton } from "@/components/explore/skeletons";

export default function Loading() {
  return (
    <div className="container-page py-16 md:py-20" aria-busy="true">
      <div className="h-12 w-64 animate-pulse rounded-2xl bg-neutral-100 motion-reduce:animate-none" />
      <GridSkeleton />
    </div>
  );
}
