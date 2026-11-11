import { getExploreCardStats, getFollows, getHoldingSymbolsAdmin, getPortfolioIdsWithSeriesAdmin, getPortfolios, pickCardStats } from "@/lib/queries";
import { isLegacyPortfolioSlug } from "@/lib/portfolio-canonical";
import { portfolioIdsWithSymbol } from "@/lib/explore-paging";
import { timed } from "@/lib/timing";
import type { Portfolio } from "@/lib/types";
import { slimCardStats, toExploreCardPortfolio, type ExploreCardPortfolio, type SlimCardStat } from "@/lib/explore-slim";

/** d62 (P2): tarjetas que van en el HTML; el resto se pide a /api/explore/cards. */
export const INITIAL_CARDS = 12;
export const MORE_CARDS = 18;

export interface ExploreCardQuery {
  category: string;
  search: string;
  symbol: string;
}

export interface ExploreCardsPage {
  items: ExploreCardPortfolio[];
  stats: Record<string, SlimCardStat>;
  noSeriesIds: string[];
  followedIds: string[];
  total: number;
}

/** Lista filtrada completa (solo servidor; nunca viaja entera al cliente). */
export async function listExplorePortfolios({ category, search, symbol }: ExploreCardQuery): Promise<Portfolio[]> {
  const listed = (await timed("explore.getPortfolios", getPortfolios({ category, search }))).filter(
    // Los slugs viejos redirigen 301 al canónico: no se listan dos veces.
    (portfolio) => !isLegacyPortfolioSlug(portfolio.slug),
  );
  if (!symbol) return listed;
  const rows = await getHoldingSymbolsAdmin(listed.map((p) => p.id));
  const ids = portfolioIdsWithSymbol(rows, symbol);
  return listed.filter((p) => ids.has(p.id));
}

/** Una página de tarjetas ya recortada a los campos que se dibujan. */
export async function exploreCardsPage(
  all: readonly Portfolio[],
  offset: number,
  limit: number,
  followedIds?: readonly string[],
): Promise<ExploreCardsPage> {
  const visible = all.filter((portfolio) => !isLegacyPortfolioSlug(portfolio.slug));
  const slice = visible.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit));
  const [withSeries, allStats, follows] = await Promise.all([
    timed("explore.idsWithSeries", getPortfolioIdsWithSeriesAdmin()),
    timed("explore.cardStats", getExploreCardStats()),
    followedIds ? Promise.resolve(null) : getFollows(),
  ]);
  const withData = withSeries ? slice.filter((p) => withSeries.has(p.id)) : slice;
  const ids = new Set(slice.map((p) => p.id));
  const followed = followedIds ?? (follows ?? []).map((f) => f.portfolio_id);
  return {
    items: slice.map(toExploreCardPortfolio),
    stats: slimCardStats(withData.map((p) => p.id), pickCardStats(withData, allStats)),
    noSeriesIds: withSeries ? slice.filter((p) => !withSeries.has(p.id)).map((p) => p.id) : [],
    followedIds: followed.filter((id) => ids.has(id)),
    total: visible.length,
  };
}