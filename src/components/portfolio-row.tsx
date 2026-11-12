import { AppLink as Link } from "@/components/app/app-link";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import { Sparkline } from "@/components/sparkline";
import type { ShowcasePortfolio } from "@/components/sections/portfolio-data";
import { cn, formatSignedPct } from "@/lib/utils";

/**
 * Fila tipográfica de portafolio — el bloque visual central de la home.
 * Filete superior 1px, nombre grande, sparkline negra fina, retorno enorme.
 * La fila entera enlaza al detalle. Hover: el nombre se subraya. Sin lift,
 * sin sombra, sin borde de color.
 */
export function PortfolioRow({
  portfolio,
  isLast = false,
}: {
  portfolio: ShowcasePortfolio;
  isLast?: boolean;
}) {
  const positive = portfolio.returnPct >= 0;
  // D40: solo serie real; sin serie no se dibuja (antes: curva inventada).
  const spark = portfolio.spark ?? [];

  return (
    <Link
      href={`/portfolio/${canonicalPortfolioSlug(portfolio.slug)}`}
      className={cn(
        "group grid grid-cols-1 items-center gap-x-8 gap-y-3 border-t border-ink-200 py-7 md:grid-cols-[1.4fr_1fr_auto] md:gap-y-0",
        isLast && "border-b",
      )}
    >
      {/* Nombre + meta */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 group-hover:underline sm:text-[26px]">
            {portfolio.name}
          </h3>
          <span className="text-[11px] tracking-[0.08em] text-ink-500">
            {portfolio.country}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-ink-500">{portfolio.meta}</p>
      </div>

      {/* Sparkline */}
      <div className="hidden md:block">
        {spark.length >= 2 ? <Sparkline data={spark} className="h-10 w-full" /> : null}
      </div>

      {/* Retorno */}
      <div className="flex items-baseline justify-between md:justify-end">
        {spark.length >= 2 ? (
          <Sparkline data={spark} className="h-9 w-full md:hidden" />
        ) : null}
        <span
          className={cn(
            "num text-[clamp(2rem,4vw,3.25rem)] leading-none",
            positive ? "text-positive" : "text-negative",
          )}
        >
          {formatSignedPct(portfolio.returnPct)}
        </span>
      </div>
    </Link>
  );
}
