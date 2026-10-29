import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAlerts, getFollows, getPortfolios, getProfile, getPerformanceSeriesAdmin } from "@/lib/queries";
import { cardStatsById } from "@/lib/card-series";
import { createClient } from "@/lib/supabase/server";
import { OnboardingSuggestions } from "@/components/onboarding-suggestions";
import { KpiStrip, pctKpi } from "@/components/dashboard/kpi-strip";
import { FollowedList } from "@/components/dashboard/followed-list";
import { AlertsPreview } from "@/components/dashboard/alerts-preview";
import { UpgradeBanner } from "@/components/dashboard/upgrade-banner";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT, isPaidPlan } from "@/lib/types";
import { roleFor } from "@/lib/access";

export const metadata = { title: "Resumen" };
// Auth-gated route: reads cookies at request time — never prerendered.
export const instant = false;

const DAY = 86_400_000;

function SectionHead({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-500 hover:text-ink-900">
          {cta}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  await connection();
  const supabase = await createClient();

  const [{ data: { user } }, follows, profile, allPortfolios] = await Promise.all([
    supabase.auth.getUser(),
    getFollows(),
    getProfile(),
    getPortfolios(),
  ]);

  const followedIds = new Set(follows.map((f) => f.portfolio_id));
  const followed = allPortfolios.filter((p) => followedIds.has(p.id));
  const onboardingSuggestions =
    followed.length === 0
      ? [...allPortfolios]
          .filter((p) => !followedIds.has(p.id) && !p.premium)
          .sort((a, b) => b.followers - a.followers)
          .slice(0, 3)
      : [];
  const suggestions = allPortfolios.filter((p) => !followedIds.has(p.id)).slice(0, 3);
  const cardPortfolios = [...followed, ...suggestions];

  const isPro = isPaidPlan(profile?.plan);
  const isElite = profile?.plan === "elite";
  const limitReached = !isPro && followed.length >= FREE_PLAN_FOLLOW_LIMIT;
  const proLimitReached = profile?.plan === "pro" && followed.length >= PRO_PLAN_FOLLOW_LIMIT;
  const role = roleFor(profile);

  // Series y alertas en paralelo (d36/d40: misma query única de series; RPC get_alerts por plan).
  const [series, followedAlerts] = await Promise.all([
    getPerformanceSeriesAdmin(cardPortfolios.map((p) => p.id)),
    followed.length > 0 ? getAlerts(undefined, 5, { role, portfolioIds: followed.map((p) => p.id) }) : Promise.resolve([]),
  ]);
  const cardStats = cardStatsById(cardPortfolios, series);

  const portfolioById = new Map(allPortfolios.map((p) => [p.id, p]));
  const alertWithPortfolio = (alert: (typeof followedAlerts)[number]) => {
    const matched = portfolioById.get(alert.portfolio_id);
    return {
      ...alert,
      portfolio: alert.portfolio ?? {
        id: matched?.id ?? alert.portfolio_id,
        slug: matched?.slug ?? "pelosi-tracker",
        name: matched?.name ?? "Portafolio",
      },
    };
  };
  const recentAlerts =
    followedAlerts.length > 0
      ? followedAlerts.map(alertWithPortfolio)
      : (await getAlerts(undefined, 5, { role })).map(alertWithPortfolio);

  // KPIs: solo cifras reales. Retorno promedio = media simple de los seguidos con serie real.
  const realPcts = followed
    .map((p) => cardStats[p.id]?.pct ?? null)
    .filter((v): v is number => v !== null);
  const avgPct = realPcts.length > 0 ? realPcts.reduce((a, b) => a + b, 0) / realPcts.length : null;
  const now = Date.now();
  const alerts7d = followedAlerts.filter((a) => now - new Date(a.created_at).getTime() <= 7 * DAY).length;
  // Se leen solo las 5 últimas: si las 5 son de la semana, puede haber más.
  const alerts7dLabel = alerts7d >= 5 ? "5+" : String(alerts7d);

  const limit = isElite ? null : profile?.plan === "pro" ? PRO_PLAN_FOLLOW_LIMIT : FREE_PLAN_FOLLOW_LIMIT;
  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "ahí";

  return (
    <div className="flex flex-col gap-7 sm:gap-9">
      <header>
        <p className="text-[13px] text-ink-500">Hola, {firstName}</p>
        <h1 className="mt-0.5 text-[28px] font-semibold tracking-[-0.03em] text-ink-900 sm:text-[32px]">Resumen</h1>
      </header>

      <KpiStrip
        items={[
          {
            label: "Seguidos",
            value: String(followed.length),
            hint: limit === null ? "Elite · sin límite" : `de ${limit} en tu plan`,
          },
          {
            label: "Retorno promedio",
            ...pctKpi(avgPct),
            hint: avgPct === null ? "Sin serie real" : `${realPcts.length} con serie real`,
          },
          {
            label: "Alertas 7 días",
            value: followed.length === 0 ? "—" : alerts7dLabel,
            hint: "de tus seguidos",
          },
        ]}
      />

      {onboardingSuggestions.length > 0 && (
        <OnboardingSuggestions suggestions={onboardingSuggestions} isPro={isPro} />
      )}

      {followed.length > 0 && (
        <section>
          <SectionHead title="Tus portafolios" href="/explore" cta="Explorar" />
          <FollowedList portfolios={followed} stats={cardStats} isPro={isPro} />
        </section>
      )}

      <section>
        <SectionHead title="Alertas recientes" href="/alerts" cta="Ver todas" />
        <AlertsPreview alerts={recentAlerts} />
      </section>

      {!isPro && (
        <UpgradeBanner
          storageKey="reclu:upgrade-banner:pro"
          title={limitReached ? "Alcanzaste el límite del plan gratuito" : "Hasta 15 portafolios con Pro"}
          body="Resúmenes AI completos, alertas en tiempo real y portafolios premium."
          href="/upgrade?plan=pro"
          cta="Pasar a Pro"
        />
      )}
      {proLimitReached && (
        <UpgradeBanner
          storageKey="reclu:upgrade-banner:elite"
          title={`Alcanzaste los ${PRO_PLAN_FOLLOW_LIMIT} portafolios de Pro`}
          body="Con Elite sigues portafolios ilimitados, Fondos 13F y exportación CSV."
          href="/upgrade?plan=elite"
          cta="Pasar a Elite"
        />
      )}

      {suggestions.length > 0 && !limitReached && followed.length > 0 && (
        <section>
          <SectionHead title="Sugerencias para ti" href="/explore" cta="Ver más" />
          <FollowedList portfolios={suggestions} stats={cardStats} following={false} isPro={isPro} />
        </section>
      )}
    </div>
  );
}
