import { SkeletonRoot, SkPortfolioDetail } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <div className="container-page py-8 sm:py-12">
      <SkeletonRoot label="Cargando portafolio">
        <SkPortfolioDetail />
      </SkeletonRoot>
    </div>
  );
}
