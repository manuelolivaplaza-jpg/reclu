import Link from "next/link";
import type { Alert, Portfolio } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";
import type { BeatMarketRow } from "@/lib/performance-queries";
import { BeatMarketRanking } from "@/components/beat-market-ranking";
import type { CardStat } from "@/lib/card-series";

const ROW_LIMIT = 5;
const RADAR_LIMIT = 7;

interface RankingRow {
  id: string;
  slug: string;
  name: string;
  metric: string;
  tone?: "positive" | "negative";
}

/** Símbolo + nº de carteras del catálogo que lo incluyen. */
export interface ConsensusTicker {
  symbol: string;
  count: number;
}

/**
 * Tres rankings tipográficos del catálogo + Radar de Consenso.
 * El conteo de alertas se arma en memoria agrupando por portfolio_id.
 * D40: Mejor retorno sale de la serie real (cardStats), no del return_ytd
 * estático; sin serie o con tramo estimado no entra. Más alertas oculta 0.
 */
export function ExploreRankings({
  portfolios,
  alerts,
  consensus = [],
  beatMarket = [],
  cardStats = {},
  alertCounts,
}: {
  portfolios: Portfolio[];
  alerts: Alert[];
  consensus?: ConsensusTicker[];
  /** F5: ranking por exceso de retorno vs S&P 500 / IPSA (null si no hay datos). */
  beatMarket?: BeatMarketRow[];
  cardStats?: Record<string, CardStat>;
  /** D43: conteo ya agregado (cache remoto). Si viene, reemplaza a `alerts`. */
  alertCounts?: Record<string, number>;
}) {
  const alertCount = new Map<string, number>();
  if (alertCounts) {
    for (const [id, n] of Object.entries(alertCounts)) alertCount.set(id, n);
  } else {
    for (const alert of alerts) {
      alertCount.set(alert.portfolio_id, (alertCount.get(alert.portfolio_id) ?? 0) + 1);
    }
  }

  const topFollowed: RankingRow[] = portfolios
    .toSorted((a, b) => b.followers - a.followers)
    .slice(0, ROW_LIMIT)
    .map((portfolio) => ({
      id: portfolio.id,
      slug: portfolio.slug,
      name: portfolio.name,
      metric: portfolio.followers.toLocaleString("es-CL"),
    }));

  const bestReturn: RankingRow[] = portfolios
    .map((portfolio) => ({ portfolio, stat: cardStats[portfolio.id] }))
    .filter((row): row is { portfolio: Portfolio; stat: CardStat & { pct: number } } =>
      !!row.stat && row.stat.pct !== null && !row.stat.estimated,
    )
    .toSorted((a, b) => b.stat.pct - a.stat.pct)
    .slice(0, ROW_LIMIT)
    .map(({ portfolio, stat }) => ({
      id: portfolio.id,
      slug: portfolio.slug,
      name: portfolio.name,
      metric: formatPercent(stat.pct),
      tone: stat.pct > 0 ? "positive" : stat.pct < 0 ? "negative" : undefined,
    }));

  const mostAlerts: RankingRow[] = portfolios
    .map((portfolio) => ({
      portfolio,
      count: alertCount.get(portfolio.id) ?? 0,
    }))
    .filter(({ count }) => count > 0)
    .toSorted((a, b) => b.count - a.count)
    .slice(0, ROW_LIMIT)
    .map(({ portfolio, count }) => ({
      id: portfolio.id,
      slug: portfolio.slug,
      name: portfolio.name,
      metric: count.toLocaleString("es-CL"),
    }));

  return (
    <section className="mt-16" aria-labelledby="rankings-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="rankings-heading" className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[26px]">
          Lo más seguido
        </h2>
        <Link
          href="/ranking"
          className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-ink-900"
        >
          Ranking honesto: todas contra su benchmark →
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-10">
        <RankingTable title="Top seguidos" rows={topFollowed} />
        <RankingTable title="Mejor retorno" rows={bestReturn} />
        {mostAlerts.length > 0 ? <RankingTable title="Más alertas" rows={mostAlerts} /> : null}
      </div>

      {beatMarket.length > 0 && <BeatMarketRanking rows={beatMarket} />}

      {consensus.length > 0 && (
        <ConsensusRadar tickers={consensus.slice(0, RADAR_LIMIT)} />
      )}
    </section>
  );
}

/**
 * Radar de Consenso — tickers más repetidos entre las carteras del
 * catálogo (ballenas incluidas). Enlaces directos a /explore?simbolo=.
 */
function ConsensusRadar({ tickers }: { tickers: ConsensusTicker[] }) {
  return (
    <div className="mt-14 border-t border-ink-200 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="text-[15px] font-medium text-ink-900">
          Radar de Consenso — Tickers más repetidos
        </h3>
        <p className="text-[13px] text-ink-500">
          Compras simultáneas de múltiples carteras seguidas.
        </p>
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-px border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-7 lg:border-0 lg:bg-transparent">
        {tickers.map((t, i) => (
          <li key={t.symbol} className="bg-white lg:border lg:border-ink-200 lg:bg-white">
            <Link
              href={`/accion/${encodeURIComponent(t.symbol.toLowerCase())}`}
              className="group flex h-full flex-col justify-between gap-6 p-5 transition-colors hover:bg-ink-50"
            >
              <span className="num text-[11px] text-ink-400">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="num text-[24px] leading-none tracking-[-0.03em] text-ink-900 group-hover:underline">
                  {t.symbol}
                </p>
                <p className="mt-1.5 text-[13px] text-ink-500">
                  {t.count} cartera{t.count !== 1 ? "s" : ""}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankingTable({ title, rows }: { title: string; rows: RankingRow[] }) {
  return (
    <div>
      <h3 className="text-[15px] text-ink-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 border-t border-ink-200 py-3 text-[15px] text-ink-500">Sin datos.</p>
      ) : (
        <ul className="mt-4">
          {rows.map((row) => (
            <li key={row.id} className="border-t border-ink-200">
              <Link
                href={`/portfolio/${row.slug}`}
                className="group flex items-baseline justify-between gap-4 py-3"
              >
                <span className="min-w-0 text-[15px] text-ink-900 group-hover:underline">{row.name}</span>
                <span
                  className={cn(
                    "num shrink-0 text-[15px] text-ink-900",
                    row.tone === "positive" && "text-positive",
                    row.tone === "negative" && "text-negative",
                  )}
                >
                  {row.metric}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
