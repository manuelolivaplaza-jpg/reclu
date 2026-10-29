import { JsonLd } from "@/components/json-ld";
import { absoluteUrl } from "@/lib/site";
import { getPortfolios } from "@/lib/queries";
import { itemListSchema, withSeo } from "@/lib/seo";
import { ExploreView, type ExploreSearchParams } from "@/components/explore/explore-view";

export const metadata = withSeo("/explore", {
  title: "Portafolios",
  description: "Explora todos los portafolios disponibles en reclu.cl",
});
// Lee searchParams + cookies de auth por request: nunca se prerenderiza.
export const instant = false;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<ExploreSearchParams> }) {
  const params = await searchParams;
  const portfolios = await getPortfolios().catch(() => []);
  return (
    <>
      <JsonLd
        data={itemListSchema(
          "Portafolios en reclu.cl",
          portfolios.map((p) => ({ name: p.name, url: absoluteUrl(`/portfolio/${p.slug}`) })),
        )}
      />
      <ExploreView params={params} />
    </>
  );
}
