import Link from "next/link";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { Sparkline } from "@/components/sparkline";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META, type Portfolio } from "@/lib/types";
import { cn, formatSignedPct } from "@/lib/utils";
import type { PeriodKey } from "./periods";

export interface SeguimientoItem {
  portfolio: Portfolio;
  spark: number[];
  changes: Record<PeriodKey, number | null>;
  total: number | null;
  totalLabel: string;
}

const tone = (v: number | null) => (v === null ? "text-ink-400" : v >= 0 ? "text-positive" : "text-negative");
const fmt = (v: number | null, d = 1) => (v === null ? "—" : formatSignedPct(v, d));

/** Lista en móvil, grilla en escritorio. Solo datos planos hacia los Client Components. */
export function SeguimientoList({ items, isPro }: { items: SeguimientoItem[]; isPro: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {items.map(({ portfolio: p, spark, changes, total, totalLabel }) => (
        <li key={p.id} className="app-card flex flex-col p-4">
          <div className="flex items-center gap-3">
            <PortfolioAvatar portfolio={p} size={40} />
            <Link href={`/app/portafolio/${p.slug}`} className="min-w-0 flex-1">
              <p className="truncate text-app-body font-semibold text-ink-900 hover:underline">{p.name}</p>
              <p className="truncate text-app-caption text-ink-500">{CATEGORY_META[p.category].label}</p>
            </Link>
            {spark.length >= 2 && <Sparkline data={spark} className="h-9 w-20 shrink-0" />}
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className={cn("text-[22px] leading-none font-semibold tabular-nums", tone(total))}>{fmt(total)}</p>
              <p className="mt-1 text-[11px] text-ink-500">{total === null ? "Sin serie real" : totalLabel}</p>
            </div>
            <dl className="flex gap-3 text-right">
              {(["1D", "1M", "YTD"] as PeriodKey[]).map((k) => (
                <div key={k}>
                  <dt className="text-[10px] tracking-wide text-ink-500 uppercase">{k === "1D" ? "Día" : k === "1M" ? "Mes" : "YTD"}</dt>
                  <dd className={cn("text-[13px] font-semibold tabular-nums", tone(changes[k]))}>{fmt(changes[k], 2)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-app-border pt-3">
            <Link href={`/app/portafolio/${p.slug}`} className="text-app-caption font-medium text-ink-900 hover:underline">
              Ver detalle
            </Link>
            <FollowButton portfolioId={p.id} initialFollowing initialIsPro={isPro} portfolioPremium={p.premium} />
          </div>
        </li>
      ))}
    </ul>
  );
}
