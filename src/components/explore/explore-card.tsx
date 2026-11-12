"use client";

import { AppLink as Link } from "@/components/app/app-link";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import { FollowButton } from "@/components/follow-button";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { CATEGORY_META } from "@/lib/types";
import type { ExploreCardPortfolio, SlimCardStat } from "@/lib/explore-slim";
import { cn, formatCompact, formatSignedPct } from "@/lib/utils";

/** Sparkline de área propia (SVG), verde o rojo según el retorno. */
function AreaSpark({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return <div className="h-14 rounded-lg bg-ink-50" />;
  const W = 240;
  const H = 56;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 3 - ((v - min) / r) * (H - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const color = up ? "var(--color-positive, #16a34a)" : "var(--color-negative, #dc2626)";
  const id = `s${Math.round(data[data.length - 1] * 100)}_${data.length}${up ? "u" : "d"}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * d54: tarjeta pro de Explorar. Logo oficial (o iniciales), nombre,
 * categoría, retorno real con sparkline y botón Seguir. Sin serie no hay
 * cifra: estado "Historial en preparación" con línea base, nunca el
 * return_ytd estático ni un "—" vacío.
 */
export function ExploreCard({
  portfolio,
  isFollowing,
  isPro,
  stat,
  noSeries = false,
}: {
  portfolio: ExploreCardPortfolio;
  isFollowing: boolean;
  isPro: boolean;
  stat: SlimCardStat | null;
  noSeries?: boolean;
}) {
  const pct = stat?.pct ?? null;
  const up = (pct ?? 0) >= 0;
  return (
    <article
      className={cn(
        "app-card group flex h-full flex-col rounded-2xl p-4 transition-shadow hover:shadow-app-raised",
      )}
    >
      <Link href={`/portfolio/${canonicalPortfolioSlug(portfolio.slug)}`} className="flex min-w-0 items-center gap-3">
        <PortfolioAvatar portfolio={portfolio} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-ink-900 group-hover:underline">{portfolio.name}</h3>
          <p className="truncate text-[12px] text-ink-500">
            {CATEGORY_META[portfolio.category]?.label ?? ""} · {portfolio.country}
            {portfolio.premium ? " · Pro" : ""}
          </p>
        </div>
      </Link>

      {noSeries || pct === null ? (
        <Link href={`/portfolio/${canonicalPortfolioSlug(portfolio.slug)}`} className="mt-4 block" tabIndex={-1} aria-hidden="true">
          <div className="flex h-[22px] items-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-500">
              <span className="size-1.5 rounded-full bg-ink-400" />
              Historial en preparación
            </span>
          </div>
          <div className="mt-2 flex h-14 items-end">
            <svg viewBox="0 0 240 56" preserveAspectRatio="none" className="h-14 w-full" aria-hidden="true">
              <path d="M0,40 L240,40" fill="none" stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 5" className="text-ink-200" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </Link>
      ) : (
      <Link href={`/portfolio/${canonicalPortfolioSlug(portfolio.slug)}`} className="mt-4 block" tabIndex={-1} aria-hidden="true">
        <div className="flex items-end justify-between gap-2">
          <p className={cn("text-[22px] font-semibold leading-none tracking-tight tabular-nums", up ? "text-positive" : "text-negative")}>
            {formatSignedPct(pct)}
          </p>
          <p className="text-right text-[11px] text-ink-500">
            {stat?.label || ""}
            {stat?.estimated ? " · estimado" : ""}
          </p>
        </div>
        <div className="mt-2">
          <AreaSpark data={stat?.spark ?? []} up={up} />
        </div>
      </Link>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-500 tabular-nums">{formatCompact(portfolio.followers)} seguidores</span>
        <FollowButton portfolioId={portfolio.id} initialFollowing={isFollowing} initialIsPro={isPro} portfolioPremium={portfolio.premium} />
      </div>
    </article>
  );
}
