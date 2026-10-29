import { ExploreView, type ExploreSearchParams } from "@/components/explore/explore-view";

export const metadata = {
  title: "Portafolios",
  description: "Explora todos los portafolios disponibles en reclu.cl",
};
// Lee searchParams + cookies de auth por request: nunca se prerenderiza.
export const instant = false;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<ExploreSearchParams> }) {
  return <ExploreView params={await searchParams} />;
}
