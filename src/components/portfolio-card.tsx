import Link from "next/link";
import { FollowButton } from "@/components/follow-button";
import { Sparkline } from "@/components/sparkline";
import { CATEGORY_META, type Portfolio } from "@/lib/types";
import { formatCompact, formatSignedPct } from "@/lib/utils";
import type { CardStat } from "@/lib/card-series";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { cn } from "@/lib/utils";
import { portraitCreditText } from "@/components/portrait-credit";

interface PortfolioCardProps {
  portfolio: Portfolio;
  isFollowing?: boolean;
  isPro?: boolean;
  /**
   * D40: retorno y sparkline de la serie real. Sin `stat` (o pct null) la
   * tarjeta no muestra retorno: nunca el return_ytd estático del catálogo.
   */
  stat?: CardStat | null;
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
  stat = null,
}: PortfolioCardProps) {
  const meta = CATEGORY_META[portfolio.category];
  const pct = stat?.pct ?? null;
  const hasReturn = pct !== null;
  const positive = (pct ?? 0) >= 0;

  return (
    <div className="flex flex-col overflow-hidden border border-ink-200">
      <Link
        href={`/portfolio/${portfolio.slug}`}
        aria-hidden="true"
        tabIndex={-1}
        className="block px-6 pt-6"
      >
        <PortfolioAvatar
          portfolio={portfolio}
          size={64}
          title={
            portfolio.portrait_image
              ? portraitCreditText(portfolio.portrait_source, portfolio.portrait_license, portfolio.portrait_author)
              : undefined
          }
        />
      </Link>

      <div className="flex flex-1 flex-col p-6">
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

      {/* Retorno + sparkline (serie real) */}
      {hasReturn && (
        <div className="mt-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <span
              className={cn(
                "num block text-[2rem] leading-none",
                positive ? "text-positive" : "text-negative",
              )}
            >
              {formatSignedPct(pct)}
            </span>
            <span className="mt-1 block text-[12px] text-ink-500">
              {stat?.label}
              {stat?.estimated ? " · estimado" : ""}
            </span>
          </div>
          {stat && stat.spark.length >= 2 ? (
            <Sparkline data={stat.spark} className="h-9 w-24" />
          ) : null}
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
    </div>
  );
}
