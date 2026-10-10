import { connection } from "next/server";
import { getUserHoldings } from "@/lib/queries";
import { PortfolioManager } from "@/components/portfolio-manager";

export const metadata = { title: "Mi cartera" };
// Auth-gated route — never prerendered.
export const instant = false;

export default async function ComparePage() {
  await connection();
  const holdings = await getUserHoldings();

  return <PortfolioManager initialHoldings={holdings.map((h) => ({ symbol: h.symbol, name: h.name, weight: h.weight }))} />;
}
