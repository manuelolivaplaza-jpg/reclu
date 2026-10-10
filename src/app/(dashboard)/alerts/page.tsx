import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { BellRing, ArrowUpRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFollows, getProfile } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { AlertType } from "@/lib/types";

export const metadata = { title: "Alertas" };
// Auth-gated route: reads cookies at request time — never prerendered.
export const instant = false;

const TYPE_BADGE: Record<AlertType, { label: string; variant: "positive" | "negative" | "warning" | "brand" }> = {
  new_trade: { label: "Compra", variant: "positive" },
  sold_trade: { label: "Venta", variant: "negative" },
  weight_change: { label: "Ponderación", variant: "warning" },
  mention: { label: "Mención", variant: "brand" },
  threshold: { label: "Umbral", variant: "brand" },
};

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          Historial de alertas
        </h1>
        <p className="mt-1.5 text-ink-600">
          Todos los cambios detectados en los portafolios que sigues.
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
        <div key={i} className="h-32 animate-pulse rounded-card border border-ink-200 bg-ink-100" />
      ))}
    </div>
  );
}

async function AlertsContent() {
  // Mark this route as dynamic (reads auth cookies) under cacheComponents.
  await connection();
  const supabase = await createClient();
  const [follows, profile] = await Promise.all([getFollows(), getProfile()]);
  const isPro = profile?.plan === "pro";

  const followedIds = follows.map((f) => f.portfolio_id);

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*, portfolio:portfolios!inner(id, slug, name)")
    .eq("is_published", true)
    .in(
      "portfolio_id",
      followedIds.length > 0 ? followedIds : ["00000000-0000-0000-0000-000000000000"],
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (alerts && alerts.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {alerts.map((alert) => {
          const typeInfo = TYPE_BADGE[alert.type as AlertType] ?? TYPE_BADGE.mention;
          return (
            <Card key={alert.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                  <Link
                    href={`/portfolio/${alert.portfolio.slug}`}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    {alert.portfolio.name}
                  </Link>
                  <span className="text-xs text-ink-500">{timeAgo(alert.created_at)}</span>
                </div>
                <Link
                  href={`/portfolio/${alert.portfolio.slug}`}
                  className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900"
                >
                  Ver portafolio
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>

              <h3 className="mt-3 text-base font-semibold text-ink-900">{alert.title}</h3>

              {alert.summary ? (
                <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                    <Sparkles className="size-3.5" />
                    Resumen AI
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-brand-900/80">
                    {alert.summary}
                  </p>
                </div>
              ) : !isPro ? (
                <div className="mt-3 rounded-lg border border-dashed border-ink-300 bg-ink-50 p-4 text-center">
                  <p className="text-sm text-ink-600">
                    El resumen AI de esta alerta está disponible en el{" "}
                    <Link href="/#precios" className="font-medium text-brand-600 hover:underline">
                      plan Pro
                    </Link>
                    .
                  </p>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <Card className="p-16 text-center">
      <BellRing className="mx-auto size-10 text-ink-300" />
      <p className="mt-4 text-lg font-medium text-ink-900">Sin alertas por ahora</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
        Cuando un portafolio que sigues registre un cambio, la alerta aparecerá aquí
        y llegará a tu correo.
      </p>
      <Link
        href="/explore"
        className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        Explorar portafolios →
      </Link>
    </Card>
  );
}
