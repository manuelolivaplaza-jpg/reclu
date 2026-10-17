import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAlerts, getFollows, getPortfolios, getProfile } from "@/lib/queries";
import { isPaidPlan, type Alert, type PortfolioCategory } from "@/lib/types";
import { AlertsFeed, type EnrichedAlert } from "@/components/alerts-feed";

export const metadata = { title: "Alertas" };
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Historial de alertas
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          Operaciones declaradas, menciones públicas, rebalanceos y filings 13F con resumen AI.
        </p>
      </div>
      <Suspense fallback={<AlertsSkeleton />}>
        <AlertsContent />
      </Suspense>
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse bg-ink-100" />
      ))}
    </div>
  );
}

async function AlertsContent() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const supabase = await createClient();
  const [follows, profile, allPortfolios, globalAlerts] = await Promise.all([
    getFollows(),
    getProfile(),
    getPortfolios(),
    getAlerts(undefined, 100),
  ]);
  const isPro = isPaidPlan(profile?.plan);
  const followedIds = follows.map((f) => f.portfolio_id);

  let rawAlerts: Alert[] = globalAlerts;

  if (isSupabaseLive()) {
    const { data: dbAlerts } = await supabase
      .from("alerts")
      .select("*, portfolio:portfolios!inner(id, slug, name, category, manager)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(100);

    if (dbAlerts && dbAlerts.length > 0) {
      rawAlerts = dbAlerts as Alert[];
    }
  }

  const portfolioById = new Map(allPortfolios.map((p) => [p.id, p]));
  const portfolioBySlug = new Map(allPortfolios.map((p) => [p.slug, p]));

  const enrichedAlerts: EnrichedAlert[] = rawAlerts.map((alert) => {
    const joined = alert.portfolio as
      | {
          id?: string;
          slug?: string;
          name?: string;
          category?: PortfolioCategory;
          manager?: string | null;
        }
      | undefined;

    const match =
      portfolioById.get(alert.portfolio_id) ??
      (joined?.id ? portfolioById.get(joined.id) : undefined) ??
      (joined?.slug ? portfolioBySlug.get(joined.slug) : undefined);

    return {
      ...alert,
      portfolio: {
        id: match?.id ?? joined?.id ?? alert.portfolio_id,
        slug: match?.slug ?? joined?.slug ?? alert.portfolio_id,
        name: match?.name ?? joined?.name ?? "Portafolio",
        category: match?.category ?? joined?.category ?? "thematic",
        manager: match?.manager ?? joined?.manager ?? null,
      },
    };
  });

  return (
    <AlertsFeed
      alerts={enrichedAlerts}
      followedIds={followedIds}
      isPro={isPro}
    />
  );
}
