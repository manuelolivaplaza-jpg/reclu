import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { aiEnabled } from "@/lib/ai-flags";
import { Suspense } from "react";
import { getAlerts, getFollows, getPortfolios, getProfile } from "@/lib/queries";
import { isPaidPlan, type Alert, type PortfolioCategory } from "@/lib/types";
import { roleFor } from "@/lib/access";
import { AlertsFeed, type EnrichedAlert } from "@/components/alerts-feed";
import { PageHeader } from "@/components/app/page-header";
import { AlertsSkeleton } from "./alerts-skeleton";

export const metadata = { title: "Alertas", robots: { index: false } };
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

const QUICK_LINKS = [
  { href: "/settings#notificaciones", label: "Ajustes de alertas" },
  { href: "/app/seguimiento", label: "Mis seguidos" },
];

export default function AlertsPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Actividad de portafolios"
        title="Alertas"
        subtitle="Compras, ventas, menciones y filings 13F. Filtra el feed por los portafolios que sigues."
        className="mb-0 border-b border-app-border pb-5 lg:mb-0"
        actions={
          <nav aria-label="Accesos rápidos" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
              >
                {link.label}
                <ArrowRight
                  aria-hidden="true"
                  className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                  strokeWidth={1.5}
                />
              </Link>
            ))}
          </nav>
        }
      />

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
