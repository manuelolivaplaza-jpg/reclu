import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getPortfolioBySlug, getPortfolioRedirect, getHoldings, getAlerts, getProfile, isFollowing, getPerformance } from "@/lib/queries";
import { getMentions, MUSK_INSIDER_NOTICE } from "@/lib/mentions-queries";
import { getInsiderTrades, holdingsAtLatestAsOf } from "@/lib/insider-queries";
import { InsiderTradesList } from "@/components/insider-trades-list";
import { demoPerformance } from "@/lib/demo-data";
import { SiteHeader } from "@/components/site-header";
import { PortfolioDetailCharts, ChartSection } from "@/components/charts/portfolio-detail-charts";
import { PortfolioEvolution } from "@/components/charts/portfolio-evolution";
import { FollowButton } from "@/components/follow-button";
import { PaywallGate } from "@/components/paywall-gate";
import { PortfolioTools, PortfolioMetricsStrip } from "@/components/portfolio-tools";
import { PortfolioHero } from "@/components/portfolio-hero";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { PortraitCredit } from "@/components/portrait-credit";
import { LagBadge } from "@/components/lag-badge";
import { PerformancePanel } from "@/components/performance-panel";
import { PortfolioPerformanceChart } from "@/components/charts/portfolio-performance-chart";
import { getPortfolioPerformanceData } from "@/lib/performance-queries";
import { computePerformanceMetrics, fromPctToLevel } from "@/lib/performance";
import { DemoBadge } from "@/components/demo-badge";
import { JsonLd } from "@/components/json-ld";
import { CATEGORY_META, isPaidPlan, isElitePlan } from "@/lib/types";
import { roleFor, HOLDING_LIMITS } from "@/lib/access";
import { absoluteUrl } from "@/lib/site";
import { timeAgo } from "@/lib/utils";
import { lagDays, latestDisclosureStamp, publishedAtFromPayload } from "@/lib/disclosure-lag";
import { TrumpMentionsList } from "@/components/trump-mentions-list";
import { OgeTradesPanel } from "@/components/oge-trades-panel";
import { getVerifiedOgeTrades } from "@/lib/disclosure-trades";
import { isPublicDisclosureSource } from "@/lib/public-disclosure";
import { InfoprobidadEmpresas } from "@/components/infoprobidad-empresas";
import {
  getInfoprobidadEmpresas,
  INFOPROBIDAD_FUENTE,
  INFOPROBIDAD_LICENCIA_URL,
  INFOPROBIDAD_SLUG,
  INFOPROBIDAD_URL,
} from "@/lib/infoprobidad";
import {
  AFP_MODELO_SLUG,
  AVISO_DESFASE_SP,
  AVISO_SIMULACION,
  ECH_PROXY_LABEL,
  enlaceSpensiones,
  fechaCartera,
  latestAsOf,
  urlFuenteAfpModelo,
} from "@/lib/afp-fuente";
import { LegalNotice } from "@/components/legal/legal-notice";
import { SourcePanel } from "@/components/source-panels";

export const instant = false;

/** Como Promise.all, pero una consulta que falla no rompe la pagina: usa el fallback. */
async function settleAll<T extends unknown[]>(
  promises: { [K in keyof T]: Promise<T[K]> },
  fallbacks: unknown[],
): Promise<T> {
  const results = await Promise.allSettled(promises);
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn("[reclu] portfolio query failed:", (r.reason as Error)?.message ?? r.reason);
    return fallbacks[i];
  }) as unknown as T;
}

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
  const year = new Date().getFullYear();
  const esInfo = portfolio.slug === INFOPROBIDAD_SLUG;
  const title = esInfo
    ? `Empresas declaradas por autoridades — ${year} | Reclu`
    : `Qué compró ${portfolio.name} — cartera ${year} | Reclu`;
  const description = esInfo
    ? portfolio.description
    : `Composición, pesos y movimientos de ${portfolio.name}. ${portfolio.description}`;
  return {
    title,
    description,
    alternates: {
      canonical: `/portfolio/${portfolio.slug}`,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(`/portfolio/${portfolio.slug}`),
      type: "article",
      locale: "es_CL",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PortfolioDetailPage({ params }: PortfolioPageProps) {
  await connection();
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) {
    // Portafolio oculto con reemplazo real -> 308 a la versión real.
    const redirectSlug = await getPortfolioRedirect(slug);
    if (redirectSlug) permanentRedirect(`/portfolio/${redirectSlug}`);
    notFound();
  }

  // Arranca en paralelo con el perfil y las holdings.
  // Trump dice, Elon Musk dice e Inverse Cramer comparten public.mentions.
  const mentionsSource =
    portfolio.source === "trump_mentions" ||
    portfolio.source === "musk_mentions" ||
    portfolio.source === "cnbc_lightning_round"
      ? portfolio.source
      : null;
  const mentionsPromise = mentionsSource ? getMentions(portfolio.id, mentionsSource) : null;

  // El perfil determina el rol ANTES de pedir holdings/alerts: el servidor
  // solo trae lo que el plan permite (nada de difuminar datos ya entregados).
  const profile = await getProfile();
  const role = roleFor(profile);

  const esAgregado = portfolio.slug === INFOPROBIDAD_SLUG;
  const publicDisclosure = isPublicDisclosureSource(portfolio.source);
  // Form 4: el libro sale de get_portfolio_holdings (muro 012). Si quedara
  // más de un as_of por símbolo, nos quedamos con el más reciente.
  const isInsiders = portfolio.source === "sec_form4";
  const [holdingsRaw, alerts, following, performance, perfData, insiderFeed, ogeTrades, empresas] = await settleAll([
    getHoldings(portfolio.id, { role }),
    getAlerts(portfolio.id, 10, { role }),
    isFollowing(portfolio.id),
    getPerformance(portfolio.id, 365, { role, source: portfolio.source }),
    getPortfolioPerformanceData({
      portfolioId: portfolio.id,
      country: portfolio.country,
    }),
    isInsiders ? getInsiderTrades() : Promise.resolve(null),
    portfolio.source === "oge_278t" ? getVerifiedOgeTrades() : Promise.resolve([]),
    esAgregado ? getInfoprobidadEmpresas() : Promise.resolve(null),
  ], [
    [],
    [],
    false,
    [],
    {
      metrics: null,
      benchmarkSymbol: "^GSPC",
      benchmarkLabel: "S&P 500",
      portfolioSeries: [],
      benchmarkSeries: [],
      precomputed: null,
      method: "sin-datos",
    },
    null,
    [],
    null,
  ]);
  // Robustez: datos de staging/ETF pueden venir con nulos o numeric como string.
  const holdingsSafe = (Array.isArray(holdingsRaw) ? holdingsRaw : [])
    .filter((h) => h && h.symbol != null)
    .map((h) => {
      const w = Number(h.weight);
      const pw = h.previous_weight == null ? null : Number(h.previous_weight);
      const rp = h.return_pct == null ? null : Number(h.return_pct);
      return {
        ...h,
        symbol: String(h.symbol),
        name: h.name ?? "",
        weight: Number.isFinite(w) ? w : 0,
        previous_weight: pw !== null && Number.isFinite(pw) ? pw : null,
        return_pct: rp !== null && Number.isFinite(rp) ? rp : null,
      };
    });
  const holdings = isInsiders ? holdingsAtLatestAsOf(holdingsSafe) : holdingsSafe;

  const meta = CATEGORY_META[portfolio.category];
  const isPro = isPaidPlan(profile?.plan);
  const isElite = isElitePlan(profile?.plan);
  // Muro de pago real: anon top 5 + 3 alertas · free top 10 + 10 · pago todo.
  // (role ya calculado arriba; holdings/alerts vienen recortados del servidor.)
  // Modo demo: sin Supabase configurado, los holdings vienen de demo-data.
  const isDemoData = !isSupabaseLive() && holdings.length > 0;
  const locked = role === "anon" && !publicDisclosure;
  const hasReturn = portfolio.return_ytd !== null;
  const positive = (portfolio.return_ytd ?? 0) >= 0;
  const performanceReal = (Array.isArray(performance) ? performance : []).filter(
    (p) => p && typeof p.date === "string" && Number.isFinite(Number(p.value)),
  ).map((p) => ({ ...p, value: Number(p.value) }));
  const demoPoints =
    performanceReal.length === 0 && !isSupabaseLive() && portfolio.return_ytd !== null
      ? demoPerformance(portfolio.slug, portfolio.return_ytd)
      : [];
  const showEvolution = performanceReal.length > 0 || demoPoints.length > 0;
  const evolution = performanceReal.length > 0 ? performanceReal : demoPoints;
  // F5: rendimiento vs benchmark. En modo demo (sin Supabase) la serie es
  // ilustrativa: se calcula sobre demoPoints y se rotula "datos de ejemplo".
  const perfSourceSeries =
    performanceReal.length > 0 ? performanceReal : demoPoints.length > 0 ? demoPoints : [];
  const perfPanelData =
    perfData.metrics !== null || perfData.portfolioSeries.length >= 2
      ? perfData
      : perfSourceSeries.length >= 2
        ? {
            ...perfData,
            metrics: computePerformanceMetrics({ portfolio: fromPctToLevel(perfSourceSeries) }),
            portfolioSeries: perfData.portfolioSeries.length >= 2 ? perfData.portfolioSeries : [],
            method: "calculado-al-vuelo" as const,
          }
        : perfData;
  const perfDemo =
    perfPanelData.method === "calculado-al-vuelo" &&
    performanceReal.length === 0 &&
    demoPoints.length > 0;
  // Pesos actuales: dato real para la composición.
  const composition = holdings.map((holding) => ({
    symbol: holding.symbol,
    name: holding.name,
    weight: holding.weight,
  }));
  const showComposition = composition.some((slice) => Number.isFinite(slice.weight) && slice.weight > 0);
  // AFP Modelo: la fecha es el as_of más nuevo de los holdings que el
  // muro ya entregó (get_portfolio_holdings). No se lee la tabla directa.
  const esAfpModelo = portfolio.slug === AFP_MODELO_SLUG;
  const corteAfp = esAfpModelo ? latestAsOf(holdings) : null;
  const fechaAfp = esAfpModelo ? fechaCartera(corteAfp) : null;
  const fuenteAfp = esAfpModelo ? urlFuenteAfpModelo(corteAfp) : null;
  const benchmarkLabel = esAfpModelo ? ECH_PROXY_LABEL : perfPanelData.benchmarkLabel;
  const entrySeries =
    perfPanelData.portfolioSeries.length >= 2
      ? perfPanelData.portfolioSeries
      : perfSourceSeries.length >= 2
        ? fromPctToLevel(perfSourceSeries)
        : [];
  const publication = latestDisclosureStamp(alerts);

  // Serie del hero: la MISMA que ya usa la página y que el servidor recortó
  // según el plan (queries.ts / getPerformance). Nunca se lee la tabla
  // directo: si el muro no deja pasar la serie, el hero no muestra % ni tarjeta.
  const heroSource = performanceReal.length > 0 ? performanceReal : demoPoints;
  const heroSeries = heroSource.map((point) => ({
    date: point.date,
    value_pct: point.value,
  }));
  const heroDemo = performanceReal.length === 0 && demoPoints.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* SEO: Dataset + BreadcrumbList (schema.org) */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: portfolio.name,
          description: portfolio.description,
          url: absoluteUrl(`/portfolio/${portfolio.slug}`),
          inLanguage: "es-CL",
          keywords: [meta.label, ...portfolio.tags].join(", "),
          creator: portfolio.manager ? { "@type": "Person", name: portfolio.manager } : undefined,
          temporalCoverage: `${new Date().getFullYear()}`,
          license: esAgregado ? INFOPROBIDAD_LICENCIA_URL : absoluteUrl("/disclaimer"),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Inicio", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Portafolios", item: absoluteUrl("/explore") },
            {
              "@type": "ListItem",
              position: 3,
              name: portfolio.name,
              item: absoluteUrl(`/portfolio/${portfolio.slug}`),
            },
          ],
        }}
      />
      <SiteHeader />

      <main className="flex-1">
        <div className="container-page pt-6">
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-950"
          >
            <ArrowLeft className="size-4" />
            Volver a explorar
          </Link>
        </div>

        {/* Hero: nombre, variación del período y simulación de inversión */}
        <PortfolioHero
          name={portfolio.name}
          avatar={
            <>
              <PortfolioAvatar portfolio={portfolio} size={96} />
              {portfolio.portrait_image ? (
                <PortraitCredit
                  portraitSource={portfolio.portrait_source}
                  portraitLicense={portfolio.portrait_license}
                  portraitAuthor={portfolio.portrait_author}
                  className="mt-2"
                />
              ) : null}
            </>
          }
          series={heroSeries}
          followers={portfolio.followers}
          demo={heroDemo}
          action={
            <>
              <FollowButton
                portfolioId={portfolio.id}
                initialFollowing={following}
                initialIsPro={isPro}
                portfolioPremium={portfolio.premium}
                variant="page"
              />
              <p className="mt-3 text-[13px] text-neutral-500">
                {following
                  ? "Recibirás alertas por email de este portafolio."
                  : "Sigue este portafolio para recibir alertas."}
              </p>
            </>
          }
        />

        {/* Portfolio header */}
        <div className="bg-white">
          <div className="container-page py-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="label-line">
                  {meta.label} · {portfolio.country}
                  {portfolio.premium ? " · Pro" : ""}
                </p>

                {isDemoData && (
                  <p className="mt-3">
                    <DemoBadge />
                  </p>
                )}
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
                  {esAgregado ? (
                    <a
                      href={INFOPROBIDAD_URL}
                      className="text-ink-900 underline-offset-4 hover:underline"
                      rel="noreferrer"
                    >
                      {INFOPROBIDAD_FUENTE}
                    </a>
                  ) : fuenteAfp ? (
                    <a
                      href={fuenteAfp}
                      className="text-ink-900 underline-offset-4 hover:underline"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Fuente: Superintendencia de Pensiones
                    </a>
                  ) : (
                    <span>Fuente: {portfolio.source === "sec_form4" ? "SEC Form 4" : portfolio.source}</span>
                  )}
                </div>
                {esAfpModelo ? (
                  <div className="mt-5 border border-ink-200 px-4 py-3 text-[13px] leading-relaxed text-ink-500">
                    {fechaAfp ? <p>Cartera al {fechaAfp}.</p> : null}
                    <p>{AVISO_DESFASE_SP}</p>
                    <p>{AVISO_SIMULACION}</p>
                    <p>Referencia de mercado: {ECH_PROXY_LABEL}. No es el IPSA oficial.</p>
                  </div>
                ) : null}
              </div>

              {/* Retorno YTD (dato propio del portafolio) + enlace a comparar */}
              <div className="w-full shrink-0 lg:w-72">
                {hasReturn && (
                  <div className="mb-5">
                    <p className="label-line">Retorno YTD</p>
                    <span
                      className={
                        "num mt-1 block text-[1.75rem] leading-none tracking-[-0.02em] " +
                        (positive ? "text-positive" : "text-negative")
                      }
                    >
                      {positive ? "+" : ""}
                      {portfolio.return_ytd?.toFixed(1)}%
                    </span>
                  </div>
                )}
                <Link
                  href="/compare"
                  className="mt-3 inline-block text-[13px] font-medium text-ink-900 underline-offset-4 hover:underline"
                >
                  Comparar con otra cartera →
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="container-page py-10">
          {mentionsPromise ? (
            <TrumpMentionsList
              mentions={mentionsPromise}
              notice={portfolio.source === "musk_mentions" ? MUSK_INSIDER_NOTICE : undefined}
              metodologiaHref={
                portfolio.source === "musk_mentions"
                  ? "/metodologia#musk-dice"
                  : "/metodologia#trump-dice"
              }
              variant={portfolio.source === "cnbc_lightning_round" ? "cramer" : "trump"}
            />
          ) : null}

                    {esAgregado ? null : <PortfolioMetricsStrip holdings={holdings} />}

          {showEvolution && !esAgregado ? (
            <div className="mb-12">
              <ChartSection title="Evolución">
                <PortfolioEvolution data={evolution} />
              </ChartSection>
            </div>
          ) : null}

          {!esAgregado ? (
            <div className="mb-12">
              <PerformancePanel
                metrics={perfPanelData.metrics}
                portfolioSeries={perfPanelData.portfolioSeries}
                benchmarkSeries={perfPanelData.benchmarkSeries}
                benchmarkLabel={benchmarkLabel}
                method={perfDemo ? "demo" : perfPanelData.method}
                asOf={perfPanelData.precomputed?.as_of ?? null}
                demo={perfDemo}
                publishedAt={publication?.publishedAt ?? null}
                recordedAt={publication?.recordedAt ?? null}
                disclosureLagDays={publication?.lagDays ?? null}
                entrySeries={entrySeries}
              />
            </div>
          ) : null}

          {!esAgregado ? (
            <div className="mb-12">
              <PortfolioPerformanceChart
                series={entrySeries}
                benchmark={perfPanelData.benchmarkSeries}
                benchmarkLabel={benchmarkLabel}
                maxFreeDays={isPro ? null : 90}
              />
            </div>
          ) : null}

          {showComposition && !esAgregado ? (
            <div className="mb-12 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.08)] sm:p-7">
              <ChartSection>
                <PortfolioDetailCharts composition={composition} />
              </ChartSection>
            </div>
          ) : null}

          {isInsiders ? (
            <InsiderTradesList
              trades={locked ? [] : (insiderFeed?.trades ?? [])}
              demo={insiderFeed?.demo ?? false}
              locked={locked}
            />
          ) : null}

          {portfolio.source === "oge_278t" ? (
            <OgeTradesPanel trades={ogeTrades} demo={!isSupabaseLive()} />
          ) : null}

          {empresas ? (
            <InfoprobidadEmpresas rows={empresas.rows} isDemo={empresas.isDemo} />
          ) : null}

          <SourcePanel
            source={portfolio.source}
            portfolioId={portfolio.id}
            slug={portfolio.slug}
          />

          <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
            {/* Holdings — censurados sin cuenta */}
            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.08)] sm:p-7">
              <h2 className="text-[15px] font-medium text-ink-900">
                {esAgregado
                  ? `Emisoras cotizadas (${holdings.length})`
                  : `Composición${fechaAfp ? ` al ${fechaAfp}` : ""} (${Number.isFinite(HOLDING_LIMITS[role]) ? `top ${holdings.length}` : `${holdings.length} activos`})`}
              </h2>
              {esAgregado ? (
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">
                  El peso es proporcional al número de autoridades que declaran la
                  emisora. No es una cartera para copiar ni una recomendación de inversión.
                </p>
              ) : esAfpModelo ? (
                <p className="mt-2 text-[13px] text-ink-500">{AVISO_DESFASE_SP}</p>
              ) : null}

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
                              <div className="flex items-baseline gap-2">
                                <Link
                                  href={`/accion/${encodeURIComponent(h.symbol.toLowerCase())}`}
                                  className="font-medium text-ink-900 underline-offset-4 hover:underline"
                                >
                                  {h.symbol}
                                </Link>
                                {!esAgregado && h.return_pct !== null && (
                                  <span
                                    className={
                                      "num text-xs " +
                                      (h.return_pct >= 0 ? "text-positive" : "text-negative")
                                    }
                                    title="Retorno desde declaración"
                                  >
                                    {h.return_pct >= 0 ? "+" : ""}
                                    {h.return_pct.toFixed(1)}%
                                  </span>
                                )}
                              </div>
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
                    {esAgregado
                      ? "La canasta de emisoras cotizadas aparece cuando el scraper publica los pesos. Arriba está el agregado por empresa, sin fichas de personas."
                      : "La composición se actualizará cuando el scraper procese la próxima actualización de la fuente."}
                  </p>
                )}
              </PaywallGate>
            </section>

            {/* Recent alerts — censuradas sin cuenta */}
            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.08)] sm:p-7">
              <h2 className="text-[15px] font-medium text-ink-900">Alertas recientes</h2>
              <PaywallGate locked={locked} label="historial de alertas" className="mt-4">
                {alerts.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {alerts.map((alert) => {
                      const fuenteAlerta = enlaceSpensiones(alert.payload?.source_url);
                      return (
                        <div key={alert.id} className="border-l-2 border-ink-900 pl-4">
                          <p className="text-[13px] text-ink-500">{timeAgo(alert.created_at)}</p>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h3 className="text-[15px] font-medium text-ink-900">{alert.title}</h3>
                            <LagBadge
                              publishedAt={publishedAtFromPayload(alert.payload)}
                              recordedAt={alert.created_at}
                              lagDays={lagDays(alert.payload)}
                              className="font-normal leading-snug text-[#6b6b6b]"
                            />
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
                          {fuenteAlerta ? (
                            <a
                              href={fuenteAlerta}
                              className="mt-1.5 inline-block text-[13px] text-ink-900 underline-offset-4 hover:underline"
                              rel="noreferrer"
                              target="_blank"
                            >
                              Fuente: Superintendencia de Pensiones
                            </a>
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

          {/* Simulador + exportación CSV (Elite) */}
          {hasReturn && portfolio.return_ytd !== null ? (
            <PortfolioTools
              slug={portfolio.slug}
              portfolioName={portfolio.name}
              returnYtd={portfolio.return_ytd}
              holdings={holdings}
              authenticated={!!profile}
              isElite={isElite}
            />
          ) : null}

          {/* Disclaimer */}
          <p className="mt-12 border-t border-ink-200 pt-8 text-xs leading-relaxed text-ink-500">
            La información presentada proviene de fuentes públicas y tiene fines
            exclusivamente informativos. No constituye asesoría de inversión ni una
            recomendación de compra o venta de instrumentos financieros. Rentabilidades
            pasadas no garantizan resultados futuros.
          </p>
          <div className="mt-6">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </main>
    </div>
  );
}
