import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PortfolioAvatar } from "@/components/portfolio-avatar";
import { Chip, StatCard } from "@/components/app";
import { getMentions, TRUMP_DICE_START, formatMentionDate, mentionKindLabel } from "@/lib/mentions-queries";
import { getPortfolioBySlug, getPerformanceSeriesAdmin } from "@/lib/queries";
import { getBenchmarkSeries } from "@/lib/performance-queries";
import { getClosesSince } from "@/lib/trump-dice-queries";
import { returnSince, totalFromPct, windowReturn } from "@/lib/trump-dice-page";
import { cn, formatShortDate, formatSignedPct } from "@/lib/utils";

export const metadata = {
  title: "Trump dice: cada mención y su retorno",
  description:
    "Las menciones verificadas de Donald Trump sobre acciones desde agosto de 2025, con su fuente, el retorno desde cada fecha y la estrategia completa contra el S&P 500.",
};

export const instant = false;

type Pt = { date: string; v: number };

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
    return <div className="flex h-56 items-center justify-center text-app-caption text-ink-500">—</div>;
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
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-ink-200" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={`${sPath} L${W},${H} L0,${H} Z`} fill="url(#td-fill)" />
      {spx.length > 1 ? (
        <path d={path(spx)} fill="none" stroke="currentColor" className="text-ink-400" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ) : null}
      <path d={sPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Spark({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return <span className="text-app-caption text-ink-400">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(2)},${(24 - ((v - min) / span) * 24).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className={cn("h-9 w-24", positive ? "text-positive" : "text-negative")} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Pct({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("font-semibold tabular-nums", value === null ? "text-ink-400" : value >= 0 ? "text-positive" : "text-negative", className)}>
      {value === null ? "—" : formatSignedPct(value)}
    </span>
  );
}

function Ticker({ symbol }: { symbol: string }) {
  return (
    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink-900 text-[12px] font-bold tracking-tight text-white">
      {symbol.slice(0, 4)}
    </span>
  );
}

export default async function TrumpDicePage() {
  await connection();
  const [portfolio, spxRaw] = await Promise.all([getPortfolioBySlug("trump-dice"), getBenchmarkSeries("^GSPC", 1000)]);
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

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-app-canvas">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-6 sm:px-6 md:px-10 md:pt-12">
          {/* Héroe: tarjeta grande con gráfico propio */}
          <section className="app-card overflow-hidden p-0">
            <div className="flex flex-col gap-5 p-5 sm:p-7">
              <div className="flex items-center gap-3">
                {portfolio ? <PortfolioAvatar portfolio={portfolio} size={64} className="rounded-2xl" /> : null}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-app-display font-semibold tracking-tight text-ink-900">Trump dice</h1>
                    <Chip tone="info">Portafolio estrella</Chip>
                  </div>
                  <p className="text-app-caption text-ink-500">
                    Estudio de menciones públicas · desde {formatShortDate(TRUMP_DICE_START)}
                    {lastDate ? ` · actualizado ${formatShortDate(lastDate)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-app-caption font-medium text-ink-500">Estrategia{hasEstimated ? " (estimado)" : ""}</p>
                  <Pct value={strategy} className="block text-[44px] leading-none tracking-tight sm:text-[56px]" />
                </div>
                <div className="flex flex-wrap gap-2 pb-1">
                  <Chip tone={diff === null ? "neutral" : diff >= 0 ? "buy" : "sell"}>
                    {diff === null ? "— vs S&P 500" : `${formatSignedPct(diff)} vs S&P 500`}
                  </Chip>
                  <Chip>{mentions.length} menciones verificadas</Chip>
                </div>
              </div>
              <p className="max-w-2xl text-app-body text-ink-600">
                Cada vez que Donald Trump nombró una acción: qué dijo, la fuente y cuánto se movió desde ese día. La estrategia compra US$1.000 en
                cada mención y mantiene.
              </p>
            </div>
            <div className="px-2 sm:px-4">
              <HeroChart strategy={stratLine} spx={spxLine} />
            </div>
            <div className="flex items-center gap-4 border-t border-app-border px-5 py-3 text-app-caption text-ink-500 sm:px-7">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-0.5 w-4 rounded", (strategy ?? 0) >= 0 ? "bg-positive" : "bg-negative")} /> Trump dice
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-ink-400" /> S&amp;P 500 (^GSPC)
              </span>
            </div>
          </section>

          {isDemo ? (
            <p className="mt-3 text-app-caption text-ink-500">Sin conexión con la base: se muestran las menciones verificadas sin cifras.</p>
          ) : null}

          {/* KPIs */}
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="S&P 500, mismo período" value={spxReturn === null ? null : formatSignedPct(spxReturn)} />
            <StatCard label="Menciones en positivo" value={priced.length ? `${winners}/${priced.length}` : null} hint="con precios disponibles" />
            <StatCard
              label="Mejor mención"
              value={best ? best.m.symbol : null}
              delta={best?.r.pct ?? null}
              deltaLabel="desde la mención"
              points={best?.r.spark}
            />
            <StatCard
              label="Peor mención"
              value={worst ? worst.m.symbol : null}
              delta={worst?.r.pct ?? null}
              deltaLabel="desde la mención"
              points={worst?.r.spark}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
            {/* Menciones como tarjetas */}
            <section>
              <div className="mb-3 flex items-end justify-between">
                <h2 className="text-app-title font-semibold text-ink-900">Cada mención</h2>
                <span className="text-app-caption text-ink-500">más reciente primero</span>
              </div>
              <ul className="flex flex-col gap-3">
                {[...rows].sort((a, b) => b.m.saidAt.localeCompare(a.m.saidAt)).map(({ m, r }) => (
                  <li key={m.id} className="app-card p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Ticker symbol={m.symbol} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[16px] font-semibold text-ink-900">
                              {m.symbol}
                              {m.company ? <span className="ml-1.5 font-normal text-ink-500">{m.company}</span> : null}
                            </p>
                            <p className="text-app-caption text-ink-500">
                              {formatMentionDate(m.saidAt)}
                              {m.externalId ? ` · ${m.externalId}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Pct value={r.pct} className="block text-[18px] leading-tight" />
                            <p className="text-[11px] text-ink-400">{r.baseDate ? `desde ${formatShortDate(r.baseDate)}` : "sin precios"}</p>
                          </div>
                        </div>
                        <blockquote className="mt-3 border-l-2 border-ink-200 pl-3 text-[15px] leading-relaxed text-ink-800">“{m.quote}”</blockquote>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip>{mentionKindLabel(m.kind)}</Chip>
                            <a
                              href={m.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-6 items-center rounded-full border border-app-border px-2.5 text-[12px] font-medium text-ink-700 hover:bg-ink-100"
                            >
                              Fuente ↗
                            </a>
                          </div>
                          <Spark points={r.spark} positive={(r.pct ?? 0) >= 0} />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Columna lateral */}
            <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              <section className="app-card p-4 sm:p-5">
                <h2 className="mb-3 text-app-title font-semibold text-ink-900">Retorno por mención</h2>
                {priced.length ? (
                  <ul className="flex flex-col gap-2">
                    {[...priced].sort((a, b) => (b.r.pct ?? 0) - (a.r.pct ?? 0)).map(({ m, r }) => {
                      const v = r.pct ?? 0;
                      return (
                        <li key={m.id} className="grid grid-cols-[52px_1fr_64px] items-center gap-2 text-[13px]">
                          <span className="font-semibold text-ink-900">{m.symbol}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-ink-100">
                            <span
                              className={cn("block h-full rounded-full", v >= 0 ? "bg-positive" : "bg-negative")}
                              style={{ width: `${Math.max(4, (Math.abs(v) / maxAbs) * 100)}%` }}
                            />
                          </span>
                          <Pct value={r.pct} className="text-right" />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-app-caption text-ink-500">—</p>
                )}
              </section>
              <section className="app-card p-4 sm:p-5">
                <h2 className="mb-3 text-app-title font-semibold text-ink-900">Tipo de mención</h2>
                <div className="flex flex-wrap gap-2">
                  {[...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                    <Chip key={k}>
                      {k} · {n}
                    </Chip>
                  ))}
                </div>
              </section>
              <Link
                href="/portfolio/trump-dice"
                className="app-card flex items-center justify-between p-4 text-[15px] font-semibold text-ink-900 hover:bg-ink-50"
              >
                Ver el portafolio completo <span aria-hidden>→</span>
              </Link>
            </aside>
          </div>

          <p className="mt-8 text-app-caption leading-relaxed text-ink-500">
            Retorno de cada acción desde el primer cierre en o después de la fecha de entrada hasta el último cierre disponible. Rendimiento
            pasado no garantiza resultados futuros. No es asesoría de inversión.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
