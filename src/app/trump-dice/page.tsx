import { withSeo } from "@/lib/seo";
import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { FiltrosMenciones, type OrdenMenciones } from "@/components/trump-dice/filtros-menciones";
import { getMentions, TRUMP_DICE_START, formatMentionDate, mentionKindLabel } from "@/lib/mentions-queries";
import { getPortfolioBySlug, getPerformanceSeriesAdmin } from "@/lib/queries";
import { getBenchmarkSeries } from "@/lib/performance-queries";
import { getClosesSince } from "@/lib/trump-dice-queries";
import { returnSince, totalFromPct, windowReturn } from "@/lib/trump-dice-page";
import { cn, formatShortDate, formatSignedPct } from "@/lib/utils";

export const metadata = withSeo("/trump-dice", {
  title: "Trump dice: cada mención y su retorno",
  description:
    "Las menciones verificadas de Donald Trump sobre acciones desde agosto de 2025, con su fuente, el retorno desde cada fecha y la estrategia completa contra el S&P 500.",
});

export const instant = false;

type Pt = { date: string; v: number };

interface TrumpDicePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Primer valor del parámetro; vacío o ausente → null. */
function paramValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const clean = raw?.trim();
  return clean ? clean : null;
}

/** Año calendario de la mención (prefijo ISO), sin depender de la zona del servidor. */
function mentionYear(iso: string): string | null {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(iso.trim());
  return match ? match[1] : null;
}

/**
 * Clave de tipo para la URL. Los dichos sin etiqueta propia comparten
 * "mencion": una mención sin kind no inventa una opción distinta.
 */
function mentionKindKey(kind: string | null): string {
  return mentionKindLabel(kind) === "Mención" ? "mencion" : (kind ?? "mencion");
}

function parseOrden(value: string | null): OrdenMenciones {
  return value === "retorno" || value === "alfabetico" ? value : "reciente";
}

/** Filtra por tipo y año; el orden se resuelve aparte. No muta la entrada. */
function filterMentions<T extends { m: { kind: string | null; saidAt: string } }>(
  rows: readonly T[],
  tipo: string | null,
  anio: string | null,
): T[] {
  if (tipo === null && anio === null) return [...rows];
  return rows.filter(({ m }) => {
    if (tipo !== null && mentionKindKey(m.kind) !== tipo) return false;
    if (anio !== null && mentionYear(m.saidAt) !== anio) return false;
    return true;
  });
}

/** Ordena sin mutar: por defecto la más reciente primero; sin precio, al final. */
function sortMentions<T extends { m: { saidAt: string; symbol: string }; r: { pct: number | null } }>(
  rows: readonly T[],
  orden: OrdenMenciones,
): T[] {
  const copy = [...rows];
  if (orden === "retorno") {
    return copy.sort((a, b) => {
      const pa = a.r.pct;
      const pb = b.r.pct;
      if (pa === null && pb === null) return b.m.saidAt.localeCompare(a.m.saidAt);
      if (pa === null) return 1;
      if (pb === null) return -1;
      if (pb !== pa) return pb - pa;
      return b.m.saidAt.localeCompare(a.m.saidAt);
    });
  }
  if (orden === "alfabetico") {
    return copy.sort((a, b) => a.m.symbol.localeCompare(b.m.symbol) || b.m.saidAt.localeCompare(a.m.saidAt));
  }
  return copy.sort((a, b) => b.m.saidAt.localeCompare(a.m.saidAt));
}

/** Muestrea a lo más n puntos manteniendo extremos. */
function sample(pts: Pt[], n = 120): Pt[] {
  if (pts.length <= n) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
  return out;
}

/** Gráfico principal SVG propio: estrategia vs S&P 500, base 0% en la fecha de inicio. */
function HeroChart({ strategy, spx }: { strategy: Pt[]; spx: Pt[] }) {
  if (strategy.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center px-6 text-center text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
        Sin serie de precios suficiente para graficar todavía.
      </div>
    );
  }
  const W = 640;
  const H = 220;
  const all = [...strategy, ...spx];
  const t0 = Date.parse(strategy[0].date);
  const t1 = Date.parse(strategy.at(-1)!.date);
  const span = t1 - t0 || 1;
  const min = Math.min(0, ...all.map((p) => p.v));
  const max = Math.max(0, ...all.map((p) => p.v));
  const vr = max - min || 1;
  const x = (d: string) => (((Date.parse(d) - t0) / span) * W).toFixed(1);
  const y = (v: number) => (8 + (1 - (v - min) / vr) * (H - 16)).toFixed(1);
  const path = (pts: Pt[]) =>
    pts.filter((p) => Date.parse(p.date) >= t0 && Date.parse(p.date) <= t1).map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.v)}`).join(" ");
  const sPath = path(strategy);
  const up = strategy.at(-1)!.v >= 0;
  const color = up ? "var(--color-positive)" : "var(--color-negative)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-56 w-full sm:h-64" role="img" aria-label="Estrategia Trump dice contra el S&P 500">
      <defs>
        <linearGradient id="td-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-ink-200 dark:text-white/15" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={`${sPath} L${W},${H} L0,${H} Z`} fill="url(#td-fill)" />
      {spx.length > 1 ? (
        <path d={path(spx)} fill="none" stroke="currentColor" className="text-ink-400 dark:text-white/40" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ) : null}
      <path d={sPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Spark({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(2)},${(24 - ((v - min) / span) * 24).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className={cn("h-8 w-20 shrink-0", positive ? "text-positive" : "text-negative")} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Cifra real de rendimiento. Sin dato no devuelve nada: nunca pinta un guion. */
function Pct({ value, className }: { value: number | null; className?: string }) {
  if (value === null || !Number.isFinite(value)) return null;
  return (
    <span
      className={cn(
        "num",
        value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-ink-900 dark:text-white",
        className,
      )}
    >
      {formatSignedPct(value)}
    </span>
  );
}

function Ticker({ symbol }: { symbol: string }) {
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center border border-ink-900 bg-ink-900 text-[11px] font-semibold tracking-tight text-white dark:border-white dark:bg-white dark:text-ink-950">
      {symbol.slice(0, 4)}
    </span>
  );
}

export default async function TrumpDicePage({ searchParams }: TrumpDicePageProps) {
  await connection();
  const [portfolio, spxRaw, params] = await Promise.all([
    getPortfolioBySlug("trump-dice"),
    getBenchmarkSeries("^GSPC", 1000),
    searchParams,
  ]);
  const [{ mentions, isDemo }, seriesById] = await Promise.all([
    portfolio ? getMentions(portfolio.id, "trump_mentions") : Promise.resolve({ mentions: [], isDemo: true }),
    portfolio ? getPerformanceSeriesAdmin([portfolio.id]) : Promise.resolve(new Map()),
  ]);
  const series: { date: string; value: number; estimated: boolean }[] = portfolio ? seriesById.get(portfolio.id) ?? [] : [];
  const closes = await getClosesSince(mentions.map((m) => m.symbol), TRUMP_DICE_START);
  const strategy = totalFromPct(series, TRUMP_DICE_START);
  const spxReturn = windowReturn(spxRaw.map((p) => ({ date: p.date, close: p.value })), TRUMP_DICE_START);
  const lastDate = series.at(-1)?.date ?? null;
  const diff = strategy !== null && spxReturn !== null ? Math.round((strategy - spxReturn) * 100) / 100 : null;
  const hasEstimated = series.some((p) => p.estimated && p.date >= TRUMP_DICE_START);

  // Serie de la estrategia y del S&P re-basadas a 0% en la fecha de inicio (datos reales).
  const sPts = series.filter((p) => p.date >= TRUMP_DICE_START && Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  const s0 = sPts.length ? 1 + sPts[0].value / 100 : 1;
  const stratLine = s0 > 0 ? sample(sPts.map((p) => ({ date: p.date, v: ((1 + p.value / 100) / s0 - 1) * 100 }))) : [];
  const xPts = spxRaw.filter((p) => p.date >= TRUMP_DICE_START && p.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  const spxLine = xPts.length ? sample(xPts.map((p) => ({ date: p.date, v: (p.value / xPts[0].value - 1) * 100 }))) : [];

  const rows = mentions.map((m) => ({ m, r: returnSince(closes.get(m.symbol) ?? [], m.entryDate) }));
  const priced = rows.filter((x) => x.r.pct !== null);
  const winners = priced.filter((x) => (x.r.pct ?? 0) > 0).length;
  const best = [...priced].sort((a, b) => (b.r.pct ?? 0) - (a.r.pct ?? 0))[0] ?? null;
  const worst = [...priced].sort((a, b) => (a.r.pct ?? 0) - (b.r.pct ?? 0))[0] ?? null;
  const kinds = new Map<string, number>();
  for (const { m } of rows) kinds.set(mentionKindLabel(m.kind), (kinds.get(mentionKindLabel(m.kind)) ?? 0) + 1);
  const maxAbs = Math.max(1, ...priced.map((x) => Math.abs(x.r.pct ?? 0)));

  // Filtros por URL: solo afectan a la lista. Los indicadores y el ranking
  // describen el total de menciones verificadas; sin parámetros, la lista
  // completa sigue en el HTML inicial.
  const tipoActivo = paramValue(params.tipo);
  const anioActivo = paramValue(params.anio);
  const ordenActivo = parseOrden(paramValue(params.orden));

  const tiposMap = new Map<string, { value: string; label: string; n: number }>();
  for (const { m } of rows) {
    const value = mentionKindKey(m.kind);
    const prev = tiposMap.get(value);
    if (prev) prev.n += 1;
    else tiposMap.set(value, { value, label: mentionKindLabel(m.kind), n: 1 });
  }
  const tipos = [...tiposMap.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "es"))
    .map(({ value, label }) => ({ value, label }));
  const anios = [...new Set(rows.map(({ m }) => mentionYear(m.saidAt)).filter((y): y is string => y !== null))].sort(
    (a, b) => b.localeCompare(a),
  );

  const ordered = sortMentions(filterMentions(rows, tipoActivo, anioActivo), ordenActivo);
  const ordenHint =
    ordenActivo === "retorno" ? "mayor retorno primero" : ordenActivo === "alfabetico" ? "orden alfabético" : "más reciente primero";
  const ranked = [...priced].sort((a, b) => (b.r.pct ?? 0) - (a.r.pct ?? 0));
  const kindList = [...kinds.entries()].sort((a, b) => b[1] - a[1]);

  // Solo métricas con dato real: sin cifra no hay bloque (decisión 6).
  const kpis: Array<{
    label: string;
    value: string;
    tone?: "positive" | "negative";
    note?: string;
    delta?: { text: string; positive: boolean };
  }> = [];
  if (spxReturn !== null) {
    kpis.push({
      label: "S&P 500, mismo período",
      value: formatSignedPct(spxReturn),
      tone: spxReturn > 0 ? "positive" : spxReturn < 0 ? "negative" : undefined,
    });
  }
  if (priced.length > 0) {
    kpis.push({ label: "Menciones en positivo", value: `${winners}/${priced.length}`, note: "con precios disponibles" });
  }
  if (best && best.r.pct !== null) {
    const pct = best.r.pct;
    kpis.push({
      label: "Mejor mención",
      value: best.m.symbol,
      delta: { text: `${formatSignedPct(pct)} desde la mención`, positive: pct >= 0 },
    });
  }
  if (worst && worst.r.pct !== null && worst.m.id !== best?.m.id) {
    const pct = worst.r.pct;
    kpis.push({
      label: "Peor mención",
      value: worst.m.symbol,
      delta: { text: `${formatSignedPct(pct)} desde la mención`, positive: pct >= 0 },
    });
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          <header className="border-b border-ink-300 pb-8 dark:border-white/12">
            <div className="flex items-center gap-3">
              {portfolio ? <PortfolioAvatar portfolio={portfolio} size={40} className="rounded-none border border-ink-300 dark:border-white/12" /> : null}
              <p className="label-line min-w-0">
                Estudio de menciones públicas · desde {formatShortDate(TRUMP_DICE_START)}
                {lastDate ? ` · actualizado ${formatShortDate(lastDate)}` : ""}
              </p>
            </div>
            <h1 className="type-display mt-5 text-ink-900 dark:text-white">Trump dice</h1>
            <div className="mt-8 flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
              <p className="type-body max-w-2xl">
                Cada vez que Donald Trump nombró una acción: qué dijo, la fuente y cuánto se movió desde ese día. La estrategia compra US$1.000 en
                cada mención y mantiene.
              </p>
              {strategy !== null ? (
                <div className="shrink-0">
                  <p className="label-line">Estrategia{hasEstimated ? " · estimado" : ""}</p>
                  <Pct value={strategy} className="mt-2 block text-[clamp(2.5rem,6vw,4rem)] leading-[0.9]" />
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
              {mentions.length > 0 ? (
                <span className="num text-ink-900 dark:text-white">
                  {mentions.length} {mentions.length === 1 ? "mención verificada" : "menciones verificadas"}
                </span>
              ) : null}
              {diff !== null ? (
                <span
                  className={cn(
                    "num",
                    diff > 0 ? "text-positive" : diff < 0 ? "text-negative" : "text-ink-900 dark:text-white",
                  )}
                >
                  {formatSignedPct(diff)} vs S&amp;P 500
                </span>
              ) : null}
            </div>
          </header>

          {isDemo ? (
            <p className="mt-4 text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
              Sin conexión con la base: se muestran las menciones verificadas sin cifras.
            </p>
          ) : null}

          {/* Gráfico: serie real de la estrategia contra el S&P 500, base 0%. */}
          <figure className="mt-8 border border-ink-300 dark:border-white/12">
            <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-300 px-4 py-3 dark:border-white/12 sm:px-6">
              <span className="label-line">Serie desde {formatShortDate(TRUMP_DICE_START)} · base 0%</span>
              <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-ink-500 dark:text-ink-400">
                {stratLine.length > 1 ? (
                  <span className="flex items-center gap-1.5">
                    <span className={cn("h-px w-5", (stratLine.at(-1)?.v ?? 0) >= 0 ? "bg-positive" : "bg-negative")} /> Trump dice
                  </span>
                ) : null}
                {spxLine.length > 1 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-px w-5 bg-ink-400 dark:bg-white/50" /> S&amp;P 500 (^GSPC)
                  </span>
                ) : null}
              </span>
            </figcaption>
            <div className="px-2 pb-3 pt-4 sm:px-4">
              <HeroChart strategy={stratLine} spx={spxLine} />
            </div>
          </figure>

          {kpis.length > 0 ? (
            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 border-t border-ink-900 pt-6 dark:border-white lg:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="min-w-0">
                  <dt className="label-line">{k.label}</dt>
                  <dd
                    className={cn(
                      "num mt-2 text-[26px] leading-none",
                      k.tone === "positive" ? "text-positive" : k.tone === "negative" ? "text-negative" : "text-ink-900 dark:text-white",
                    )}
                  >
                    {k.value}
                  </dd>
                  {k.delta ? (
                    <p className={cn("num mt-1.5 text-[12px]", k.delta.positive ? "text-positive" : "text-negative")}>{k.delta.text}</p>
                  ) : k.note ? (
                    <p className="mt-1.5 text-[12px] text-ink-500 dark:text-ink-400">{k.note}</p>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
            {/* Menciones: lista tipográfica con filetes de 1px. */}
            <section id="menciones" className="scroll-mt-24 lg:col-span-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink-900 pb-3 dark:border-white">
                <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">Cada mención</h2>
                <span className="text-[11px] text-ink-500 dark:text-ink-400">{ordenHint}</span>
              </div>
              {mentions.length > 0 ? (
                <FiltrosMenciones
                  tipos={tipos}
                  anios={anios}
                  tipo={tipoActivo}
                  anio={anioActivo}
                  orden={ordenActivo}
                  visibles={ordered.length}
                  total={mentions.length}
                  params={params}
                />
              ) : null}
              <ul>
                {ordered.map(({ m, r }) => (
                  <li key={m.id} className="border-b border-ink-300 py-6 dark:border-white/12">
                    <article className="flex items-start gap-4">
                      <Ticker symbol={m.symbol} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                          <div className="min-w-0">
                            <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
                              {m.symbol}
                              {m.company ? <span className="ml-2 font-normal text-ink-500 dark:text-ink-400">{m.company}</span> : null}
                            </h3>
                            <p className="mt-1 text-[12px] text-ink-500 dark:text-ink-400">
                              <time dateTime={m.saidAt}>{formatMentionDate(m.saidAt)}</time>
                              {m.externalId ? ` · ${m.externalId}` : ""}
                            </p>
                          </div>
                          {r.pct !== null ? (
                            <div className="shrink-0 text-right">
                              <Pct value={r.pct} className="block text-[19px] leading-tight" />
                              {r.baseDate ? (
                                <p className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
                                  desde <time dateTime={r.baseDate}>{formatShortDate(r.baseDate)}</time>
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <blockquote className="mt-4 max-w-[70ch] border-l border-ink-300 pl-4 text-[15px] leading-relaxed text-ink-700 dark:border-white/20 dark:text-white/75">
                          “{m.quote}”
                        </blockquote>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="border border-ink-300 px-2 py-0.5 text-[11px] text-ink-600 dark:border-white/12 dark:text-ink-400">
                              {mentionKindLabel(m.kind)}
                            </span>
                            <a
                              href={m.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="border border-ink-300 px-2 py-0.5 text-[11px] font-medium text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900 dark:border-white/12 dark:text-ink-300 dark:hover:border-white dark:hover:text-white"
                            >
                              Fuente <span aria-hidden>↗</span>
                            </a>
                          </div>
                          <Spark points={r.spark} positive={(r.pct ?? 0) >= 0} />
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
              {ordered.length === 0 && mentions.length > 0 ? (
                <div className="mt-6 border border-ink-300 px-5 py-6 dark:border-white/12">
                  <p className="text-[15px] leading-relaxed text-ink-700 dark:text-white/80">Ninguna mención coincide con estos filtros.</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
                    El listado completo tiene {mentions.length} {mentions.length === 1 ? "mención verificada" : "menciones verificadas"}.
                  </p>
                  <Link
                    href="/trump-dice#menciones"
                    className="mt-4 inline-flex h-10 items-center border border-ink-900 px-4 text-[13px] font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-ink-900"
                  >
                    Ver todas las menciones
                  </Link>
                </div>
              ) : null}
              {ordered.length === 0 && mentions.length === 0 && !isDemo ? (
                <p className="mt-6 text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                  Todavía no hay menciones verificadas publicadas.
                </p>
              ) : null}
            </section>

            {/* Columna lateral */}
            <aside className="flex flex-col gap-10 border-ink-300 lg:col-span-4 lg:sticky lg:top-20 lg:self-start lg:border-l lg:pl-10 dark:border-white/12">
              {ranked.length > 0 ? (
                <section>
                  <h2 className="border-b border-ink-900 pb-3 text-[13px] font-medium text-ink-900 dark:border-white dark:text-white">Retorno por mención</h2>
                  <ul className="mt-5 flex flex-col gap-3">
                    {ranked.map(({ m, r }) => {
                      const v = r.pct ?? 0;
                      return (
                        <li key={m.id} className="grid grid-cols-[56px_1fr_56px] items-center gap-3 text-[12px]">
                          <span className="truncate font-medium text-ink-900 dark:text-white">{m.symbol}</span>
                          <span aria-hidden className="h-[3px] bg-ink-100 dark:bg-white/10">
                            <span
                              className={cn(
                                "block h-full",
                                v > 0 ? "bg-positive" : v < 0 ? "bg-negative" : "bg-ink-400 dark:bg-white/40",
                              )}
                              style={{ width: `${Math.max(4, (Math.abs(v) / maxAbs) * 100)}%` }}
                            />
                          </span>
                          <Pct value={r.pct} className="text-right text-[12px]" />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {kindList.length > 0 ? (
                <section>
                  <h2 className="border-b border-ink-900 pb-3 text-[13px] font-medium text-ink-900 dark:border-white dark:text-white">Tipo de mención</h2>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {kindList.map(([k, n]) => (
                      <li key={k} className="border border-ink-300 px-2 py-0.5 text-[11px] text-ink-600 dark:border-white/12 dark:text-ink-400">
                        {k} · <span className="num">{n}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <Link
                href="/portfolio/trump-dice"
                className="flex items-center justify-between border border-ink-300 px-4 py-3 text-[13px] font-medium text-ink-900 transition-colors hover:border-ink-900 dark:border-white/12 dark:text-white dark:hover:border-white"
              >
                Ver el portafolio completo <span aria-hidden>→</span>
              </Link>
            </aside>
          </div>

          <p className="mt-16 max-w-3xl border-t border-ink-300 pt-6 text-[12px] leading-relaxed text-ink-500 dark:border-white/12 dark:text-ink-400">
            Retorno de cada acción desde el primer cierre en o después de la fecha de entrada hasta el último cierre disponible. Rendimiento
            pasado no garantiza resultados futuros. No es asesoría de inversión.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
