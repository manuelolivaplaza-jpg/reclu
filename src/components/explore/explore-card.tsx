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
  if (data.length < 2) return <div className="h-14 rounded-none bg-ink-50 dark:bg-white/5" />;
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
 *
 * Geometría del sistema: filete de 1px, radio 0, sin sombras; el hover sube
 * el filete a tinta (blanco en oscuro). Todas las tarjetas de una fila
 * comparten alto porque el bloque de cifra y el pie están fijados y el aire
 * sobrante lo absorbe la cifra, dejando el pie siempre abajo.
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
  const href = `/portfolio/${canonicalPortfolioSlug(portfolio.slug)}`;
  const category = CATEGORY_META[portfolio.category]?.label ?? "";
  const meta = [category, portfolio.country, portfolio.premium ? "Pro" : ""].filter(Boolean).join(" · ");

  return (
    <article className="group flex h-full flex-col rounded-none border border-ink-300 bg-white p-4 transition-colors hover:border-ink-900 dark:border-white/12 dark:bg-ink-950 dark:hover:border-white">
      <Link href={href} className="flex min-w-0 items-center gap-3">
        <PortfolioAvatar portfolio={portfolio} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink-900 group-hover:underline dark:text-white">
            {portfolio.name}
          </h3>
          <p className="mt-0.5 truncate text-[12px] leading-snug text-ink-500 dark:text-white/55">
            {meta}
          </p>
        </div>
      </Link>

      <div className="mt-4 flex-1 pb-4">
        {!noSeries && pct !== null ? (
          <>
            <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
              <div className="flex h-6 items-end justify-between gap-2">
                <p className={cn("num shrink-0 text-[22px] leading-none", up ? "text-positive" : "text-negative")}>
                  {formatSignedPct(pct)}
                </p>
                <p className="min-w-0 flex-1 truncate text-right text-[11px] leading-tight text-ink-500 dark:text-white/55">
                  {stat?.label || ""}
                  {stat?.estimated ? " · estimado" : ""}
                </p>
              </div>
              <div className="mt-2">
                <AreaSpark data={stat?.spark ?? []} up={up} />
              </div>
            </Link>
            <p className="sr-only">
              Retorno {formatSignedPct(pct)} {stat?.label ?? ""}
              {stat?.estimated ? " (estimado)" : ""}
            </p>
          </>
        ) : (
          <>
            <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
              <div className="flex h-6 items-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium leading-snug text-ink-500 dark:bg-white/5 dark:text-white/55">
                  <span className="size-1.5 rounded-full bg-ink-400 dark:bg-white/40" />
                  Historial en preparación
                </span>
              </div>
              <div className="mt-2 flex h-14 items-end">
                <svg viewBox="0 0 240 56" preserveAspectRatio="none" className="h-14 w-full" aria-hidden="true">
                  <path d="M0,40 L240,40" fill="none" stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 5" className="text-ink-200 dark:text-white/15" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            </Link>
            <p className="sr-only">
              Historial en preparación: este portafolio todavía no tiene serie de rendimiento publicada.
            </p>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-ink-200 pt-4 dark:border-white/10">
        <span className="whitespace-nowrap text-[12px] leading-none tabular-nums text-ink-500 dark:text-white/55">
          {formatCompact(portfolio.followers)} seguidores
        </span>
        <FollowButton portfolioId={portfolio.id} initialFollowing={isFollowing} initialIsPro={isPro} portfolioPremium={portfolio.premium} />
      </div>
    </article>
  );
}
