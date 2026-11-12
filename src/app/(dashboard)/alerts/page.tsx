import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    <div className="flex min-w-0 flex-col gap-6">
      <header className="border-b border-ink-200 pb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-normal text-ink-500">
              Actividad de tus seguidos
            </p>
            <h1 className="mt-3 text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
              Alertas
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
              Compras, ventas, menciones y filings 13F de los portafolios que sigues.
            </p>
          </div>
          <nav
            aria-label="Accesos rápidos"
            className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:shrink-0 sm:justify-end sm:pb-1"
          >
            <Link
              href="/settings#notificaciones"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900"
            >
              Reglas y frecuencia
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={1.5}
              />
            </Link>
            <Link
              href="/app/seguimiento"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900"
            >
              Mis seguidos
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={1.5}
              />
            </Link>
          </nav>
        </div>
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
