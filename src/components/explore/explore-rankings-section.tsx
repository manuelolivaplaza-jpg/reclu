import { getAlerts, getHoldingSymbolsAdmin, getPortfolios, getPerformanceSeriesAdmin } from "@/lib/queries";
import { cardStatsById } from "@/lib/card-series";
import { getBeatTheMarketRanking } from "@/lib/performance-queries";
import { ExploreRankings } from "@/components/explore-rankings";
import { consensusFromRows } from "@/lib/explore-paging";

/** getAlerts recorta por defecto a 20. El ranking cuenta publicadas, no solo las últimas. */
const ALERT_RANKING_LIMIT = 1000;

/**
 * Rankings de /explore. Va dentro de un Suspense: la grilla no espera
 * a estos datos. El consenso sale de UNA consulta de símbolos (antes
 * era una consulta de holdings por cada portafolio).
 */
export async function ExploreRankingsSection() {
  const catalog = await getPortfolios();
  const [alerts, beatMarket, rows, seriesById] = await Promise.all([
    getAlerts(undefined, ALERT_RANKING_LIMIT),
    getBeatTheMarketRanking(7, "excess"),
    getHoldingSymbolsAdmin(catalog.map((portfolio) => portfolio.id)),
    getPerformanceSeriesAdmin(catalog.map((portfolio) => portfolio.id)),
  ]);
  const cardStats = cardStatsById(catalog, seriesById);
  const consensus = consensusFromRows(rows);
  return (
    <ExploreRankings portfolios={catalog} alerts={alerts} consensus={consensus} beatMarket={beatMarket} cardStats={cardStats} />
  );
}
