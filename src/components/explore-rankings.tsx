import Link from "next/link";
import type { Alert, Portfolio } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";

const ROW_LIMIT = 5;

interface RankingRow {
  id: string;
  slug: string;
  name: string;
  metric: string;
  tone?: "positive" | "negative";
}

/**
 * Tres rankings tipográficos del catálogo. El conteo de alertas se arma en
 * memoria agrupando por portfolio_id. return_ytd nulo no entra en Mejor retorno.
 */
export function ExploreRankings({
  portfolios,
  alerts,
}: {
  portfolios: Portfolio[];
  alerts: Alert[];
}) {
  const alertCount = new Map<string, number>();
  for (const alert of alerts) {
    alertCount.set(alert.portfolio_id, (alertCount.get(alert.portfolio_id) ?? 0) + 1);
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
    .filter((portfolio): portfolio is Portfolio & { return_ytd: number } => portfolio.return_ytd !== null)
    .toSorted((a, b) => b.return_ytd - a.return_ytd)
    .slice(0, ROW_LIMIT)
    .map((portfolio) => ({
      id: portfolio.id,
      slug: portfolio.slug,
      name: portfolio.name,
      metric: formatPercent(portfolio.return_ytd),
      tone: portfolio.return_ytd > 0 ? "positive" : portfolio.return_ytd < 0 ? "negative" : undefined,
    }));

  const mostAlerts: RankingRow[] = portfolios
    .map((portfolio) => ({
      portfolio,
      count: alertCount.get(portfolio.id) ?? 0,
    }))
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
      <h2 id="rankings-heading" className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[26px]">
        Lo más seguido
      </h2>
      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-10">
        <RankingTable title="Top seguidos" rows={topFollowed} />
        <RankingTable title="Mejor retorno" rows={bestReturn} />
        <RankingTable title="Más alertas" rows={mostAlerts} />
      </div>
    </section>
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
