import { SkeletonRoot, Sk } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <SkeletonRoot label="Cargando chat">
      <div className="flex min-h-[60vh] flex-col gap-4 rounded-app border border-ink-100 bg-white p-4 sm:p-6">
        <Sk className="h-6 w-48" />
        <div className="flex flex-1 flex-col gap-3">
          <Sk className="h-12 w-3/4 sm:w-1/2" />
          <Sk className="ml-auto h-10 w-2/3 sm:w-1/3" />
          <Sk className="h-20 w-5/6 sm:w-2/3" />
        </div>
        <Sk className="h-12 w-full rounded-full" />
      </div>
    </SkeletonRoot>
  );
}
