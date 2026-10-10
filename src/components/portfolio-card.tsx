import Link from "next/link";
import { Users, TrendingUp, TrendingDown, Crown, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META, type Portfolio } from "@/lib/types";
import { formatCompact } from "@/lib/utils";

interface PortfolioCardProps {
  portfolio: Portfolio;
  isFollowing?: boolean;
  isPro?: boolean;
}

const COUNTRY_FLAG: Record<string, string> = { US: "🇺🇸", CL: "🇨🇱", Global: "🌐" };

export function PortfolioCard({ portfolio, isFollowing = false, isPro = false }: PortfolioCardProps) {
  const meta = CATEGORY_META[portfolio.category];
  const hasReturn = portfolio.return_ytd !== null;
  const positive = (portfolio.return_ytd ?? 0) >= 0;

  return (
    <Card interactive className="flex flex-col">
      <div className="flex flex-1 flex-col p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">{meta.label}</Badge>
            {portfolio.premium && (
              <Badge variant="warning" className="gap-1">
                <Crown className="size-3" />
                Pro
              </Badge>
            )}
          </div>
          <span className="shrink-0 text-lg" title={portfolio.country} aria-label={portfolio.country}>
            {COUNTRY_FLAG[portfolio.country] ?? "🌐"}
          </span>
        </div>

        {/* Title + description */}
        <Link href={`/portfolio/${portfolio.slug}`} className="group mt-4 block">
          <h3 className="text-base font-semibold text-ink-900 transition-colors group-hover:text-brand-700">
            {portfolio.name}
          </h3>
        </Link>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-600">
          {portfolio.description}
        </p>

        {/* Manager */}
        {portfolio.manager && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
            <MapPin className="size-3.5" />
            {portfolio.manager}
          </p>
        )}

        {/* Stats */}
        <div className="mt-5 flex items-center gap-4 border-t border-ink-100 pt-4 text-sm">
          <span className="flex items-center gap-1.5 text-ink-600">
            <Users className="size-4 text-ink-400" />
            <span className="tabular-nums">{formatCompact(portfolio.followers)}</span>
          </span>
          {hasReturn && (
            <span
              className={
                "flex items-center gap-1.5 font-medium tabular-nums " +
                (positive ? "text-positive" : "text-negative")
              }
            >
              {positive ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )}
              {positive ? "+" : ""}
              {portfolio.return_ytd?.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Footer with follow action */}
      <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-6 py-4">
        <Link
          href={`/portfolio/${portfolio.slug}`}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          Ver detalle
        </Link>
        <FollowButton
          portfolioId={portfolio.id}
          initialFollowing={isFollowing}
          initialIsPro={isPro}
          portfolioPremium={portfolio.premium}
        />
      </div>
    </Card>
  );
}
