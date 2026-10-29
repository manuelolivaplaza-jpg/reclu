import { connection } from "next/server";
import { timed } from "@/lib/timing";
import { getExploreCardStats, getFollows, getHoldings, getPerformanceSeriesAdmin, getPortfolios, getProfile, pickCardStats } from "@/lib/queries";
import { roleFor } from "@/lib/access";
import { isPaidPlan, type Holding } from "@/lib/types";
import { AppLink as Link } from "@/components/app/app-link";
import { ExploreHeroCarousel } from "@/components/explore/explore-hero-carousel";
import { buildSlide } from "@/components/explore/explore-featured";
import { cn, formatSignedPct } from "@/lib/utils";

const SLIDES = 6;
const TRENDS = 5;

/**
 * d54: panel principal de Explorar (carrusel de los más seguidos) + lista
 * corta de tendencias a la derecha en escritorio. Va en Suspense: la grilla
 * no lo espera. Todo dato es real; sin dato se muestra "—".
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

  const top = catalog.toSorted((a, b) => b.followers - a.followers).slice(0, SLIDES);
  const [seriesById, holdingsList] = await Promise.all([
    timed("hero.series", getPerformanceSeriesAdmin(top.map((p) => p.id))),
    Promise.all(
      top.map((p) =>
        p.premium && !isPro ? Promise.resolve([] as Holding[]) : getHoldings(p.id, { role }).catch(() => [] as Holding[]),
      ),
    ),
  ]);

  const slides = top.map((p, i) =>
    buildSlide(p, seriesById.get(p.id), holdingsList[i], { isFollowing: followed.has(p.id), isPro, role }),
  );

  const stats = pickCardStats(catalog, allStats);
  const trends = catalog
    .map((p) => ({ p, s: stats[p.id] }))
    .filter((r) => r.s && r.s.pct !== null && !r.s.estimated)
    .toSorted((a, b) => (b.s!.pct as number) - (a.s!.pct as number))
    .slice(0, TRENDS);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
      <ExploreHeroCarousel slides={slides} isPro={isPro} />

      <aside className="app-card rounded-2xl p-4 sm:p-5" aria-labelledby="tendencias-heading">
        <div className="flex items-center justify-between">
          <h2 id="tendencias-heading" className="text-[15px] font-semibold text-ink-900">
            Mejor rendimiento
          </h2>
          <Link href="/ranking" className="text-[12px] font-medium text-ink-500 hover:text-ink-900">
            Ranking →
          </Link>
        </div>
        {trends.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-500">Sin datos.</p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {trends.map(({ p, s }, i) => (
              <li key={p.id}>
                <Link
                  href={`/portfolio/${p.slug}`}
                  className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-ink-50"
                >
                  <span className="w-4 text-[12px] font-medium tabular-nums text-ink-400">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink-900">{p.name}</span>
                    <span className="block text-[11px] text-ink-500">{s!.label}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[14px] font-semibold tabular-nums",
                      (s!.pct as number) >= 0 ? "text-positive" : "text-negative",
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
          className="mt-3 flex h-10 items-center justify-center rounded-full bg-ink-50 text-[13px] font-medium text-ink-900 hover:bg-ink-100"
        >
          Ver todos los rankings
        </Link>
      </aside>
    </div>
  );
}

/** Esqueleto del panel principal (misma altura para no mover el layout). */
export function ExploreHeroSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6" aria-hidden="true">
      <div className="app-card h-[520px] animate-pulse rounded-2xl bg-ink-50 max-sm:-mx-4 max-sm:rounded-none lg:h-[400px]" />
      <div className="app-card hidden h-[400px] animate-pulse rounded-2xl bg-ink-50 lg:block" />
    </div>
  );
}
