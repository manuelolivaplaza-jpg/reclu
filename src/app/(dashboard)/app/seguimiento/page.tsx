import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getFollows, getPerformanceSeriesAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { cardStatsById, clipSeriesForSlug } from "@/lib/card-series";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT, isPaidPlan } from "@/lib/types";
import { cn, formatSignedPct } from "@/lib/utils";
import { SeguimientoList, type SeguimientoItem } from "@/components/dashboard/resumen/seguimiento-list";
import { periodChanges } from "@/components/dashboard/resumen/periods";

export const metadata = { title: "Seguimiento", robots: { index: false } };
export const instant = false;

const STEPS = [
  {
    title: "Queda en tu panel",
    description: "Verás su retorno real, su serie y la variación día, mes y YTD.",
  },
  {
    title: "Recibes sus movimientos",
    description: "Te avisamos cuando detectamos compras, ventas o cambios de peso.",
  },
  {
    title: "Lo comparas con tu cartera",
    description: "Puedes contrastarlo con tus propias posiciones cuando quieras.",
  },
];

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

  const plan = profile?.plan ?? "free";
  const planLabel = plan === "elite" ? "Elite" : plan === "pro" ? "Pro" : "Gratis";
  const limit = plan === "elite" ? null : plan === "pro" ? PRO_PLAN_FOLLOW_LIMIT : FREE_PLAN_FOLLOW_LIMIT;
  const used = followed.length;
  const usedPct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const atLimit = limit !== null && used >= limit;
  const showUpgrade = plan !== "elite" && (plan === "free" || atLimit);

  // Promedio YTD solo con cifras reales (cada seguido aporta si tiene serie).
  const ytds = items.map((item) => item.changes.YTD).filter((value): value is number => value !== null);
  const avgYtd = ytds.length > 0 ? ytds.reduce((sum, value) => sum + value, 0) / ytds.length : null;
  const avgTone = avgYtd === null || avgYtd === 0 ? "text-ink-900" : avgYtd > 0 ? "text-positive" : "text-negative";

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-app-display font-semibold tracking-tight text-ink-900">Seguimiento</h1>
        <p className="mt-1 text-app-caption text-ink-500">
          {used === 0
            ? "Sin portafolios por ahora"
            : used === 1
              ? "1 portafolio que sigues"
              : `${used} portafolios que sigues`}
        </p>
      </header>

      <section
        aria-labelledby="capacidad-plan"
        className="grid gap-4 border-y border-ink-200 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-10 sm:py-5"
      >
        <div className="min-w-0">
          <h2 id="capacidad-plan" className="sr-only">
            Capacidad de tu plan
          </h2>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] text-ink-500">
              Plan <span className="font-medium text-ink-900">{planLabel}</span>
            </p>
            <p className="text-[13px] tabular-nums text-ink-700">
              <span className="font-semibold text-ink-900">{used}</span>
              {limit === null ? " portafolios · sin límite" : ` de ${limit} portafolios`}
            </p>
          </div>

          {limit === null ? (
            <div className="mt-2.5 h-px w-full bg-ink-200" aria-hidden="true" />
          ) : (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(used, limit)}
              aria-valuetext={`${used} de ${limit} portafolios`}
              aria-label={`Uso del plan ${planLabel}`}
              className="mt-2.5 h-[3px] w-full bg-ink-100"
            >
              <div className="h-full bg-ink-900 transition-[width] duration-500" style={{ width: `${usedPct}%` }} />
            </div>
          )}

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-[12px] text-ink-500">
              {limit === null
                ? "Elite · sin límite de portafolios"
                : atLimit
                  ? "Tope de tu plan alcanzado"
                  : `${limit - used} ${limit - used === 1 ? "disponible" : "disponibles"} en tu plan ${planLabel}`}
            </p>
            {showUpgrade ? (
              <Link
                href="/upgrade"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-700 underline-offset-4 transition-colors hover:text-ink-900 hover:underline"
              >
                Mejorar plan
                <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.75} />
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 sm:justify-end">
          {avgYtd !== null ? (
            <div className="sm:border-l sm:border-ink-200 sm:pl-8">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-400">Promedio YTD</p>
              <p className={cn("mt-1 text-[24px] font-semibold leading-none tabular-nums tracking-[-0.02em]", avgTone)}>
                {formatSignedPct(avgYtd, 1)}
              </p>
              <p className="mt-1 text-[10px] text-ink-500">
                {ytds.length} de {used} con dato
              </p>
            </div>
          ) : null}

          <nav aria-label="Accesos rápidos" className="flex flex-col gap-1.5">
            <Link
              href="/app/explorar"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-900 hover:underline hover:underline-offset-4"
            >
              Explorar portafolios
              <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </Link>
            <Link
              href="/compare"
              className="inline-flex items-center gap-1 text-[12px] text-ink-500 transition-colors hover:text-ink-900"
            >
              Comparar cartera
              <ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </Link>
          </nav>
        </div>
      </section>

      {items.length > 0 ? (
        <SeguimientoList items={items} isPro={isPaidPlan(plan)} />
      ) : (
        <section aria-labelledby="seguimiento-vacio" className="py-12 sm:py-16">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-400">Tu seguimiento</p>
            <h2
              id="seguimiento-vacio"
              className="mt-3 text-[24px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[28px]"
            >
              Aún no sigues portafolios
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
              Al seguir un portafolio queda en este panel con su retorno real, su serie y la variación día, mes y YTD.
              También recibes una alerta cuando detectamos un cambio en sus posiciones.
            </p>
          </div>

          <ol className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-ink-200">
            {STEPS.map((step, index) => (
              <li key={step.title} className="sm:px-5">
                <p className="text-[11px] tabular-nums text-ink-400">0{index + 1}</p>
                <p className="mt-1.5 text-[14px] font-medium text-ink-900">{step.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{step.description}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 text-center">
            <Link
              href="/app/explorar"
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-black focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              Explorar portafolios
            </Link>
            <p className="mt-3 text-[12px] text-ink-400">Puedes dejar de seguir un portafolio cuando quieras.</p>
          </div>
        </section>
      )}
    </div>
  );
}
