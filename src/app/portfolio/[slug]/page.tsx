import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  ArrowLeft,
  Users,
  TrendingUp,
  TrendingDown,
  Crown,
  BellRing,
  Sparkles,
  Globe2,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { getPortfolioBySlug, getHoldings, getAlerts, getFollows, getProfile, isFollowing } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { FollowButton } from "@/components/follow-button";
import { CATEGORY_META } from "@/lib/types";
import { timeAgo, formatCompact } from "@/lib/utils";

export const instant = false;

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

  const [holdings, alerts, follows, profile, following] = await Promise.all([
    getHoldings(portfolio.id),
    getAlerts(portfolio.id, 10),
    getFollows(),
    getProfile(),
    isFollowing(portfolio.id),
  ]);

  const meta = CATEGORY_META[portfolio.category];
  const isPro = profile?.plan === "pro";
  const hasReturn = portfolio.return_ytd !== null;
  const positive = (portfolio.return_ytd ?? 0) >= 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-ink-200 bg-white">
        <div className="container-page py-4">
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" />
            Volver a explorar
          </Link>
        </div>
      </header>

      <main className="flex-1 bg-surface">
        {/* Portfolio header */}
        <div className="border-b border-ink-200 bg-white">
          <div className="container-page py-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="brand">{meta.label}</Badge>
                  <Badge variant="outline" className="gap-1">
                    <Globe2 className="size-3" />
                    {portfolio.country === "US" ? "Estados Unidos" : portfolio.country === "CL" ? "Chile" : "Global"}
                  </Badge>
                  {portfolio.premium && (
                    <Badge variant="warning" className="gap-1">
                      <Crown className="size-3" />
                      Pro
                    </Badge>
                  )}
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
                  {portfolio.name}
                </h1>
                <p className="mt-3 text-lg leading-relaxed text-ink-600">
                  {portfolio.description}
                </p>

                {/* Meta */}
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-600">
                  {portfolio.manager && (
                    <span>
                      Gestor: <strong className="font-medium text-ink-900">{portfolio.manager}</strong>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4 text-ink-400" />
                    <strong className="font-medium tabular-nums text-ink-900">
                      {formatCompact(portfolio.followers)}
                    </strong>{" "}
                    seguidores
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Tag className="size-4 text-ink-400" />
                    Fuente: {portfolio.source}
                  </span>
                </div>

                {/* Tags */}
                {portfolio.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {portfolio.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-600"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Follow card */}
              <Card className="w-full shrink-0 p-6 lg:w-72">
                {hasReturn && (
                  <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4">
                    <span className="text-sm text-ink-600">Retorno YTD</span>
                    <span
                      className={
                        "flex items-center gap-1 text-lg font-semibold tabular-nums " +
                        (positive ? "text-positive" : "text-negative")
                      }
                    >
                      {positive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
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
                <p className="mt-3 text-center text-xs text-ink-500">
                  {following
                    ? "Recibirás alertas por email de este portafolio."
                    : "Sigue este portafolio para recibir alertas."}
                </p>
              </Card>
            </div>
          </div>
        </div>

        <div className="container-page py-10">
          <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
            {/* Holdings */}
            <section>
              <h2 className="text-lg font-semibold text-ink-900">
                Composición ({holdings.length} activos)
              </h2>
              {holdings.length > 0 ? (
                <Card className="mt-4 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                        <th className="px-5 py-3">Activo</th>
                        <th className="px-5 py-3 text-right">Peso</th>
                        <th className="px-5 py-3 text-right">Cambio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {holdings.map((h) => {
                        const delta =
                          h.previous_weight !== null ? h.weight - h.previous_weight : null;
                        return (
                          <tr key={h.id} className="hover:bg-ink-50/50">
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-ink-900">{h.symbol}</div>
                              <div className="text-xs text-ink-500">{h.name}</div>
                            </td>
                            <td className="px-5 py-3.5 text-right font-medium tabular-nums text-ink-900">
                              {h.weight.toFixed(1)}%
                            </td>
                            <td className="px-5 py-3.5 text-right tabular-nums">
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
                </Card>
              ) : (
                <Card className="mt-4 p-10 text-center">
                  <p className="text-sm text-ink-600">
                    La composición se actualizará cuando el scraper procese la próxima
                    actualización de la fuente.
                  </p>
                </Card>
              )}
            </section>

            {/* Recent alerts */}
            <section>
              <h2 className="text-lg font-semibold text-ink-900">Alertas recientes</h2>
              {alerts.length > 0 ? (
                <div className="mt-4 flex flex-col gap-3">
                  {alerts.map((alert) => (
                    <Card key={alert.id} className="p-4">
                      <div className="flex items-center gap-2 text-xs text-ink-500">
                        <BellRing className="size-3.5 text-brand-500" />
                        {timeAgo(alert.created_at)}
                      </div>
                      <h3 className="mt-1.5 text-sm font-semibold text-ink-900">{alert.title}</h3>
                      {alert.summary ? (
                        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink-600">
                          {alert.summary}
                        </p>
                      ) : !isPro ? (
                        <p className="mt-1.5 text-xs text-ink-500">
                          <Sparkles className="mr-1 inline size-3" />
                          Resumen AI disponible en Pro
                        </p>
                      ) : null}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="mt-4 p-8 text-center">
                  <BellRing className="mx-auto size-6 text-ink-300" />
                  <p className="mt-2 text-sm text-ink-600">Sin alertas registradas aún.</p>
                </Card>
              )}
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
