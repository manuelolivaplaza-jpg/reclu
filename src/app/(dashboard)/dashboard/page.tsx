import { connection } from "next/server";
import Link from "next/link";
import { BellRing, Plus, ArrowRight } from "lucide-react";
import { getFollows, getProfile } from "@/lib/queries";
import { getPortfolios } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { PortfolioCard } from "@/components/portfolio-card";
import { ButtonLink } from "@/components/ui/button";
import { FREE_PLAN_FOLLOW_LIMIT } from "@/lib/types";

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
  const suggestions = allPortfolios
    .filter((p) => !followedIds.has(p.id))
    .slice(0, 3);

  const isPro = profile?.plan === "pro";
  const limitReached = !isPro && followed.length >= FREE_PLAN_FOLLOW_LIMIT;

  // Recent alerts for followed portfolios
  const { data: recentAlerts } = await supabase
    .from("alerts")
    .select("*, portfolio:portfolios!inner(id, slug, name)")
    .eq("is_published", true)
    .in(
      "portfolio_id",
      followed.length > 0 ? followed.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"],
    )
    .order("created_at", { ascending: false })
    .limit(5);

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
                : "Desbloquea portafolios ilimitados con Pro"}
            </p>
            <p className="mt-0.5 text-sm text-ink-500">
              Resúmenes AI completos, alertas en tiempo real y portafolios premium.
            </p>
          </div>
          <ButtonLink href="/#precios" className="shrink-0">
            Ver Pro
            <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
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
                  href={`/portfolio/${alert.portfolio.slug}`}
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
          <Link href="/explore" className="text-[14px] text-ink-900 underline-offset-4 hover:underline">
            Explorar más
          </Link>
        </div>

        {followed.length > 0 ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {followed.map((portfolio) => (
              <PortfolioCard key={portfolio.id} portfolio={portfolio} isFollowing isPro={isPro} />
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center border border-ink-200 p-10 text-center">
            <Plus className="size-7 text-ink-400" strokeWidth={1.5} />
            <p className="mt-3 font-medium text-ink-900">No sigues ningún portafolio</p>
            <p className="mt-1 mb-4 max-w-sm text-sm text-ink-500">
              Explora el catálogo y sigue los portafolios que te interesen.
            </p>
            <ButtonLink href="/explore">
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
              <PortfolioCard key={portfolio.id} portfolio={portfolio} isPro={isPro} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
