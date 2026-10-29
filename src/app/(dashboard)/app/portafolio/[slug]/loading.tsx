import { SkeletonRoot, SkPortfolioDetail } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <SkeletonRoot label="Cargando portafolio">
      <SkPortfolioDetail />
    </SkeletonRoot>
  );
}
