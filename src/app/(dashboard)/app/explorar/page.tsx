import { ExploreView, type ExploreSearchParams } from "@/components/explore/explore-view";

export const metadata = { title: "Explorar", robots: { index: false } };
export const instant = false;

export default async function AppExplorePage({ searchParams }: { searchParams: Promise<ExploreSearchParams> }) {
  return <ExploreView params={await searchParams} inApp />;
}