import { SkeletonRoot, SkPortfolioDetail } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <SkeletonRoot label="Cargando portafolio">
        <SkPortfolioDetail />
      </SkeletonRoot>
    </div>
  );
}
