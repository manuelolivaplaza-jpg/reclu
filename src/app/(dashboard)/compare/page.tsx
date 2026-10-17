import { connection } from "next/server";
import { getUserHoldings, getPortfolios, getHoldings } from "@/lib/queries";
import { PortfolioManager, type CatalogPortfolio } from "@/components/portfolio-manager";

export const metadata = { title: "Mi cartera" };
// Auth-gated route — never prerendered.
export const instant = false;

export default async function ComparePage() {
  await connection();
  const [holdings, catalog] = await Promise.all([
    getUserHoldings(),
    getPortfolios(),
  ]);

  // Catálogo con holdings para el modo "Cruzar dos carteras".
  const withHoldings = await Promise.all(
    catalog.map(async (portfolio): Promise<CatalogPortfolio> => {
      const list = await getHoldings(portfolio.id);
      return {
        slug: portfolio.slug,
        name: portfolio.name,
        returnYtd: portfolio.return_ytd,
        holdings: list.map((h) => ({ symbol: h.symbol, weight: h.weight })),
      };
    }),
  );

  return (
    <PortfolioManager
      initialHoldings={holdings.map((h) => ({ symbol: h.symbol, name: h.name, weight: h.weight }))}
      catalog={withHoldings}
    />
  );
}
