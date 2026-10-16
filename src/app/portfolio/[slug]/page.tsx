import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getPortfolioBySlug, getHoldings, getAlerts, getProfile, isFollowing, getPerformance } from "@/lib/queries";
import { demoPerformance } from "@/lib/demo-data";
import { SiteHeader } from "@/components/site-header";
import { PortfolioDetailCharts, ChartSection } from "@/components/charts/portfolio-detail-charts";
import { PortfolioEvolution } from "@/components/charts/portfolio-evolution";
import { FollowButton } from "@/components/follow-button";
import { PaywallGate } from "@/components/paywall-gate";
import { CATEGORY_META } from "@/lib/types";
import { timeAgo, formatCompact } from "@/lib/utils";
import { disclosureLagLabel } from "@/lib/disclosure-lag";

export const instant = false;

/** Misma regla que queries.ts: sin URL real, el sitio está en modo demo. */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

interface PortfolioPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PortfolioPageProps) {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) return { title: "Portafolio no encontrado" };
  return {
    title: portfolio.name,
    description: portfolio.description,
  };
}

export default async function PortfolioDetailPage({ params }: PortfolioPageProps) {
  await connection();
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) notFound();

  const [holdings, alerts, profile, following, performance] = await Promise.all([
    getHoldings(portfolio.id),
    getAlerts(portfolio.id, 10),
    getProfile(),
    isFollowing(portfolio.id),
    getPerformance(portfolio.id),
  ]);

  const meta = CATEGORY_META[portfolio.category];
  const isPro = profile?.plan === "pro";
  // Sin cuenta => tabla de acciones, heatmap, comparación y alertas van censurados.
  // El retorno YTD y la evolución (real, o ilustrativa en demo) quedan visibles.
  const locked = !profile;
  const hasReturn = portfolio.return_ytd !== null;
  const positive = (portfolio.return_ytd ?? 0) >= 0;
  const performanceReal = performance;
  const demoPoints =
    performanceReal.length === 0 && !isSupabaseLive()
      ? demoPerformance(portfolio.slug, portfolio.return_ytd ?? 0)
      : [];
  const showEvolution = performanceReal.length > 0 || demoPoints.length > 0;
  const evolution = performanceReal.length > 0 ? performanceReal : demoPoints;
  // Pesos actuales: dato real para la composición.
  const composition = holdings.map((holding) => ({
    symbol: holding.symbol,
    weight: holding.weight,
  }));
  const showComposition = composition.some((slice) => Number.isFinite(slice.weight) && slice.weight > 0);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Portfolio header */}
        <div className="border-b border-ink-200 bg-white">
          <div className="container-page py-10">
            <Link
              href="/explore"
              className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
            >
              <ArrowLeft className="size-4" />
              Volver a explorar
            </Link>
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="label-line">
                  {meta.label} · {portfolio.country}
                  {portfolio.premium ? " · Pro" : ""}
                </p>

                <h1 className="type-section mt-3 text-ink-900">{portfolio.name}</h1>
                <p className="type-body mt-4">
                  {portfolio.description}
                </p>

                {/* Meta */}
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
                  {portfolio.manager && (
                    <span>
                      Gestor: <span className="text-ink-900">{portfolio.manager}</span>
                    </span>
                  )}
                  <span>
                    <span className="num text-ink-900">{formatCompact(portfolio.followers)}</span>{" "}
                    seguidores
                  </span>
                  <span>Fuente: {portfolio.source}</span>
                </div>
              </div>

              {/* Retorno YTD + follow */}
              <div className="w-full shrink-0 lg:w-72">
                {hasReturn && (
                  <div className="mb-5 border-b border-ink-200 pb-4">
                    <p className="label-line">Retorno YTD</p>
                    <span
                      className={
                        "num mt-1 block text-[clamp(2.5rem,5vw,3.5rem)] leading-none " +
                        (positive ? "text-positive" : "text-negative")
                      }
                    >
                      {positive ? "+" : ""}
                      {portfolio.return_ytd?.toFixed(1)}%
                    </span>
                  </div>
                )}
                <FollowButton
                  portfolioId={portfolio.id}
                  initialFollowing={following}
                  initialIsPro={isPro}
                  portfolioPremium={portfolio.premium}
                  variant="page"
                />
                <p className="mt-3 text-[13px] text-ink-500">
                  {following
                    ? "Recibirás alertas por email de este portafolio."
                    : "Sigue este portafolio para recibir alertas."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="container-page py-10">
          {showEvolution ? (
            <div className="mb-12">
              <ChartSection title="Evolución">
                <PortfolioEvolution data={evolution} />
              </ChartSection>
            </div>
          ) : null}

          {showComposition ? (
            <div className="mb-12">
              <ChartSection>
                <PortfolioDetailCharts composition={composition} />
              </ChartSection>
            </div>
          ) : null}

          <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
            {/* Holdings — censurados sin cuenta */}
            <section>
              <h2 className="text-[15px] font-medium text-ink-900">
                Composición ({holdings.length} activos)
              </h2>

              <PaywallGate locked={locked} label="composición" className="mt-4">
                {holdings.length > 0 ? (
                  <table className="w-full text-[15px]">
                    <thead>
                      <tr className="border-b border-ink-200 text-left text-[13px] text-ink-500">
                        <th className="py-3 font-normal">Activo</th>
                        <th className="py-3 text-right font-normal">Peso</th>
                        <th className="py-3 text-right font-normal">Cambio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h) => {
                        const delta =
                          h.previous_weight !== null ? h.weight - h.previous_weight : null;
                        return (
                          <tr key={h.id} className="border-b border-ink-200">
                            <td className="py-3.5">
                              <div className="font-medium text-ink-900">{h.symbol}</div>
                              <div className="text-[13px] text-ink-500">{h.name}</div>
                            </td>
                            <td className="py-3.5 text-right font-medium tabular-nums text-ink-900">
                              {h.weight.toFixed(1)}%
                            </td>
                            <td className="py-3.5 text-right tabular-nums">
                              {delta !== null && delta !== 0 ? (
                                <span className={delta > 0 ? "text-positive" : "text-negative"}>
                                  {delta > 0 ? "+" : ""}
                                  {delta.toFixed(1)} pp
                                </span>
                              ) : (
                                <span className="text-ink-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-4 text-[15px] text-ink-500">
                    La composición se actualizará cuando el scraper procese la próxima
                    actualización de la fuente.
                  </p>
                )}
              </PaywallGate>
            </section>

            {/* Recent alerts — censuradas sin cuenta */}
            <section>
              <h2 className="text-[15px] font-medium text-ink-900">Alertas recientes</h2>
              <PaywallGate locked={locked} label="historial de alertas" className="mt-4">
                {alerts.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {alerts.map((alert) => {
                      const lag = disclosureLagLabel(alert.payload);
                      return (
                        <div key={alert.id} className="border-l-2 border-ink-900 pl-4">
                          <p className="text-[13px] text-ink-500">{timeAgo(alert.created_at)}</p>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h3 className="text-[15px] font-medium text-ink-900">{alert.title}</h3>
                            {lag ? (
                              <p className="text-[13px] font-normal leading-snug text-[#6b6b6b]">
                                {lag}
                              </p>
                            ) : null}
                          </div>
                          {alert.summary ? (
                            <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink-500">
                              {alert.summary}
                            </p>
                          ) : !isPro ? (
                            <p className="mt-1.5 text-[13px] text-ink-500">
                              Resumen AI disponible en Pro
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-[15px] text-ink-500">Sin alertas registradas aún.</p>
                )}
              </PaywallGate>
            </section>
          </div>

          {/* Disclaimer */}
          <p className="mt-12 border-t border-ink-200 pt-8 text-xs leading-relaxed text-ink-500">
            La información presentada proviene de fuentes públicas y tiene fines
            exclusivamente informativos. No constituye asesoría de inversión ni una
            recomendación de compra o venta de instrumentos financieros. Rentabilidades
            pasadas no garantizan resultados futuros.
          </p>
        </div>
      </main>
    </div>
  );
}
