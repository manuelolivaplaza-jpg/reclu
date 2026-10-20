import { connection } from "next/server";
import {
  getUserHoldings,
  getPortfolios,
  getAllHoldingsAdmin,
  getProfile,
} from "@/lib/queries";
import { canViewPremium, roleFor } from "@/lib/access";
import { buildComparePayload, type ComparePortfolioInput } from "@/lib/compare-overlap";
import { PortfolioManager } from "@/components/portfolio-manager";
import { AlignmentPanel } from "@/components/alignment-panel";

export const metadata = { title: "Mi cartera" };
// Auth-gated route — never prerendered.
export const instant = false;

export default async function ComparePage() {
  await connection();

  // El muro se aplica ANTES de serializar: premium fuera para no pagados y
  // recorte HOLDING_LIMITS del rol antes de calcular cualquier solape.
  const profile = await getProfile();
  const role = roleFor(profile);

  const [holdings, catalog] = await Promise.all([
    getUserHoldings(),
    getPortfolios(),
  ]);

  const allowedCatalog = catalog.filter(
    (portfolio) => !portfolio.premium || canViewPremium(role),
  );

  // Libro completo solo en el servidor; el cliente recibe el cruce agregado.
  const withHoldings = await Promise.all(
    allowedCatalog.map(async (portfolio): Promise<ComparePortfolioInput> => {
      const list = await getAllHoldingsAdmin(portfolio.id);
      return {
        slug: portfolio.slug,
        name: portfolio.name,
        returnYtd: portfolio.return_ytd,
        premium: portfolio.premium,
        holdings: list.map((h) => ({ symbol: h.symbol, weight: h.weight })),
      };
    }),
  );

  const userHoldings = holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    weight: h.weight,
  }));
  const compare = buildComparePayload({
    role,
    userHoldings,
    portfolios: withHoldings,
  });

  return (
    <div className="flex flex-col gap-6">
      <PortfolioManager
        initialHoldings={userHoldings}
        catalog={compare.portfolios}
        pairs={compare.pairs}
      />
      <AlignmentPanel catalog={compare.portfolios} />
    </div>
  );
}
