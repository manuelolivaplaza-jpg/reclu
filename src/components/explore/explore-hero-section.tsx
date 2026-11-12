import { connection } from "next/server";
import { timed } from "@/lib/timing";
import { getExploreCardStats, getFollows, getPerformanceSeriesAdmin, getPortfolios, getProfile, pickCardStats } from "@/lib/queries";
import { roleFor } from "@/lib/access";
import { isPaidPlan, type Holding } from "@/lib/types";
import { AppLink as Link } from "@/components/app/app-link";
import { canonicalPortfolioSlug } from "@/lib/portfolio-canonical";
import { ExploreHeroCarousel } from "@/components/explore/explore-hero-carousel";
import { buildSlide, slideHasSeries } from "@/components/explore/explore-featured";
import { cn, formatSignedPct } from "@/lib/utils";

const SLIDES = 6;
const TRENDS = 5;

/**
 * d54: panel principal de Explorar (carrusel de los más seguidos) + lista
 * corta de tendencias a la derecha en escritorio. Va en Suspense: la grilla
 * no lo espera. Todo dato es real: sin serie no se dibuja una curva y sin
 * retorno el carrusel dice "Sin dato en este período", nunca un cero.
 */
export async function ExploreHeroSection() {
  await connection();
  const [catalog, profile, follows, allStats] = await Promise.all([
    timed("hero.catalog", getPortfolios()),
    getProfile(),
    getFollows(),
    timed("hero.cardStats", getExploreCardStats()),
  ]);
  const isPro = isPaidPlan(profile?.plan);
  const role = roleFor(profile);
  const followed = new Set(follows.map((f) => f.portfolio_id));

  const top = catalog.toSorted((a, b) => b.followers - a.followers).slice(0, SLIDES * 3);
  const [seriesById, holdingsList] = await Promise.all([
    timed("hero.series", getPerformanceSeriesAdmin(top.map((p) => p.id))),
    // d68: el carrusel ya no muestra posiciones; no se piden holdings.
    Promise.resolve(top.map(() => [] as Holding[])),
  ]);

  // d68: varios de los más seguidos (13F: Berkshire, Renaissance, Scion,
  // Bridgewater, Duquesne) no tienen filas en portfolio_performance; antes
  // salían con "Sin serie". El carrusel prioriza los más seguidos CON serie real.
  const built = top.map((p, i) =>
    buildSlide(p, seriesById.get(p.id), holdingsList[i], { isFollowing: followed.has(p.id), isPro, role }),
  );
  const withSeries = built.filter(slideHasSeries);
  const slides = (withSeries.length > 0 ? withSeries : built).slice(0, SLIDES);
  // Sin catálogo no hay hero: no se reservan 520 px vacíos ni un encabezado
  // que anuncie "0 portafolios".
  if (slides.length === 0) return null;

  const stats = pickCardStats(catalog, allStats);
  const trends = catalog
    .map((p) => ({ p, s: stats[p.id] }))
    .filter((r) => r.s && r.s.pct !== null && !r.s.estimated)
    .toSorted((a, b) => (b.s!.pct as number) - (a.s!.pct as number))
    .slice(0, TRENDS);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-ink-300 pb-3 dark:border-white/12">
        <div className="min-w-0">
          <p className="label-line">Portafolios</p>
          <h2 className="mt-1.5 text-[22px] font-medium leading-[1.1] tracking-[-0.03em] text-ink-900 dark:text-white">
            Más seguidos
          </h2>
        </div>
        <p className="label-line num shrink-0">
          {slides.length} {slides.length === 1 ? "portafolio" : "portafolios"}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="min-h-[520px] min-w-0 lg:min-h-[420px]">
          <ExploreHeroCarousel slides={slides} isPro={isPro} />
        </div>

        <aside
          aria-labelledby="tendencias-heading"
          className="min-w-0 border-t border-ink-300 pt-6 dark:border-white/12 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
        >
          <p className="label-line">Rankings</p>
          <h2
            id="tendencias-heading"
            className="mt-1.5 text-[22px] font-medium leading-[1.1] tracking-[-0.03em] text-ink-900 dark:text-white"
          >
            Mejor rendimiento
          </h2>
          {trends.length === 0 ? (
            <p className="mt-4 text-[13px] leading-relaxed text-ink-500 dark:text-white/55">
              Todavía no hay series publicadas para ordenar por rendimiento.
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-ink-300 dark:divide-white/12">
              {trends.map(({ p, s }, i) => (
                <li key={p.id}>
                  <Link
                    href={`/portfolio/${canonicalPortfolioSlug(p.slug)}`}
                    className="group -mx-2 flex items-center gap-3 px-2 py-3 transition-colors hover:bg-ink-50 focus-visible:outline-offset-[-2px] dark:hover:bg-white/[0.04]"
                  >
                    <span className="num w-4 shrink-0 text-[12px] text-ink-500 dark:text-white/55">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink-900 group-hover:underline dark:text-white">
                        {p.name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-500 dark:text-white/55">{s!.label}</span>
                    </span>
                    <span
                      className={cn(
                        "num shrink-0 text-[14px]",
                        (s!.pct as number) > 0
                          ? "text-positive"
                          : (s!.pct as number) < 0
                            ? "text-negative"
                            : "text-ink-900 dark:text-white",
                      )}
                    >
                      {formatSignedPct(s!.pct)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <Link
            href="/ranking"
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-900 underline-offset-4 hover:underline dark:text-white"
          >
            Ver todos los rankings
            <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </div>
    </div>
  );
}

/** Esqueleto del panel principal: mismas alturas mínimas que el panel real (d62, CLS <= 0,1). */
export function ExploreHeroSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="flex items-end justify-between gap-4 border-b border-ink-300 pb-3 dark:border-white/12">
        <div className="flex flex-col gap-2">
          <span className="h-3 w-16 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
          <span className="h-5 w-32 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
        </div>
        <span className="h-4 w-20 animate-pulse bg-ink-100 motion-reduce:animate-none dark:bg-white/5" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="h-[520px] animate-pulse bg-ink-100 max-sm:-mx-4 motion-reduce:animate-none lg:h-[420px] dark:bg-white/5" />
        <div className="h-[380px] animate-pulse bg-ink-100 motion-reduce:animate-none lg:h-[420px] dark:bg-white/5" />
      </div>
    </div>
  );
}
