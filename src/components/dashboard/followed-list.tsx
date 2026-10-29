import { AppLink as Link } from "@/components/app/app-link";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { Sparkline } from "@/components/sparkline";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META, type Portfolio } from "@/lib/types";
import type { CardStat } from "@/lib/card-series";
import { cn, formatCompact, formatSignedPct } from "@/lib/utils";

interface Props {
  portfolios: Portfolio[];
  stats: Record<string, CardStat | undefined>;
  following?: boolean;
  isPro: boolean;
}

/** Seguidos: filas tipo Robinhood en móvil, tarjetas en escritorio. Retorno solo de la serie real. */
export function FollowedList({ portfolios, stats, following = true, isPro }: Props) {
  return (
    <>
      {/* Móvil: lista */}
      <ul className="divide-y divide-app-border overflow-hidden rounded-app border border-app-border bg-white sm:hidden">
        {portfolios.map((p) => {
          const s = stats[p.id];
          const pct = s?.pct ?? null;
          return (
            <li key={p.id}>
              <Link href={`/portfolio/${p.slug}`} className="flex items-center gap-3 px-4 py-3 active:bg-ink-50">
                <PortfolioAvatar portfolio={p} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink-900">{p.name}</p>
                  <p className="truncate text-[12px] text-ink-500">{CATEGORY_META[p.category].label}</p>
                </div>
                {s && s.spark.length >= 2 && <Sparkline data={s.spark} className="h-8 w-16 shrink-0" />}
                <span
                  className={cn(
                    "num w-[72px] shrink-0 rounded-[8px] px-2 py-1 text-right text-[14px] font-semibold tabular-nums",
                    pct === null ? "text-ink-400" : pct >= 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
                  )}
                >
                  {pct === null ? "—" : formatSignedPct(pct)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Escritorio: tarjetas */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-3">
        {portfolios.map((p) => {
          const s = stats[p.id];
          const pct = s?.pct ?? null;
          return (
            <div
              key={p.id}
              className="group flex flex-col rounded-app border border-app-border bg-white p-5 shadow-app transition-shadow hover:shadow-[0_4px_16px_rgb(0_0_0/0.06)]"
            >
              <Link href={`/portfolio/${p.slug}`} className="flex items-center gap-3">
                <PortfolioAvatar portfolio={p} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink-900 group-hover:underline">{p.name}</p>
                  <p className="truncate text-[12px] text-ink-500">
                    {CATEGORY_META[p.category].label} · {p.country}
                  </p>
                </div>
              </Link>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p
                    className={cn(
                      "num text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums",
                      pct === null ? "text-ink-400" : pct >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {pct === null ? "—" : formatSignedPct(pct)}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-500">
                    {pct === null ? "Sin serie" : s?.label}
                    {s?.estimated ? " · estimado" : ""}
                  </p>
                </div>
                {s && s.spark.length >= 2 && <Sparkline data={s.spark} className="h-10 w-28" />}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-app-border pt-4">
                <span className="text-[12px] text-ink-500">{formatCompact(p.followers)} seguidores</span>
                <FollowButton
                  portfolioId={p.id}
                  initialFollowing={following}
                  initialIsPro={isPro}
                  portfolioPremium={p.premium}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
