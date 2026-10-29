import { connection } from "next/server";
import Link from "next/link";
import { BellRing, Plus, ArrowRight } from "lucide-react";
import { getAlerts, getFollows, getPortfolios, getProfile, getPerformanceSeriesAdmin } from "@/lib/queries";
import { cardStatsById } from "@/lib/card-series";
import { createClient } from "@/lib/supabase/server";
import { PortfolioCard } from "@/components/portfolio-card";
import { OnboardingSuggestions } from "@/components/onboarding-suggestions";
import { ButtonLink } from "@/components/ui/button";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT, isPaidPlan } from "@/lib/types";
import { roleFor } from "@/lib/access";

export const metadata = { title: "Dashboard" };
// Auth-gated route: reads cookies at request time — never prerendered.
export const instant = false;

export default async function DashboardPage() {
  // Mark this route as dynamic (reads auth cookies) under cacheComponents.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [follows, profile, allPortfolios] = await Promise.all([
    getFollows(),
    getProfile(),
    getPortfolios(),
  ]);

  const followedIds = new Set(follows.map((f) => f.portfolio_id));
  const followed = allPortfolios.filter((p) => followedIds.has(p.id));
  // Onboarding (E3): cuando no sigue nada, los 3 más populares no seguidos.
  const onboardingSuggestions = followed.length === 0
    ? [...allPortfolios]
        .filter((p) => !followedIds.has(p.id) && !p.premium)
        .sort((a, b) => b.followers - a.followers)
        .slice(0, 3)
    : [];
  const suggestions = allPortfolios
    .filter((p) => !followedIds.has(p.id))
    .slice(0, 3);
  // D40: retorno y sparkline reales para las tarjetas (sin serie, sin cifra).
  const cardPortfolios = [...followed, ...suggestions];
  const cardStats = cardStatsById(cardPortfolios, await getPerformanceSeriesAdmin(cardPortfolios.map((p) => p.id)));

  const isPro = isPaidPlan(profile?.plan);
  const isElite = profile?.plan === "elite";
  const limitReached = !isPro && followed.length >= FREE_PLAN_FOLLOW_LIMIT;
  const proLimitReached =
    profile?.plan === "pro" && followed.length >= PRO_PLAN_FOLLOW_LIMIT;

  // Recent alerts for followed portfolios (with fallback to global/demo
  // alerts). Muro 048: las alertas se leen por la RPC `get_alerts`, que
  // recorta por plan; nunca por `select("*")` (summary está revocado).
  const role = roleFor(profile);
  const portfolioById = new Map(allPortfolios.map((p) => [p.id, p]));
  const followedAlerts =
    followed.length > 0
      ? await getAlerts(undefined, 5, {
          role,
          portfolioIds: followed.map((p) => p.id),
        })
      : [];
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

  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "ahí";

  return (
    <div className="flex flex-col gap-8">
      {/* Greeting */}
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Hola, {firstName}
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          {followed.length === 0
            ? "Sigue tu primer portafolio para empezar a recibir alertas."
            : isElite
              ? `Sigues ${followed.length} portafolios. Plan Elite: sin límite.`
              : profile?.plan === "pro"
                ? `Sigues ${followed.length} de ${PRO_PLAN_FOLLOW_LIMIT} portafolios del plan Pro.`
                : `Sigues ${followed.length} de ${FREE_PLAN_FOLLOW_LIMIT} portafolios del plan gratuito.`}
        </p>
      </div>

      {/* Free plan banner — filete negro, sin fondo de color */}
      {!isPro && (
        <div className="flex flex-col gap-4 border border-ink-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-ink-900">
              {limitReached
                ? "Alcanzaste el límite del plan gratuito"
                : "Desbloquea hasta 15 portafolios con Pro"}
            </p>
            <p className="mt-0.5 text-sm text-ink-500">
              Resúmenes AI completos, alertas en tiempo real y portafolios premium.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-4">
            <Link
              href="/upgrade?plan=elite"
              className="text-[14px] text-ink-900 underline-offset-4 hover:underline"
            >
              Plan Elite →
            </Link>
            <ButtonLink href="/upgrade?plan=pro" className="shrink-0">
              Pasar a Pro
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
      )}

      {/* Pro plan banner — límite de 15 alcanzado */}
      {proLimitReached && (
        <div className="flex flex-col gap-4 border border-ink-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-ink-900">
              Alcanzaste los {PRO_PLAN_FOLLOW_LIMIT} portafolios del plan Pro
            </p>
            <p className="mt-0.5 text-sm text-ink-500">
              Con Elite sigues portafolios ilimitados, incluidos Fondos 13F y exportación CSV.
            </p>
          </div>
          <ButtonLink href="/upgrade?plan=elite" className="shrink-0">
            Pasar a Elite
            <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
      )}

      {/* Onboarding E3: primer uso guiado cuando no sigue nada */}
      {onboardingSuggestions.length > 0 && (
        <OnboardingSuggestions suggestions={onboardingSuggestions} isPro={isPro} />
      )}

      {/* Recent alerts */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink-900">Alertas recientes</h2>
          <Link href="/alerts" className="text-[14px] text-ink-900 underline-offset-4 hover:underline">
            Ver todas
          </Link>
        </div>

        {recentAlerts && recentAlerts.length > 0 ? (
          <div className="mt-4 flex flex-col gap-4">
            {recentAlerts.map((alert) => (
              <div key={alert.id} className="border-l-2 border-ink-900 pl-4">
                <Link
                  href={`/app/portafolio/${alert.portfolio.slug}`}
                  className="text-[13px] text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
                >
                  {alert.portfolio.name}
                </Link>
                <p className="mt-1 text-[15px] font-medium text-ink-900">{alert.title}</p>
                {alert.summary && (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-500">
                    {alert.summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 border border-ink-200 p-10 text-center">
            <BellRing className="mx-auto size-7 text-ink-400" strokeWidth={1.5} />
            <p className="mt-3 font-medium text-ink-900">Sin alertas todavía</p>
            <p className="mt-1 text-sm text-ink-500">
              Sigue portafolios y te avisaremos cuando haya cambios.
            </p>
          </div>
        )}
      </section>

      {/* Followed portfolios */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-ink-900">Tus portafolios</h2>
          <Link href="/app/explorar" className="text-[14px] text-ink-900 underline-offset-4 hover:underline">
            Explorar más
          </Link>
        </div>

        {followed.length > 0 ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {followed.map((portfolio) => (
              <PortfolioCard key={portfolio.id} portfolio={portfolio} isFollowing isPro={isPro} stat={cardStats[portfolio.id]} />
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center border border-ink-200 p-10 text-center">
            <Plus className="size-7 text-ink-400" strokeWidth={1.5} />
            <p className="mt-3 font-medium text-ink-900">No sigues ningún portafolio</p>
            <p className="mt-1 mb-4 max-w-sm text-sm text-ink-500">
              Explora el catálogo y sigue los portafolios que te interesen.
            </p>
            <ButtonLink href="/app/explorar">
              Explorar portafolios
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        )}
      </section>

      {/* Suggestions */}
      {suggestions.length > 0 && !limitReached && (
        <section>
          <h2 className="text-[15px] font-medium text-ink-900">Sugerencias para ti</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((portfolio) => (
              <PortfolioCard key={portfolio.id} portfolio={portfolio} isPro={isPro} stat={cardStats[portfolio.id]} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
