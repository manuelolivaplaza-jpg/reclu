import { connection } from "next/server";
import { timed } from "@/lib/timing";
import { getAlertCountsForRanking, getHoldingSymbolsAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { isPaidPlan } from "@/lib/types";
import { getBeatTheMarketRanking } from "@/lib/performance-queries";
import { ExploreRankingsCards } from "@/components/explore/explore-rankings-cards";
import { consensusFromRows } from "@/lib/explore-paging";

/** getAlerts recorta por defecto a 20. El ranking cuenta publicadas, no solo las últimas. */

/**
 * Rankings de /explore. Va dentro de un Suspense: la grilla no espera
 * a estos datos. El consenso sale de UNA consulta de símbolos (antes
 * era una consulta de holdings por cada portafolio).
 */
export async function ExploreRankingsSection() {
  // D42: alertas y ranking dependen del plan (cookies). Marcarla dinamica
  // evita que el prerender lance fetch() que luego se aborta
  // ("During prerendering, fetch() rejects when the prerender is complete").
  await connection();
  const [catalog, profile] = await Promise.all([timed("rankings.catalog", getPortfolios()), getProfile()]);
  const paid = isPaidPlan(profile?.plan);
  const [alertCounts, beatMarket, rows] = await Promise.all([
    timed("rankings.alertCounts", getAlertCountsForRanking(paid)),
    timed("rankings.beatMarket", getBeatTheMarketRanking(7, "excess")),
    timed("rankings.holdingSymbols", getHoldingSymbolsAdmin(catalog.map((portfolio) => portfolio.id))),
  ]);
  const consensus = consensusFromRows(rows);
  return (
    <ExploreRankingsCards portfolios={catalog} alertCounts={alertCounts} consensus={consensus} beatMarket={beatMarket ?? []} />
  );
}
