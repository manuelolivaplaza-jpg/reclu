import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { BellRing, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFollows, getProfile } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Alertas" };
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

const TYPE_LABEL: Record<string, string> = {
  new_trade: "Compra",
  sold_trade: "Venta",
  weight_change: "Ponderación",
  mention: "Mención",
  threshold: "Umbral",
  dividend: "Dividendo",
  earnings: "Resultados",
  "13f_update": "Filing 13F",
  scraper_error: "Sistema",
};

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          Historial de alertas
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
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
        <div key={i} className="h-28 animate-pulse bg-ink-100" />
      ))}
    </div>
  );
}

async function AlertsContent() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
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
      <div className="flex flex-col">
        {alerts.map((alert) => (
          <div key={alert.id} className="border-t border-ink-200 py-5 last:border-b">
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-500">
              <span>{TYPE_LABEL[alert.type as string] ?? "Alerta"}</span>
              <Link
                href={`/portfolio/${alert.portfolio.slug}`}
                className="text-ink-900 underline-offset-4 hover:underline"
              >
                {alert.portfolio.name}
              </Link>
              <span>{timeAgo(alert.created_at)}</span>
            </div>

            <h3 className="mt-2 text-[17px] font-medium text-ink-900">{alert.title}</h3>

            {alert.summary ? (
              <div className="mt-3 border-l-2 border-ink-900 pl-4">
                <p className="text-[13px] text-ink-500">Resumen AI</p>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-900">
                  {alert.summary}
                </p>
              </div>
            ) : !isPro ? (
              <p className="mt-3 text-[13px] text-ink-500">
                El resumen AI de esta alerta está disponible en el{" "}
                <Link href="/#precios" className="text-ink-900 underline-offset-4 hover:underline">
                  plan Pro
                </Link>
                .
              </p>
            ) : null}

            <Link
              href={`/portfolio/${alert.portfolio.slug}`}
              className="mt-3 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-900"
            >
              Ver portafolio
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border border-ink-200 p-16 text-center">
      <BellRing className="mx-auto size-8 text-ink-400" strokeWidth={1.5} />
      <p className="mt-4 text-[17px] font-medium text-ink-900">Sin alertas por ahora</p>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-500">
        Cuando un portafolio que sigas registre un cambio, la alerta aparecerá aquí y
        llegará a tu correo.
      </p>
      <Link
        href="/explore"
        className="mt-4 inline-block text-[15px] text-ink-900 underline-offset-4 hover:underline"
      >
        Explorar portafolios →
      </Link>
    </div>
  );
}
