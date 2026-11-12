import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { holdingLimitFor, roleFor } from "@/lib/access";
import { clipSeriesForSlug } from "@/lib/card-series";
import { getAlerts, getFollows, getHoldings, getPerformanceSeriesAdmin, getPortfolios, getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_META,
  FREE_PLAN_FOLLOW_LIMIT,
  PRO_PLAN_FOLLOW_LIMIT,
  isPaidPlan,
  type AlertType,
  type Holding,
  type Portfolio,
} from "@/lib/types";
import { cn, formatSignedPct, timeAgo } from "@/lib/utils";
import { OnboardingSuggestions } from "@/components/onboarding-suggestions";
import { FollowedCarousel, type CarouselSlide } from "./followed-carousel";
import { FollowedPulse, type PulseConsensusItem, type PulseMover } from "./followed-pulse";
import { MyHoldingsPanel } from "./my-holdings-panel";
import { loadMyPortfolioSummary } from "./load-my-portfolio";
import { downsample, periodChanges, type SeriesPt } from "./periods";

const MAX_SLIDES = 8;
/** Tope de carteras a las que se les piden posiciones para el cruce de consenso. */
const CONSENSUS_POOL = 15;
const ALERTS_FETCH = 25;
const ALERTS_SHOWN = 6;
const DAY = 86_400_000;

/** Tipo de alerta: una palabra, sin pastilla ni color. */
const ALERT_LABEL: Partial<Record<AlertType, string>> = {
  new_trade: "Compra",
  sold_trade: "Venta",
  weight_change: "Peso",
  mention: "Mención",
  dividend: "Dividendo",
  earnings: "Resultados",
  threshold: "Umbral",
  "13f_update": "13F",
};

const RULES = [
  { title: "Compra y venta", body: "Cuando una cartera abre o cierra una posición." },
  { title: "Cambio de peso", body: "Cuando un peso se mueve 0,5 pp o más." },
  { title: "13F y resultados", body: "Cuando se publica un trimestre o un reporte nuevo." },
];

/** Verde y rojo solo en cifras; cero y sin dato quedan en tinta neutra. */
const changeTone = (v: number | null) =>
  v === null ? "text-ink-500" : v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-900";

/** KPI de la banda superior: etiqueta fina y cifra tabular. */
function Kpi({ label, value, hint, valueClass }: { label: string; value: string; hint: string; valueClass?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 bg-app-card p-4 lg:p-5">
      <p className="label-line">{label}</p>
      <div className="min-w-0">
        <p className={cn("num truncate text-[26px] leading-none text-ink-900 lg:text-[30px]", valueClass)}>{value}</p>
        <p className="mt-1.5 truncate text-[12px] text-ink-500">{hint}</p>
      </div>
    </div>
  );
}

/** d80: Resumen editorial. KPIs, carrusel + Mi portafolio, Pulso/Consenso y alertas. */
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

  /** Muro de pago: mismas reglas que el carrusel (holdingLimitFor + premium). */
  const isLocked = (p: Portfolio) => holdingLimitFor(role, p) === 0 || (p.premium && !isPro);

  const unlockedFollowed = followed.filter((p) => !isLocked(p));
  const consensusPool = unlockedFollowed.slice(0, CONSENSUS_POOL);

  const [series, holdingsEntries, followedAlerts, mine] = await Promise.all([
    getPerformanceSeriesAdmin(followed.map((p) => p.id)),
    Promise.all(consensusPool.map((p) => getHoldings(p.id, { role }).catch(() => [] as Holding[]))),
    followed.length > 0
      ? getAlerts(undefined, ALERTS_FETCH, { role, portfolioIds: followed.map((p) => p.id) })
      : Promise.resolve([]),
    loadMyPortfolioSummary(user?.id ?? null),
  ]);

  const holdingsById = new Map<string, Holding[]>(consensusPool.map((p, i) => [p.id, holdingsEntries[i]]));

  // Serie real + variaciones por cartera (una sola vez).
  const seriesById = new Map<string, { pts: SeriesPt[]; estimated: boolean }>();
  for (const p of followed) {
    const raw = clipSeriesForSlug(p.slug, series.get(p.id) ?? []);
    seriesById.set(p.id, {
      pts: raw.map((r) => ({ date: r.date, value: r.value })),
      estimated: raw.some((r) => r.estimated),
    });
  }
  const changesById = new Map<string, ReturnType<typeof periodChanges>>();
  for (const p of followed) changesById.set(p.id, periodChanges(seriesById.get(p.id)!.pts));

  const slides: CarouselSlide[] = slidesFor.map((p) => {
    const s = seriesById.get(p.id)!;
    const top = [...(holdingsById.get(p.id) ?? [])]
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
      changes: changesById.get(p.id)!,
      points: downsample(s.pts, 160),
      asOf: s.pts.length ? s.pts[s.pts.length - 1].date : null,
      estimated: s.estimated,
      top,
      holdingsLocked: isLocked(p),
    };
  });

  // Consenso: solo carteras con posiciones visibles en el plan.
  type ConsensusAgg = { symbol: string; name: string; portfolios: PulseConsensusItem["portfolios"] };
  const agg = new Map<string, ConsensusAgg>();
  for (const p of consensusPool) {
    const seen = new Set<string>();
    for (const h of holdingsById.get(p.id) ?? []) {
      if (!Number.isFinite(h.weight) || h.weight <= 0) continue;
      if (h.asset_class === "cash") continue;
      const symbol = String(h.symbol ?? "").trim().toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      const name = String(h.name ?? "").trim();
      let entry = agg.get(symbol);
      if (!entry) {
        entry = { symbol, name: name || symbol, portfolios: [] };
        agg.set(symbol, entry);
      }
      if (entry.name === symbol && name) entry.name = name;
      entry.portfolios.push({ slug: p.slug, name: p.name, weight: Math.round(Number(h.weight) * 10) / 10 });
    }
  }
  const consensus: PulseConsensusItem[] = [...agg.values()]
    .filter((e) => e.portfolios.length >= 2)
    .map((e) => ({
      symbol: e.symbol,
      name: e.name,
      count: e.portfolios.length,
      avgWeight: Math.round((e.portfolios.reduce((sum, x) => sum + x.weight, 0) / e.portfolios.length) * 10) / 10,
      portfolios: e.portfolios,
    }))
    .sort((a, b) => b.count - a.count || b.avgWeight - a.avgWeight)
    .slice(0, 6);

  // Movers: solo carteras visibles y con serie real.
  const movers: PulseMover[] = unlockedFollowed
    .map((p) => {
      const c = changesById.get(p.id);
      return { id: p.id, slug: p.slug, name: p.name, day: c?.["1D"] ?? null, ytd: c?.YTD ?? null };
    })
    .filter((m) => m.day !== null || m.ytd !== null);

  // Indicadores reales (sin serie => "Sin dato").
  const ytds = slides.map((s) => s.changes.YTD).filter((v): v is number => v !== null);
  const days = slides.map((s) => s.changes["1D"]).filter((v): v is number => v !== null);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const avgYtd = avg(ytds);
  const avgDay = avg(days);
  // Server Component: el corte "últimos 7 días" se calcula una vez por request,
  // así que `Date.now()` no rompe idempotencia de render en el cliente.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const alerts7d = followedAlerts.filter((a) => now - new Date(a.created_at).getTime() <= 7 * DAY).length;
  const limit =
    profile?.plan === "elite" ? null : profile?.plan === "pro" ? PRO_PLAN_FOLLOW_LIMIT : FREE_PLAN_FOLLOW_LIMIT;
  const byId = new Map(all.map((p) => [p.id, p]));

  const onboarding =
    followed.length === 0
      ? [...all].filter((p) => !p.premium).sort((a, b) => b.followers - a.followers).slice(0, 3)
      : [];
  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "";

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {firstName && <p className="label-line">Hola, {firstName}</p>}
          <h1 className="mt-1 text-app-display font-medium tracking-[-0.035em] text-ink-900">Resumen</h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-500">
            Lo que movieron las carteras que sigues, en una sola vista.
          </p>
        </div>
        <nav aria-label="Accesos rápidos" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/app/explorar"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            Explorar
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          </Link>
          <Link
            href="/app/seguimiento"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-black"
          >
            Seguimiento
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          </Link>
        </nav>
      </header>

      {followed.length > 0 && (
        <section
          aria-label="Indicadores de tus seguidos"
          className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-4"
        >
          <Kpi
            label="Seguidos"
            value={String(followed.length)}
            hint={limit === null ? "Elite · sin límite" : `de ${limit} en tu plan`}
          />
          <Kpi
            label="Promedio hoy"
            value={avgDay === null ? "Sin dato" : formatSignedPct(avgDay, 2)}
            hint={days.length ? `${days.length} de ${slides.length} con serie` : "Sin serie todavía"}
            valueClass={changeTone(avgDay)}
          />
          <Kpi
            label="Promedio YTD"
            value={avgYtd === null ? "Sin dato" : formatSignedPct(avgYtd, 1)}
            hint={ytds.length ? `${ytds.length} de ${slides.length} con serie` : "Sin serie todavía"}
            valueClass={changeTone(avgYtd)}
          />
          <Kpi
            label="Alertas 7 días"
            value={String(alerts7d)}
            hint="de tus seguidos"
          />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        {slides.length > 0 ? (
          <FollowedCarousel slides={slides} />
        ) : (
          <div className="app-panel flex flex-col justify-center gap-3 p-6 sm:p-8">
            <p className="label-line">Tu seguimiento</p>
            <h2 className="text-[20px] font-medium tracking-[-0.025em] text-ink-900">Sigue tu primer portafolio</h2>
            <p className="max-w-md text-[13px] leading-relaxed text-ink-500">
              Aquí verás su serie, su variación y sus principales posiciones. Con dos carteras empieza el cruce de
              consenso.
            </p>
            <Link
              href="/app/explorar"
              className="mt-1 inline-flex h-10 w-fit items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-black"
            >
              Explorar portafolios
              <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        )}
        <MyHoldingsPanel data={mine} />
      </div>

      {onboarding.length > 0 && <OnboardingSuggestions suggestions={onboarding} isPro={isPro} />}

      {followed.length > 0 && (
        <FollowedPulse
          consensus={consensus}
          movers={movers}
          unlockedCount={unlockedFollowed.length}
          followedCount={followed.length}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <section className="app-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <h2 className="text-[17px] font-medium tracking-[-0.02em] text-ink-900">Últimas alertas</h2>
            {followedAlerts.length > 0 && (
              <Link
                href="/alerts"
                className="text-[12px] font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline"
              >
                Ver todas
              </Link>
            )}
          </div>
          {followedAlerts.length > 0 ? (
            <ul className="divide-y divide-line">
              {followedAlerts.slice(0, ALERTS_SHOWN).map((a) => {
                const p = byId.get(a.portfolio_id);
                const typeLabel = ALERT_LABEL[a.type];
                return (
                  <li key={a.id}>
                    <Link
                      href={p ? `/app/portafolio/${p.slug}` : "/alerts"}
                      className="block px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                    >
                      <div className="flex items-baseline gap-2 text-[11.5px] text-ink-500">
                        {typeLabel && (
                          <>
                            <span className="shrink-0">{typeLabel}</span>
                            <span aria-hidden="true" className="shrink-0 text-ink-500">
                              ·
                            </span>
                          </>
                        )}
                        <span className="min-w-0 truncate font-medium text-ink-700">
                          {a.portfolio?.name ?? p?.name ?? "Portafolio"}
                        </span>
                        <span className="ml-auto shrink-0 text-ink-500 tabular-nums">{timeAgo(a.created_at)}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-ink-900">{a.title}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-6 sm:px-5">
              <p className="text-[14px] font-medium text-ink-900">
                {followed.length > 0 ? "Sin movimientos en tus seguidos" : "Todavía no sigues carteras"}
              </p>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-500">
                {followed.length > 0
                  ? "Cuando detectemos una compra, una venta o un cambio de peso en una cartera que sigues, aparecerá aquí y te llegará por correo."
                  : "Sigue un portafolio y sus movimientos aparecerán aquí, con su tipo y su fecha."}
              </p>
              <Link
                href={followed.length > 0 ? "/app/seguimiento" : "/app/explorar"}
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-900 underline-offset-4 hover:underline"
              >
                {followed.length > 0 ? "Ver mis seguidos" : "Explorar portafolios"}
                <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              </Link>
            </div>
          )}
        </section>

        <aside className="app-panel flex flex-col overflow-hidden">
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <p className="label-line">Reglas de alerta</p>
            <h2 className="mt-1 text-[17px] font-medium tracking-[-0.02em] text-ink-900">Qué te avisamos</h2>
          </div>
          <ul className="divide-y divide-line">
            {RULES.map((r, i) => (
              <li key={r.title} className="flex gap-3 px-4 py-3 sm:px-5">
                <span className="num mt-0.5 shrink-0 text-[11px] text-ink-500">0{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink-900">{r.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{r.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-auto border-t border-line px-4 py-3 sm:px-5">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-900 underline-offset-4 hover:underline"
            >
              Configurar reglas
              <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
