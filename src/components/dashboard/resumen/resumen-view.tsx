import Link from "next/link";
import { holdingLimitFor } from "@/lib/access";
import { ArrowRight, BellPlus, Compass } from "lucide-react";
import { getAlerts, getFollows, getHoldings, getPerformanceSeriesAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { clipSeriesForSlug } from "@/lib/card-series";
import { createClient } from "@/lib/supabase/server";
import { roleFor } from "@/lib/access";
import { CATEGORY_META, FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT, isPaidPlan, type AlertType } from "@/lib/types";
import { cn, formatSignedPct, timeAgo } from "@/lib/utils";
import { StatCard } from "@/components/app/stat-card";
import { OnboardingSuggestions } from "@/components/onboarding-suggestions";
import { FollowedCarousel, type CarouselSlide } from "./followed-carousel";
import { MyHoldingsPanel } from "./my-holdings-panel";
import { loadMyPortfolioSummary } from "./load-my-portfolio";
import { downsample, periodChanges } from "./periods";

const MAX_SLIDES = 8;
const DAY = 86_400_000;

const CHIP: Partial<Record<AlertType, { label: string; cls: string }>> = {
  new_trade: { label: "Compra", cls: "bg-positive/10 text-positive" },
  sold_trade: { label: "Venta", cls: "bg-negative/10 text-negative" },
  weight_change: { label: "Peso", cls: "bg-app-canvas text-ink-700" },
  mention: { label: "Mención", cls: "bg-app-canvas text-ink-700" },
  dividend: { label: "Dividendo", cls: "bg-app-canvas text-ink-700" },
  earnings: { label: "Resultados", cls: "bg-app-canvas text-ink-700" },
  "13f_update": { label: "13F", cls: "bg-app-canvas text-ink-700" },
};

/** d53: Resumen estilo Polymarket. Tarjeta-carrusel a la izquierda, Mi portafolio a la derecha, indicadores y alertas abajo. */
export async function ResumenView() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    follows,
    profile,
    all,
  ] = await Promise.all([supabase.auth.getUser(), getFollows(), getProfile(), getPortfolios()]);

  const followedIds = new Set(follows.map((f) => f.portfolio_id));
  const followed = all.filter((p) => followedIds.has(p.id));
  const role = roleFor(profile);
  const isPro = isPaidPlan(profile?.plan);
  const slidesFor = followed.slice(0, MAX_SLIDES);

  const [series, holdingsList, followedAlerts, mine] = await Promise.all([
    getPerformanceSeriesAdmin(followed.map((p) => p.id)),
    Promise.all(slidesFor.map((p) => getHoldings(p.id, { role }).catch(() => []))),
    followed.length > 0 ? getAlerts(undefined, 5, { role, portfolioIds: followed.map((p) => p.id) }) : Promise.resolve([]),
    loadMyPortfolioSummary(user?.id ?? null),
  ]);

  const slides: CarouselSlide[] = slidesFor.map((p, k) => {
    const raw = clipSeriesForSlug(p.slug, series.get(p.id) ?? []);
    const pts = raw.map((r) => ({ date: r.date, value: r.value }));
    const top = [...holdingsList[k]]
      .filter((h) => Number.isFinite(h.weight) && h.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map((h) => ({ symbol: h.symbol, name: h.name, weight: Number(h.weight) }));
    return {
      id: p.id,
      href: `/app/portafolio/${p.slug}`,
      avatar: {
        slug: p.slug,
        name: p.name,
        category: p.category,
        cover_image: p.cover_image,
        portrait_image: p.portrait_image ?? null,
      },
      name: p.name,
      subtitle: [CATEGORY_META[p.category].label, p.manager].filter(Boolean).join(" · "),
      changes: periodChanges(pts),
      points: downsample(pts, 160),
      asOf: pts.length ? pts[pts.length - 1].date.split("-").reverse().join("-") : null,
      estimated: raw.some((r) => r.estimated),
      top,
      holdingsLocked: holdingLimitFor(role, p) === 0 || (p.premium && !isPro),
    };
  });

  // Indicadores reales (sin serie => "—").
  const ytds = slides.map((s) => s.changes.YTD).filter((v): v is number => v !== null);
  const days = slides.map((s) => s.changes["1D"]).filter((v): v is number => v !== null);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const avgYtd = avg(ytds);
  const avgDay = avg(days);
  const alerts7d = followedAlerts.filter((a) => Date.now() - new Date(a.created_at).getTime() <= 7 * DAY).length;
  const limit = profile?.plan === "elite" ? null : profile?.plan === "pro" ? PRO_PLAN_FOLLOW_LIMIT : FREE_PLAN_FOLLOW_LIMIT;
  const byId = new Map(all.map((p) => [p.id, p]));

  const onboarding =
    followed.length === 0
      ? [...all].filter((p) => !p.premium).sort((a, b) => b.followers - a.followers).slice(0, 3)
      : [];
  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "";

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          {firstName && <p className="text-app-caption text-ink-500">Hola, {firstName}</p>}
          <h1 className="text-app-display font-semibold tracking-tight text-ink-900">Resumen</h1>
        </div>
        <Link href="/app/seguimiento" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-700 hover:text-ink-900">
          Seguimiento
          <ArrowRight className="size-3.5" />
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        {slides.length > 0 ? (
          <FollowedCarousel slides={slides} />
        ) : (
          <div className="app-card flex flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-app-canvas">
              <Compass className="size-5 text-ink-700" strokeWidth={1.75} />
            </span>
            <p className="text-app-title font-semibold text-ink-900">Sigue tu primer portafolio</p>
            <p className="max-w-sm text-app-caption text-ink-500">Aquí verás su gráfico, variación y principales posiciones.</p>
            <Link href="/app/explorar" className="rounded-app-control bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white">
              Explorar portafolios
            </Link>
          </div>
        )}
        <MyHoldingsPanel data={mine} />
      </div>

      {onboarding.length > 0 && <OnboardingSuggestions suggestions={onboarding} isPro={isPro} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Seguidos" value={String(followed.length)} hint={limit === null ? "Elite · sin límite" : `de ${limit} en tu plan`} />
        <StatCard label="Promedio hoy" value={avgDay === null ? null : formatSignedPct(avgDay, 2)} hint={`${days.length} con dato`} />
        <StatCard label="Promedio YTD" value={avgYtd === null ? null : formatSignedPct(avgYtd, 1)} hint={`${ytds.length} con dato`} />
        <StatCard label="Alertas 7 días" value={followed.length ? (alerts7d >= 5 ? "5+" : String(alerts7d)) : null} hint="de tus seguidos" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <section className="app-card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 sm:px-5">
            <h2 className="text-app-title font-semibold text-ink-900">Últimas alertas</h2>
            <Link href="/alerts" className="text-app-caption font-medium text-ink-700 hover:text-ink-900">
              Ver todas
            </Link>
          </div>
          {followedAlerts.length > 0 ? (
            <ul className="divide-y divide-app-border">
              {followedAlerts.slice(0, 5).map((a) => {
                const p = byId.get(a.portfolio_id);
                const chip = CHIP[a.type];
                return (
                  <li key={a.id}>
                    <Link href={p ? `/app/portafolio/${p.slug}` : "/alerts"} className="block px-4 py-3 hover:bg-app-canvas sm:px-5">
                      <div className="flex items-center gap-2 text-app-caption text-ink-500">
                        {chip && <span className={cn("rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold", chip.cls)}>{chip.label}</span>}
                        <span className="truncate font-medium text-ink-700">{a.portfolio?.name ?? p?.name ?? "Portafolio"}</span>
                        <span className="ml-auto shrink-0 tabular-nums">{timeAgo(a.created_at)}</span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-[14px] font-medium text-ink-900">{a.title}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 pb-5 text-app-caption text-ink-500 sm:px-5">Sin alertas de tus seguidos todavía.</p>
          )}
        </section>

        <Link href="/settings" className="app-card group flex flex-col justify-between gap-4 p-5 hover:shadow-app-raised">
          <span className="flex size-11 items-center justify-center rounded-full bg-ink-900 text-white">
            <BellPlus className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-app-title font-semibold text-ink-900">Crea reglas de alerta</p>
            <p className="mt-1 text-app-caption text-ink-500">Elige qué cambios te importan: compras, ventas o cambios de peso.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-900">
            Configurar reglas
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}
