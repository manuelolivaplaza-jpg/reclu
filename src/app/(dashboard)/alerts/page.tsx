import { connection } from "next/server";
import { aiEnabled } from "@/lib/ai-flags";
import { Suspense } from "react";
import { getAlerts, getFollows, getPortfolios, getProfile } from "@/lib/queries";
import { isPaidPlan, type Alert, type PortfolioCategory } from "@/lib/types";
import { roleFor } from "@/lib/access";
import { AlertsFeed, type EnrichedAlert } from "@/components/alerts-feed";
import { AlertsSkeleton } from "./alerts-skeleton";

export const metadata = { title: "Alertas" };
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

export default function AlertsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Alertas
        </h1>
        <p className="text-[14px] text-ink-500 sm:text-[15px]">
          Compras, ventas, menciones y filings 13F de los portafolios que sigues.
        </p>
      </header>
      <Suspense fallback={<AlertsSkeleton />}>
        <AlertsContent />
      </Suspense>
    </div>
  );
}

async function AlertsContent() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const [follows, profile, allPortfolios] = await Promise.all([
    getFollows(),
    getProfile(),
    getPortfolios(),
  ]);
  const isPro = isPaidPlan(profile?.plan);
  const followedIds = follows.map((f) => f.portfolio_id);

  // Muro 048: RPC `get_alerts` (topes por plan, summary solo pro/elite).
  // El resumen AI y los topes ya vienen recortados del servidor.
  const rawAlerts: Alert[] = await getAlerts(undefined, 100, {
    role: roleFor(profile),
  });

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
        cover_image: match?.cover_image ?? null,
        portrait_image: match?.portrait_image ?? null,
      },
    };
  });

  return (
    <AlertsFeed
      alerts={enrichedAlerts}
      followedIds={followedIds}
      isPro={isPro}
      aiEnabled={aiEnabled()}
    />
  );
}
