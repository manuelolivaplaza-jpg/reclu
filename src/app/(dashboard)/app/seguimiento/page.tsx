import { connection } from "next/server";
import Link from "next/link";
import { getFollows, getPerformanceSeriesAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { cardStatsById, clipSeriesForSlug } from "@/lib/card-series";
import { isPaidPlan } from "@/lib/types";
import { SeguimientoList, type SeguimientoItem } from "@/components/dashboard/resumen/seguimiento-list";
import { periodChanges } from "@/components/dashboard/resumen/periods";

export const metadata = { title: "Seguimiento", robots: { index: false } };
export const instant = false;

export default async function SeguimientoPage() {
  await connection();
  const [follows, profile, all] = await Promise.all([getFollows(), getProfile(), getPortfolios()]);
  const ids = new Set(follows.map((f) => f.portfolio_id));
  const followed = all.filter((p) => ids.has(p.id));
  const series = await getPerformanceSeriesAdmin(followed.map((p) => p.id));
  const stats = cardStatsById(followed, series);
  const items: SeguimientoItem[] = followed.map((p) => {
    const pts = clipSeriesForSlug(p.slug, series.get(p.id) ?? []).map((r) => ({ date: r.date, value: r.value }));
    const s = stats[p.id];
    return {
      portfolio: p,
      spark: s?.spark ?? [],
      changes: periodChanges(pts),
      total: s?.pct ?? null,
      totalLabel: `${s?.label ?? ""}${s?.estimated ? " · estimado" : ""}`,
    };
  });

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-app-display font-semibold tracking-tight text-ink-900">Seguimiento</h1>
          <p className="mt-1 text-app-caption text-ink-500">
            {followed.length === 1 ? "1 portafolio" : `${followed.length} portafolios`} que sigues
          </p>
        </div>
        <Link href="/app/explorar" className="rounded-app-control bg-ink-900 px-3.5 py-2 text-[13px] font-semibold text-white">
          Seguir más
        </Link>
      </header>
      {items.length > 0 ? (
        <SeguimientoList items={items} isPro={isPaidPlan(profile?.plan)} />
      ) : (
        <div className="app-card p-8 text-center">
          <p className="text-app-title font-semibold text-ink-900">Aún no sigues portafolios</p>
          <p className="mt-1 text-app-caption text-ink-500">Explora el catálogo y sigue los que te interesen.</p>
          <Link href="/app/explorar" className="mt-4 inline-block rounded-app-control bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white">
            Explorar portafolios
          </Link>
        </div>
      )}
    </div>
  );
}
