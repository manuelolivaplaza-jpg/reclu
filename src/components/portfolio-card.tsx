import Link from "next/link";
import { FollowButton } from "@/components/follow-button";
import { Sparkline } from "@/components/sparkline";
import { CATEGORY_META, type Portfolio } from "@/lib/types";
import { formatCompact } from "@/lib/utils";
import { sparklineData } from "@/components/sections/portfolio-data";
import { cn } from "@/lib/utils";

interface PortfolioCardProps {
  portfolio: Portfolio;
  isFollowing?: boolean;
  isPro?: boolean;
}

/**
 * PortfolioCard — bloque con filete 1px, radio 0, sin sombra, sin hover-lift.
 * Nombre 20px peso 500. Retorno grande en verde o rojo, tabular, sin icono.
 * Categoría en 13px gris. País como código US/CL/Global, no emoji.
 */
export function PortfolioCard({
  portfolio,
  isFollowing = false,
  isPro = false,
}: PortfolioCardProps) {
  const meta = CATEGORY_META[portfolio.category];
  const hasReturn = portfolio.return_ytd !== null;
  const positive = (portfolio.return_ytd ?? 0) >= 0;

  return (
    <div className="flex flex-col border border-ink-200 p-6">
      {/* Categoría + país */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-500">{meta.label}</span>
        <span className="text-[11px] tracking-[0.08em] text-ink-500">
          {portfolio.country}
        </span>
      </div>

      {/* Nombre */}
      <Link href={`/portfolio/${portfolio.slug}`} className="group mt-4 block">
        <h3 className="text-[20px] font-medium tracking-[-0.03em] text-ink-900 group-hover:underline">
          {portfolio.name}
        </h3>
      </Link>

      {portfolio.manager && (
        <p className="mt-1 text-[13px] text-ink-500">{portfolio.manager}</p>
      )}

      {/* Retorno + sparkline */}
      {hasReturn && (
        <div className="mt-5 flex items-end justify-between gap-4">
          <span
            className={cn(
              "num text-[2rem] leading-none",
              positive ? "text-positive" : "text-negative",
            )}
          >
            {positive ? "+" : ""}
            {portfolio.return_ytd?.toFixed(1)}%
          </span>
          <Sparkline
            data={sparklineData(portfolio.return_ytd ?? 0)}
            className="h-9 w-24"
          />
        </div>
      )}

      {/* Seguidores */}
      <p className="mt-5 border-t border-ink-200 pt-4 text-[13px] text-ink-500">
        {formatCompact(portfolio.followers)} seguidores
      </p>

      {/* Acción */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href={`/portfolio/${portfolio.slug}`}
          className="text-[14px] text-ink-900 underline-offset-4 hover:underline"
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
    </div>
  );
}
