import { notFound, permanentRedirect } from "next/navigation";
import { slugImage } from "@/lib/portfolio-avatar";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getPortfolioBySlug, getPortfolioRedirect, getHoldings, getAlerts, getProfile, isFollowing, getPerformance, getEstimatedUntil, getPerformanceSeriesAdmin, getSymbolNamesAdmin } from "@/lib/queries";
import { getMentions, MUSK_INSIDER_NOTICE } from "@/lib/mentions-queries";
import { getInsiderTrades, holdingsAtLatestAsOf } from "@/lib/insider-queries";
import { InsiderTradesList } from "@/components/insider-trades-list";
import { demoPerformance } from "@/lib/demo-data";
import { SiteHeader } from "@/components/site-header";
import { PortfolioSectionTabs } from "@/components/portfolio-section-tabs";
import { PortfolioDetailCharts, ChartSection } from "@/components/charts/portfolio-detail-charts";
import { FollowButton } from "@/components/follow-button";
import { PaywallGate } from "@/components/paywall-gate";
import { PortfolioTools, PortfolioMetricsStrip } from "@/components/portfolio-tools";
import { PortfolioHero } from "@/components/portfolio-hero";
import { SERIES_START_BY_SLUG, clipSeriesForSlug } from "@/lib/card-series";
import { returnSinceStart } from "@/lib/returns";
import { seriesPeriodLabel } from "@/lib/simulated-investment";
import { displayHoldings, displaySymbol, sourceLabel } from "@/lib/holding-display";
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
import { roleFor, holdingLimitFor } from "@/lib/access";
import { buildComposition } from "@/lib/composition";
import { absoluteUrl } from "@/lib/site";
import { timeAgo, formatSignedPct, formatPctPlain } from "@/lib/utils";
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


/**
 * d47: ficha de portafolio compartida por /portfolio/[slug] (pública, SEO)
 * y /app/portafolio/[slug] (dentro del dashboard, sin SiteHeader).
 */
export async function PortfolioView({ slug, inApp = false }: { slug: string; inApp?: boolean }) {
  await connection();
  const base = inApp ? "/app/portafolio" : "/portfolio";
  const portfolio = await getPortfolioBySlug(slug);
  if (!portfolio) {
    // Portafolio oculto con reemplazo real -> 308 a la versión real.
    const redirectSlug = await getPortfolioRedirect(slug);
    if (redirectSlug) permanentRedirect(`${base}/${redirectSlug}`);
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
  // D40: nombres reales (Title Case, sin sufijos), lado Corto/Largo
  // consistente y símbolos de Polymarket truncados solo al mostrar.
  const missingNames = holdingsSafe
    .filter((h) => !h.name || h.name.replace(/^\s*corto\s*:\s*/i, "").trim().toUpperCase() === h.symbol.toUpperCase())
    .map((h) => h.symbol);
  const symbolNames = missingNames.length > 0 ? await getSymbolNamesAdmin(missingNames) : new Map<string, string>();
  const holdingsNamed = displayHoldings(holdingsSafe, symbolNames).map((h) => ({
    ...h,
    name: h.side ? `${h.side}${h.name ? ` · ${h.name}` : ""}` : h.name,
  }));
  const holdings = isInsiders ? holdingsAtLatestAsOf(holdingsNamed) : holdingsNamed;

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
  // D39: último snapshot, una fila por símbolo y suma 100% si la lista está
  // completa (un top-N recortado por el muro no se infla).
  const holdingLimit = holdingLimitFor(role, portfolio);
  // D55: posiciones solo para planes pagados, salvo corredoras y declaraciones oficiales.
  const holdingsLocked = holdingLimit === 0;
  const composition = buildComposition(holdings, {
    complete: !Number.isFinite(holdingLimit) || holdings.length < holdingLimit,
  }).map((slice) => ({ ...slice, symbol: displaySymbol(slice.symbol) }));
  const showComposition = composition.some((slice) => Number.isFinite(slice.weight) && slice.weight > 0);
  // AFP Modelo: la fecha es el as_of más nuevo de los holdings que el
  // muro ya entregó (get_portfolio_holdings). No se lee la tabla directa.
  const esAfpModelo = portfolio.slug === AFP_MODELO_SLUG;
  const corteAfp = esAfpModelo ? latestAsOf(holdings) : null;
  const fechaAfp = esAfpModelo ? fechaCartera(corteAfp) : null;
  const fuenteAfp = esAfpModelo ? urlFuenteAfpModelo(corteAfp) : null;
  const benchmarkLabel = esAfpModelo ? ECH_PROXY_LABEL : perfPanelData.benchmarkLabel;
  const estimatedUntil = await getEstimatedUntil(portfolio.id);
  // Título, gráfico y YTD salen de la MISMA serie (portfolio_performance vía
  // getPerformance). La serie precalculada de métricas solo es respaldo.
  const entrySeries =
    perfSourceSeries.length >= 2
      ? fromPctToLevel(perfSourceSeries)
      : perfPanelData.portfolioSeries.length >= 2
        ? perfPanelData.portfolioSeries
        : [];
  const seriesYtd = ytdFromSeries(perfSourceSeries);
  const publication = latestDisclosureStamp(alerts);

  // Serie del hero: la MISMA que ya usa la página y que el servidor recortó
  // según el plan (queries.ts / getPerformance). Nunca se lee la tabla
  // directo: si el muro no deja pasar la serie, el hero no muestra % ni tarjeta.
  // D40: portafolios con inicio oficial (Trump dice, desde 07-08-2025) usan
  // la serie completa recortada a ese inicio: misma cifra que home y /trump-dice.
  const officialStart = SERIES_START_BY_SLUG[portfolio.slug];
  const officialSeries = officialStart
    ? clipSeriesForSlug(portfolio.slug, (await getPerformanceSeriesAdmin([portfolio.id])).get(portfolio.id) ?? [])
    : [];
  const heroSource =
    officialSeries.length >= 2 ? officialSeries : performanceReal.length > 0 ? performanceReal : demoPoints;
  const heroSeries = heroSource.map((point) => ({
    date: point.date,
    value_pct: point.value,
  }));
  const heroDemo = performanceReal.length === 0 && demoPoints.length > 0;
  // d69: "desde el inicio" = serie COMPLETA (misma fuente que explore/home),
  // compuesta. Solo se envía la cifra agregada, no la serie (muro intacto).
  const fullSeries = officialSeries.length >= 2
    ? officialSeries
    : heroDemo
      ? []
      : clipSeriesForSlug(portfolio.slug, (await getPerformanceSeriesAdmin([portfolio.id])).get(portfolio.id) ?? []);
  const inceptionPct = fullSeries.length >= 2 ? returnSinceStart(fullSeries) : null;
  const heroHeadline =
    inceptionPct !== null && heroSeries.length >= 2
      ? { pct: inceptionPct, label: seriesPeriodLabel(fullSeries) }
      : null;

  return (
    <div className={inApp ? "flex flex-col" : "flex min-h-screen flex-col"}>
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
      {inApp ? null : <SiteHeader />}

      <main className="flex-1">
        <div className="container-page pt-6">
          <Link
            href={inApp ? "/app/explorar" : "/explore"}
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
              {portfolio.portrait_image && !slugImage(portfolio.slug) ? (
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
          headline={heroHeadline}
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

        {inApp ? <PortfolioSectionTabs /> : null}

        {/* Portfolio header */}
        <div id="resumen" className="scroll-mt-28 bg-white">
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
                    <span>Fuente: {sourceLabel(portfolio.source)}</span>
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
                {seriesYtd !== null ? (
                  <div className="mb-5">
                    <p className="label-line">Retorno YTD (serie)</p>
                    <span
                      className={
                        "num mt-1 block text-[1.75rem] leading-none tracking-[-0.02em] " +
                        (seriesYtd >= 0 ? "text-positive" : "text-negative")
                      }
                    >
                      {formatSignedPct(seriesYtd)}
                    </span>
                  </div>
                ) : hasReturn && holdings.length > 0 ? (
                  <div className="mb-5">
                    <p className="label-line">Retorno YTD estimado (posiciones actuales)</p>
                    <span
                      className={
                        "num mt-1 block text-[1.75rem] leading-none tracking-[-0.02em] " +
                        (positive ? "text-positive" : "text-negative")
                      }
                    >
                      {formatSignedPct(portfolio.return_ytd)}
                    </span>
                  </div>
                ) : null}
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

                    {esAgregado || holdingsLocked || holdings.length === 0 ? null : <PortfolioMetricsStrip holdings={holdings} />}

          {/* d68: el gráfico principal es el del hero (selector 1D–Máx); se quitó la "Evolución" duplicada. */}

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
                estimatedUntil={estimatedUntil}
              />
            </div>
          ) : null}

          {showComposition && !esAgregado ? (
            <div className="mb-12 rounded-2xl bg-white p-5 shadow-app-raised sm:p-7">
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
            <section id="posiciones" className="scroll-mt-28 rounded-2xl bg-white p-5 shadow-app-raised sm:p-7">
              <h2 className="text-[15px] font-medium text-ink-900">
                {esAgregado
                  ? `Emisoras cotizadas (${holdings.length})`
                  : `Composición${fechaAfp ? ` al ${fechaAfp}` : ""} (${holdingsLocked ? "solo suscriptores" : Number.isFinite(holdingLimit) ? `top ${holdings.length}` : `${holdings.length} activos`})`}
              </h2>
              {esAgregado ? (
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">
                  El peso es proporcional al número de autoridades que declaran la
                  emisora. No es una cartera para copiar ni una recomendación de inversión.
                </p>
              ) : esAfpModelo ? (
                <p className="mt-2 text-[13px] text-ink-500">{AVISO_DESFASE_SP}</p>
              ) : null}

              <PaywallGate locked={holdingsLocked} mode={role === "anon" ? "signup" : "upgrade"} label="las posiciones" className="mt-4">
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
                                  {h.displaySymbol}
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
                                    {formatPctPlain(h.return_pct, 1)}
                                  </span>
                                )}
                              </div>
                              <div className="text-[13px] text-ink-500">{h.name}</div>
                            </td>
                            <td className="py-3.5 text-right font-medium tabular-nums text-ink-900">
                              {formatPctPlain(h.weight, 1)}
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
            <section id="movimientos" className="scroll-mt-28 rounded-2xl bg-white p-5 shadow-app-raised sm:p-7">
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

/** Retorno del año en curso desde la serie (value_pct acumulado); null si no cubre. */
function ytdFromSeries(points: { date: string; value: number }[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const start = `${new Date().getUTCFullYear()}-01-01`;
  const base = [...sorted].reverse().find((p) => p.date < start);
  const last = sorted[sorted.length - 1];
  if (!base || last.date < start) return null;
  const b = 1 + base.value / 100;
  if (b <= 0) return null;
  const v = ((1 + last.value / 100) / b - 1) * 100;
  return Number.isFinite(v) ? v : null;
}
