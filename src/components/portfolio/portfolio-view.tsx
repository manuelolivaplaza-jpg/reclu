import { notFound, permanentRedirect } from "next/navigation";
import type { ElementType } from "react";
import { slugImage } from "@/lib/portfolio-avatar";
import { connection } from "next/server";
import Link from "next/link";
import { getPortfolioBySlug, getPortfolioRedirect, getHoldings, getAlerts, getProfile, isFollowing, getPerformance, getEstimatedUntil, getPerformanceSeriesAdmin, getSymbolNamesAdmin } from "@/lib/queries";
import { getMentions, MUSK_INSIDER_NOTICE } from "@/lib/mentions-queries";
import { getInsiderTrades, holdingsAtLatestAsOf } from "@/lib/insider-queries";
import { InsiderTradesList } from "@/components/insider-trades-list";
import { demoPerformance } from "@/lib/demo-data";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PortfolioSectionTabs } from "@/components/portfolio-section-tabs";
import { PortfolioDetailCharts } from "@/components/charts/portfolio-detail-charts";
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
import { PortfolioRelated } from "@/components/portfolio-related";
import { CATEGORY_META, isPaidPlan, isElitePlan } from "@/lib/types";
import { roleFor, holdingLimitFor } from "@/lib/access";
import { buildComposition } from "@/lib/composition";
import { PortfolioXray } from "@/components/portfolio/portfolio-xray";
import { ExposurePanel } from "@/components/portfolio/exposure-panel";
import { absoluteUrl, siteUrl } from "@/lib/site";
import { BRAND_NAME } from "@/lib/brand";
import { timeAgo, formatSignedPct, formatPctPlain, formatDecimal, formatShortDate } from "@/lib/utils";
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
import { aiEnabled } from "@/lib/ai-flags";
import { groupBySymbol, latestSnapshot } from "@/lib/composition";


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
  // d80: dentro de AppShell el shell ya aplica su gutter (px-4/sm:px-6/lg:px-8) y
  // un ancho máximo de 1400px. Sumarle container-page duplicaba el padding-inline
  // y ensanchaba la ficha más que el resto de la app; en público el lienzo sigue
  // siendo container-page.
  const gutter = inApp ? "w-full" : "container-page";
  const blockPad = inApp ? "py-8" : "py-10";
  // Dentro de la app el AppShell ya envuelve el contenido en <main id="main">:
  // la ficha usa un div para no anidar landmarks ni repetir el id.
  const MainTag: ElementType = inApp ? "div" : "main";
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

  // Tabla de posiciones: último snapshot y una fila por símbolo (sin "INTC INTC").
  const holdingsTable = groupBySymbol(latestSnapshot(holdings));
  // Sin dato no hay celda: peso y cambio solo si hay cifras reales que mostrar.
  const hasWeightData = holdingsTable.some((h) => Number.isFinite(h.weight) && h.weight > 0);
  const hasChangeData = holdingsTable.some((h) => h.previous_weight !== null);
  const aiOn = aiEnabled();
  const meta = CATEGORY_META[portfolio.category];
  const isPro = isPaidPlan(profile?.plan);
  const isElite = isElitePlan(profile?.plan);
  // Muro de pago real: anon top 5 + 3 alertas · free top 10 + 10 · pago todo.
  // (role ya calculado arriba; holdings/alerts vienen recortados del servidor.)
  // Modo demo: sin Supabase configurado, los holdings vienen de demo-data.
  const isDemoData = !isSupabaseLive() && holdings.length > 0;
  const locked = role === "anon" && !publicDisclosure;
  // Sin retorno real no hay cifra: ni 0 por defecto ni un "—" de relleno.
  const portfolioYtd =
    typeof portfolio.return_ytd === "number" && Number.isFinite(portfolio.return_ytd)
      ? portfolio.return_ytd
      : null;
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
  // Si la lista visible topa justo con el límite del plan, la lectura de
  // concentración corresponde al top visible y no a la cartera completa.
  const isPartialTop = holdingLimit > 0 && holdingsTable.length >= holdingLimit;
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
  // Cifra única de retorno en el resumen: manda la serie; el YTD declarado solo
  // si hay posiciones visibles que lo respalden. Sin dato no hay bloque.
  const ytdValue =
    seriesYtd !== null
      ? seriesYtd
      : portfolioYtd !== null && holdings.length > 0
        ? portfolioYtd
        : null;
  const ytdIsEstimate = seriesYtd === null;
  // Simulador: sin retorno real no hay bloque (nunca un 0 de relleno).
  const toolReturnYtd =
    seriesYtd !== null ? seriesYtd : holdingsTable.length > 0 ? portfolioYtd : null;
  const publication = latestDisclosureStamp(alerts);
  // Corte real de la tabla: el as_of más nuevo que ya traen los holdings (la
  // misma fecha que usa get_portfolio_holdings). En demo no se muestra: esas
  // posiciones son ilustrativas y no cuentan como dato.
  const corteVisible = isDemoData
    ? ""
    : holdings.reduce((latest, holding) => {
        const day = holding.as_of ? String(holding.as_of).slice(0, 10) : "";
        return day > latest ? day : latest;
      }, "");
  const corteLabel = corteVisible ? formatShortDate(corteVisible) : "";
  // d80: segunda línea de la sección Posiciones (corte, alcance del plan y
  // comparación). Solo piezas con dato real: nada de "0 activos" ni relleno.
  const compositionMeta = [
    esAfpModelo && fechaAfp
      ? `Corte al ${fechaAfp}`
      : corteLabel
        ? `Corte al ${corteLabel}`
        : null,
    esAgregado
      ? holdings.length > 0
        ? `${holdings.length} ${holdings.length === 1 ? "emisora" : "emisoras"}`
        : null
      : holdings.length > 0
        ? Number.isFinite(holdingLimit)
          ? `Top ${holdings.length} por peso`
          : `${holdings.length} activos por peso`
        : null,
    !esAgregado && !holdingsLocked && hasChangeData ? "Comparado con el corte anterior" : null,
  ]
    .filter((part): part is string => !!part)
    .join(" · ");
  // Escala de la micro-barra de peso: relativa a la mayor posición de la tabla.
  const maxTableWeight =
    holdingsTable.reduce(
      (max, h) => (Number.isFinite(h.weight) && h.weight > max ? h.weight : max),
      0,
    ) || 1;

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

  // Cobertura temporal del Dataset: primer y último punto REALES de la serie
  // más el as_of declarado. Nunca el año en curso ni la serie de ejemplo: en
  // modo demo los holdings son ilustrativos y no cuentan como dato.
  const coverageDates: string[] = performanceReal.map((point) => point.date);
  if (coverageDates.length === 0) {
    coverageDates.push(...perfPanelData.portfolioSeries.map((point) => point.date));
  }
  if (!isDemoData) {
    coverageDates.push(...holdings.map((holding) => holding.as_of));
  }

  return (
    <div className={inApp ? "flex flex-col" : "flex min-h-screen flex-col"}>
      {/* SEO: Dataset + BreadcrumbList (schema.org) */}
      <JsonLd
        data={buildPortfolioDataset({
          slug: portfolio.slug,
          name: portfolio.name,
          description: portfolio.description,
          category: portfolio.category,
          categoryLabel: meta?.label ?? null,
          tags: portfolio.tags,
          manager: portfolio.manager,
          source: portfolio.source,
          updatedAt: portfolio.updated_at,
          licenseUrl: esAgregado ? INFOPROBIDAD_LICENCIA_URL : absoluteUrl("/disclaimer"),
          baseUrl: siteUrl(),
          brandName: BRAND_NAME,
          dates: coverageDates,
        })}
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

      <MainTag id={inApp ? undefined : "main"} className="flex-1">
        <div className={gutter + " pt-5"}>
          <Link
            href={inApp ? "/app/explorar" : "/explore"}
            className="inline-flex items-baseline gap-2 text-[13px] text-ink-500 transition-colors hover:text-ink-900"
          >
            <span aria-hidden="true">←</span>
            Volver a explorar
          </Link>
        </div>

        {/* Hero: nombre, variación del período y simulación de inversión.
            Dentro de la app el hero no vuelve a abrir lienzo: AppShell ya puso
            el gutter, así que se anulan sus container-page internos (el `!`
            hace falta porque el gutter de container-page en md+ vive en una
            regla sin @layer en globals.css). El H1 se escala desde acá: es el
            título de la ficha y no se duplica en el cuerpo. */}
        <div
          className={
            (inApp ? "[&_.container-page]:max-w-none [&_.container-page]:px-0! " : "") +
            "[&_h1]:text-[clamp(2rem,4.6vw,3.25rem)] [&_h1]:font-medium [&_h1]:tracking-[-0.04em]"
          }
        >
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
                <p className="mt-3 text-[13px] text-ink-500">
                  {following
                    ? "Recibirás alertas por email de este portafolio."
                    : "Sigue este portafolio para recibir alertas."}
                </p>
              </>
            }
          />
        </div>

        {inApp ? <PortfolioSectionTabs /> : null}

        {/* Resumen: qué es la cartera y cuánto rinde. El retorno es la segunda
            pieza tipográfica de la ficha: primero en móvil, a la derecha en
            desktop, separado por un filete. */}
        <div id="resumen" className="scroll-mt-28">
          <div className={gutter + " " + blockPad}>
            <div
              className={
                "grid gap-6 " +
                (ytdValue !== null
                  ? "lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-16"
                  : "")
              }
            >
              <div
                className={
                  "min-w-0 max-w-2xl " + (ytdValue !== null ? "order-2 lg:order-1" : "")
                }
              >
                <p className="label-line">
                  {[meta?.label, portfolio.country, portfolio.premium ? "Pro" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>

                {isDemoData ? (
                  <div className="mt-3">
                    <DemoBadge />
                  </div>
                ) : null}

                {portfolio.description?.trim() ? (
                  <p className="type-body mt-4">{portfolio.description}</p>
                ) : null}

                {/* Fuente y gestor: datos de la ficha, no una fila de fichas. */}
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-500">
                  {portfolio.manager ? (
                    <span>
                      Gestor: <span className="text-ink-900">{portfolio.manager}</span>
                    </span>
                  ) : null}
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
                  ) : sourceLabel(portfolio.source) ? (
                    <span>Fuente: {sourceLabel(portfolio.source)}</span>
                  ) : null}
                </div>

                {esAfpModelo ? (
                  <div className="mt-5 space-y-1 border border-line px-4 py-3 text-[13px] leading-relaxed text-ink-500">
                    {fechaAfp ? <p>Cartera al {fechaAfp}.</p> : null}
                    <p>{AVISO_DESFASE_SP}</p>
                    <p>{AVISO_SIMULACION}</p>
                    <p>Referencia de mercado: {ECH_PROXY_LABEL}. No es el IPSA oficial.</p>
                  </div>
                ) : null}

                {ytdValue === null ? (
                  <Link
                    href="/compare"
                    className="mt-5 inline-block text-[13px] text-ink-900 underline-offset-4 hover:underline"
                  >
                    Comparar con otra cartera{" "}
                    <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>

              {ytdValue !== null ? (
                <div className="order-1 min-w-0 border-b border-line pb-6 lg:order-2 lg:border-b-0 lg:border-l lg:pb-0 lg:pl-8">
                  <p className="label-line">
                    {ytdIsEstimate ? "Retorno YTD estimado" : "Retorno YTD"}
                  </p>
                  <p
                    className={
                      "num mt-2 text-[clamp(2rem,4.2vw,2.5rem)] leading-none " +
                      (ytdValue >= 0 ? "text-positive" : "text-negative")
                    }
                  >
                    {formatSignedPct(ytdValue)}
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                    {ytdIsEstimate
                      ? "Estimado con las posiciones y precios del último corte."
                      : "Calculado sobre la serie de precios del portafolio, en lo que va del año."}
                  </p>
                  <Link
                    href="/compare"
                    className="mt-5 inline-block text-[13px] text-ink-900 underline-offset-4 hover:underline"
                  >
                    Comparar con otra cartera{" "}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={gutter + " " + blockPad}>
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

          {/* Métricas de composición: solo con pesos reales (nunca "0,0%" de relleno). */}
          {esAgregado || holdingsLocked || holdings.length === 0 || !hasWeightData ? null : (
            <PortfolioMetricsStrip holdings={holdings} />
          )}

          {/* Un solo gráfico de rendimiento: el del cuerpo, con selector de
              períodos y muro de plan. El hero conserva su tarjeta de
              simulación; del panel de métricas se quitó el gráfico que
              duplicaba el mismo tramo (6M/1A). */}
          {!esAgregado ? (
            <div className="mb-12">
              <PerformancePanel
                metrics={perfPanelData.metrics}
                portfolioSeries={[]}
                benchmarkSeries={[]}
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

          {!esAgregado && entrySeries.length >= 2 ? (
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
            <div className="mb-12">
              <PortfolioDetailCharts composition={composition} />
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

          {/* Radiografía (d80): concentración visible y movimientos del último
              corte. Solo con holdings que el rol ya puede ver — nunca en el
              agregado de InfoProbidad ni con las posiciones bloqueadas. */}
          {!esAgregado && !holdingsLocked && holdingsTable.length > 0 && (hasWeightData || hasChangeData) ? (
            <PortfolioXray
              holdingsTable={holdingsTable}
              source={portfolio.source}
              hasWeightData={hasWeightData}
              hasChangeData={hasChangeData}
              isPartialTop={isPartialTop}
              totalVisible={holdingsTable.length}
            />
          ) : null}

          {/* d94 · Exposición: reparto del peso declarado por moneda y por tipo
              de activo. Solo con posiciones que el rol ya puede ver. */}
          {!esAgregado && !holdingsLocked && holdings.length > 0 && hasWeightData ? (
            <div className="mb-12">
              <ExposurePanel holdings={holdings} />
            </div>
          ) : null}

          <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
            {/* Posiciones: tabla de filetes. Sin plan, muro honesto —sin blur—
                con el mensaje y la salida real (planes o cuenta). */}
            <section
              id="posiciones"
              aria-labelledby="posiciones-title"
              className="app-panel min-w-0 scroll-mt-28 p-5 sm:p-7"
            >
              <h2 id="posiciones-title" className="text-[15px] font-medium text-ink-900">
                {esAgregado ? "Emisoras cotizadas" : "Posiciones"}
              </h2>
              {compositionMeta ? (
                <p className="mt-1 text-[12px] text-ink-500">{compositionMeta}</p>
              ) : null}
              {esAgregado ? (
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-500">
                  El peso es proporcional al número de autoridades que declaran la
                  emisora. No es una cartera para copiar ni una recomendación de inversión.
                </p>
              ) : null}

              {holdingsLocked ? (
                <LockedHoldings aggregated={esAgregado} anonymous={role === "anon"} />
              ) : holdingsTable.length === 0 ? (
                <p className="mt-4 max-w-md text-[13px] leading-relaxed text-ink-500">
                  {esAgregado
                    ? "La canasta de emisoras cotizadas aparecerá cuando la fuente publique los pesos. Arriba está el agregado por empresa, sin fichas de personas."
                    : "Aún no hay posiciones publicadas para este corte. Cuando la fuente entregue el detalle de la cartera, aparecerán acá con su peso y su cambio."}
                </p>
              ) : (
                <>
                  <div
                    role="region"
                    aria-label={`Tabla de posiciones de ${portfolio.name}`}
                    tabIndex={0}
                    className="-mx-5 mt-4 overflow-x-auto overscroll-x-contain px-5 sm:mx-0 sm:px-0"
                  >
                    <table className="w-full text-[15px]">
                      <caption className="sr-only">
                        {`Posiciones de ${portfolio.name}: peso en la cartera${
                          hasChangeData ? " y cambio de peso frente al corte anterior" : ""
                        }.`}
                      </caption>
                      <thead>
                        <tr className="border-b border-line text-left text-[13px] text-ink-500">
                          <th scope="col" className="py-2.5 pr-3 font-normal">
                            {esAgregado ? "Emisora" : "Activo"}
                          </th>
                          {hasWeightData ? (
                            <th scope="col" className="py-2.5 pl-6 text-right font-normal">
                              Peso
                            </th>
                          ) : null}
                          {hasChangeData ? (
                            <th scope="col" className="py-2.5 pl-4 text-right font-normal">
                              Cambio
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {holdingsTable.map((h) => {
                          // Variación de peso en el corte, redondeada a 0,1 pp:
                          // sin comparación previa no hay cifra que mostrar.
                          const delta =
                            h.previous_weight === null
                              ? null
                              : Math.round((h.weight - h.previous_weight) * 10) / 10;
                          const hasWeight = Number.isFinite(h.weight) && h.weight > 0;
                          return (
                            <tr key={h.id} className="border-b border-line last:border-b-0">
                              <td className="py-3.5 pr-3">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <Link
                                    href={`/accion/${encodeURIComponent(h.symbol.toLowerCase())}`}
                                    title={h.symbol}
                                    className="whitespace-nowrap font-medium text-ink-900 underline-offset-4 hover:underline"
                                  >
                                    {h.displaySymbol}
                                  </Link>
                                  {!esAgregado && h.return_pct !== null ? (
                                    <span
                                      className={
                                        "num whitespace-nowrap text-xs " +
                                        (h.return_pct >= 0 ? "text-positive" : "text-negative")
                                      }
                                    >
                                      <span className="sr-only">
                                        Retorno desde la declaración:{" "}
                                      </span>
                                      {h.return_pct >= 0 ? "+" : ""}
                                      {formatPctPlain(h.return_pct, 1)}
                                    </span>
                                  ) : null}
                                </div>
                                {h.name && h.name.trim().toUpperCase() !== h.symbol.toUpperCase() ? (
                                  <div className="mt-0.5 text-[13px] leading-snug text-ink-500">
                                    {h.name}
                                  </div>
                                ) : null}
                              </td>
                              {hasWeightData ? (
                                <td className="py-3.5 pl-6 text-right align-middle">
                                  {hasWeight ? (
                                    <>
                                      <span className="num block whitespace-nowrap text-[15px] font-medium text-ink-900">
                                        {formatPctPlain(h.weight, 1)}
                                      </span>
                                      {/* Micro-barra: proporción frente a la mayor
                                          posición de la tabla, no frente a 100%. */}
                                      <span
                                        aria-hidden="true"
                                        className="mt-1.5 ml-auto block h-1 w-14 bg-ink-100"
                                      >
                                        <span
                                          className="block h-full bg-ink-900"
                                          style={{
                                            width: `${Math.max(
                                              2,
                                              Math.round((h.weight / maxTableWeight) * 100),
                                            )}%`,
                                          }}
                                        />
                                      </span>
                                    </>
                                  ) : (
                                    <span className="whitespace-nowrap text-[12px] text-ink-500">
                                      sin peso
                                    </span>
                                  )}
                                </td>
                              ) : null}
                              {hasChangeData ? (
                                <td className="py-3.5 pl-4 text-right align-middle">
                                  {delta === null ? (
                                    <span className="whitespace-nowrap text-[12px] text-ink-500">
                                      sin corte previo
                                    </span>
                                  ) : delta === 0 ? (
                                    <span className="whitespace-nowrap text-[12px] text-ink-500">
                                      sin cambio
                                    </span>
                                  ) : (
                                    <span
                                      className={
                                        "num whitespace-nowrap text-[15px] " +
                                        (delta > 0 ? "text-positive" : "text-negative")
                                      }
                                    >
                                      {delta > 0 ? "+" : ""}
                                      {formatDecimal(delta, 1)} pp
                                    </span>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hasWeightData ? (
                    <p className="mt-3 text-[12px] text-ink-500">
                      La barra bajo cada peso es proporcional a la mayor posición de la
                      tabla.
                    </p>
                  ) : null}
                </>
              )}
            </section>

            {/* Alertas recientes — censuradas sin cuenta */}
            <section
              id="movimientos"
              aria-labelledby="movimientos-title"
              className="app-panel min-w-0 scroll-mt-28 p-5 sm:p-7"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="movimientos-title" className="text-[15px] font-medium text-ink-900">
                  Alertas recientes
                </h2>
                {alerts.length > 0 ? (
                  <span className="num text-[12px] text-ink-500">
                    {alerts.length === 1 ? "1 alerta" : `${alerts.length} alertas`}
                  </span>
                ) : null}
              </div>
              <PaywallGate locked={locked} label="historial de alertas" className="mt-4">
                {alerts.length > 0 ? (
                  <ol className="flex flex-col gap-5">
                    {alerts.map((alert) => {
                      const fuenteAlerta = enlaceSpensiones(alert.payload?.source_url);
                      const fecha = formatShortDate(alert.created_at);
                      const relativa = timeAgo(alert.created_at);
                      return (
                        <li key={alert.id} className="border-l-2 border-ink-900 pl-4">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-ink-500">
                            {fecha ? (
                              <time dateTime={alert.created_at} className="tabular-nums">
                                {fecha}
                              </time>
                            ) : null}
                            {fecha && relativa ? <span aria-hidden="true">·</span> : null}
                            {relativa ? <span>{relativa}</span> : null}
                          </div>
                          <h3 className="mt-1 text-[15px] font-medium leading-snug text-ink-900">
                            {alert.title}
                          </h3>
                          <LagBadge
                            publishedAt={publishedAtFromPayload(alert.payload)}
                            recordedAt={alert.created_at}
                            lagDays={lagDays(alert.payload)}
                            className="mt-1 block text-[11px] font-normal leading-snug text-ink-500"
                          />
                          {alert.summary ? (
                            <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink-500">
                              {alert.summary}
                            </p>
                          ) : !isPro && aiOn ? (
                            <p className="mt-1.5 text-[13px] text-ink-500">
                              Resumen AI disponible en Pro
                            </p>
                          ) : null}
                          {fuenteAlerta ? (
                            <a
                              href={fuenteAlerta}
                              className="mt-2 inline-block text-[13px] text-ink-900 underline-offset-4 hover:underline"
                              rel="noreferrer"
                              target="_blank"
                            >
                              Fuente: Superintendencia de Pensiones
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div>
                    <p className="text-[15px] text-ink-900">Sin alertas por ahora.</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                      Cuando la fuente registre un cambio de peso o una nueva
                      declaración, aparecerá acá.
                    </p>
                  </div>
                )}
              </PaywallGate>
            </section>
          </div>

          {/* Simulador + exportación CSV (Elite) */}
          {/* Simulador: retorno YTD de la serie real; return_ytd solo si hay posiciones que lo respalden. */}
          {toolReturnYtd !== null ? (
            <PortfolioTools
              slug={portfolio.slug}
              portfolioName={portfolio.name}
              returnYtd={toolReturnYtd}
              returnLabel={seriesYtd !== null ? "YTD de la serie" : "YTD estimado"}
              holdings={holdingsTable}
              holdingsLocked={holdingsLocked}
              authenticated={!!profile}
              isElite={isElite}
            />
          ) : null}

          {/* Relacionados: solo en la ficha pública (dentro de la app no aplica) */}
          {inApp ? null : (
            <PortfolioRelated slug={portfolio.slug} category={portfolio.category} />
          )}

          {/* Cierre legal: un solo descargo, el componente compartido que
              enlaza a /disclaimer, /terminos y /privacidad. El párrafo suelto
              que repetía el mismo texto se quitó. */}
          <div className="mt-12">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </MainTag>
      {inApp ? null : <SiteFooter />}
    </div>
  );
}

/**
 * Muro de posiciones: mensaje honesto y salida real. No monta datos, ni filas
 * fantasma, ni blur: lo que no está permitido no se insinúa. La cuenta gratuita
 * tampoco incluye posiciones (D55), así que el CTA siempre habla de planes.
 */
function LockedHoldings({
  aggregated,
  anonymous,
}: {
  aggregated: boolean;
  anonymous: boolean;
}) {
  return (
    <div className="mt-4 border-t border-line pt-5">
      <p className="text-[15px] font-medium text-ink-900">
        {aggregated ? "Emisoras para suscriptores." : "Posiciones para suscriptores."}
      </p>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-500">
        {aggregated
          ? "La canasta de emisoras con su peso está incluida en los planes de pago. La cuenta gratuita no incluye el detalle de posiciones."
          : "El detalle de la cartera —qué tiene, cuánto pesa cada posición y cómo cambió en el último corte— está incluido en los planes de pago. La cuenta gratuita no incluye posiciones."}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          href={anonymous ? "/planes" : "/upgrade"}
          className="inline-flex h-12 items-center rounded-full bg-ink-900 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-black"
        >
          {anonymous ? "Ver planes" : "Activar plan"}
        </Link>
        <Link
          href={anonymous ? "/login" : "/planes"}
          className="text-[15px] text-ink-900 underline-offset-4 hover:underline"
        >
          {anonymous ? "Ya tengo cuenta" : "Comparar planes"}
        </Link>
      </div>
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

// ---------------------------------------------------------------------------
// B3: Dataset JSON-LD de la ficha
//
// El creador del Dataset es Fraccion (Organization con @id estable), porque es
// quien publica el dataset; la persona o entidad que gestiona la cartera —si
// existe— va en `about`. La cobertura temporal se arma con fechas REALES de la
// serie y de los as_of (nunca con el año en curso) y `dateModified` sale de
// portfolio.updated_at. Los campos sin dato no se emiten.
//
// La función es pura y recibe todo explícito (sin env, sin React) para poder
// testearse con datos de ejemplo.
// ---------------------------------------------------------------------------

/** Categorías cuyo portafolio pertenece a una persona concreta. */
const PERSON_CATEGORIES = new Set<string>(["political_us"]);
/** Fuentes de seguimiento nominal a una persona (Trump, Musk, Cramer). */
const PERSON_SOURCES = new Set<string>([
  "trump_mentions",
  "musk_mentions",
  "cnbc_lightning_round",
]);
/** Categorías donde el gestor es una entidad (corredora, fondo, modelo). */
const ORGANIZATION_CATEGORIES = new Set<string>(["broker_cl", "hedge_fund", "model"]);

export interface PortfolioDatasetInput {
  slug: string;
  name: string;
  description?: string | null;
  /** Categoría del portafolio: decide si el gestor es Person u Organization. */
  category?: string | null;
  /** Etiqueta legible de la categoría (CATEGORY_META.label). */
  categoryLabel?: string | null;
  tags?: string[] | null;
  /** Gestor de la cartera (no es el creador del dataset). */
  manager?: string | null;
  /** Fuente de datos (decide el tipo del gestor en fuentes nominales). */
  source?: string | null;
  /** portfolio.updated_at: si falta o no es fecha, no hay dateModified. */
  updatedAt?: string | null;
  /** Licencia o aviso legal del dataset. */
  licenseUrl: string;
  /** Base pública del sitio (siteUrl()), sin slash final. */
  baseUrl: string;
  /** Nombre de la marca creadora (BRAND_NAME). */
  brandName: string;
  /** Fechas de la serie y de los as_of reales (ISO o YYYY-MM-DD). */
  dates?: (string | null | undefined)[] | null;
  inLanguage?: string | null;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Día ISO (YYYY-MM-DD) desde una fecha ISO o un timestamp; null si no sirve. */
function isoDay(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  // Una fecha imposible (2026-02-31) se normaliza a marzo: se descarta.
  return new Date(parsed).toISOString().slice(0, 10) === day ? day : null;
}

/**
 * Cobertura temporal ISO 8601 (`YYYY-MM-DD/YYYY-MM-DD`) entre el primer y el
 * último punto con fecha real. Null si no hay ninguna fecha válida.
 */
export function portfolioTemporalCoverage(
  dates: (string | null | undefined)[] | null | undefined,
): string | null {
  const days = (dates ?? [])
    .map((value) => isoDay(value))
    .filter((day): day is string => day !== null)
    .sort();
  if (days.length === 0) return null;
  return `${days[0]}/${days[days.length - 1]}`;
}

/** Tipo schema.org del gestor; Thing cuando el portafolio no lo determina. */
function managerSchemaType(
  category: string | null | undefined,
  source: string | null | undefined,
): "Person" | "Organization" | "Thing" {
  const cat = cleanText(category);
  const src = cleanText(source);
  if (cat && PERSON_CATEGORIES.has(cat)) return "Person";
  if (src && PERSON_SOURCES.has(src)) return "Person";
  if (cat && ORGANIZATION_CATEGORIES.has(cat)) return "Organization";
  return "Thing";
}

/** Keywords sin vacíos ni repetidos (etiqueta de categoría primero). */
function keywordsFor(
  categoryLabel: string | null | undefined,
  tags: string[] | null | undefined,
): string | null {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of [categoryLabel ?? "", ...(tags ?? [])]) {
    const word = cleanText(raw);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words.length > 0 ? words.join(", ") : null;
}

/** dateModified en ISO completo cuando updated_at es una fecha válida. */
function isoDateTime(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Arma el objeto JSON-LD `Dataset` de una ficha de portafolio.
 * No incluye campos vacíos y nunca usa el año en curso como cobertura.
 */
export function buildPortfolioDataset(input: PortfolioDatasetInput): Record<string, unknown> {
  const baseUrl = cleanText(input.baseUrl) ?? "";
  const brandName = cleanText(input.brandName);
  const slug = cleanText(input.slug);

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Dataset",
  };

  const name = cleanText(input.name);
  if (name) data.name = name;
  const description = cleanText(input.description);
  if (description) data.description = description;
  if (baseUrl) data.url = slug ? `${baseUrl}/portfolio/${slug}` : baseUrl;
  data.inLanguage = cleanText(input.inLanguage) ?? "es-CL";

  const keywords = keywordsFor(input.categoryLabel, input.tags);
  if (keywords) data.keywords = keywords;

  // Creador = quien publica el dataset (Fraccion), no el gestor de la cartera.
  data.creator = {
    "@type": "Organization",
    ...(baseUrl ? { "@id": `${baseUrl}/#organization` } : {}),
    ...(brandName ? { name: brandName } : {}),
  };

  // Gestor/entidad seguida: Person, Organization o Thing si no se puede saber.
  const manager = cleanText(input.manager);
  if (manager) {
    data.about = { "@type": managerSchemaType(input.category, input.source), name: manager };
  }

  const coverage = portfolioTemporalCoverage(input.dates);
  if (coverage) data.temporalCoverage = coverage;

  const modified = isoDateTime(input.updatedAt);
  if (modified) data.dateModified = modified;

  const license = cleanText(input.licenseUrl);
  if (license) data.license = license;

  return data;
}
