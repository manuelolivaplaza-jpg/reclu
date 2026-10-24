import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
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

function Spark({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return <span className="text-[12px] text-neutral-400">Sin precios</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(2)},${(24 - ((v - min) / span) * 24).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-8 w-28" aria-hidden>
      <path d={d} fill="none" stroke={positive ? "#15803d" : "#dc2626"} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Pct({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("num font-semibold", value === null ? "text-neutral-400" : value >= 0 ? "text-green-700" : "text-red-600", className)}>
      {formatSignedPct(value)}
    </span>
  );
}

export default async function TrumpDicePage() {
  await connection();
  const portfolio = await getPortfolioBySlug("trump-dice");
  const { mentions, isDemo } = portfolio ? await getMentions(portfolio.id, "trump_mentions") : { mentions: [], isDemo: true };
  const closes = await getClosesSince(mentions.map((m) => m.symbol), TRUMP_DICE_START);
  const series = portfolio ? (await getPerformanceSeriesAdmin([portfolio.id])).get(portfolio.id) ?? [] : [];
  const strategy = totalFromPct(series, TRUMP_DICE_START);
  const spx = await getBenchmarkSeries("^GSPC", 1000);
  const spxReturn = windowReturn(spx.map((p) => ({ date: p.date, close: p.value })), TRUMP_DICE_START);
  const lastDate = series.at(-1)?.date ?? null;

  const rows = mentions.map((m) => ({ m, r: returnSince(closes.get(m.symbol) ?? [], m.entryDate) }));

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white">
        <section className="mx-auto w-full max-w-[1120px] px-4 pb-12 pt-16 sm:px-6 md:px-10 md:pt-24">
          <p className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">Estudio · menciones públicas</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950 md:text-6xl">Trump dice</h1>
          <p className="mt-5 max-w-2xl text-lg text-neutral-500">
            Cada vez que Donald Trump nombró una acción desde el {formatShortDate(TRUMP_DICE_START)}: qué dijo, la fuente y cuánto
            se movió desde ese día. La estrategia compra US$1.000 en cada mención y mantiene.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-neutral-200/80 p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]">
              <p className="text-[13px] text-neutral-500">Estrategia Trump dice</p>
              <Pct value={strategy} className="mt-2 block text-4xl md:text-5xl" />
              <p className="mt-1 text-[12px] text-neutral-500">desde {formatShortDate(TRUMP_DICE_START)}</p>
            </div>
            <div className="rounded-3xl border border-neutral-200/80 p-6">
              <p className="text-[13px] text-neutral-500">S&amp;P 500 (^GSPC)</p>
              <Pct value={spxReturn} className="mt-2 block text-4xl md:text-5xl" />
              <p className="mt-1 text-[12px] text-neutral-500">mismo período</p>
            </div>
            <div className="rounded-3xl border border-neutral-200/80 p-6">
              <p className="text-[13px] text-neutral-500">Diferencia</p>
              <Pct value={strategy !== null && spxReturn !== null ? Math.round((strategy - spxReturn) * 100) / 100 : null} className="mt-2 block text-4xl md:text-5xl" />
              <p className="mt-1 text-[12px] text-neutral-500">{mentions.length} menciones verificadas</p>
            </div>
          </div>
          {lastDate ? <p className="mt-3 text-[12px] text-neutral-400">Actualizado el {formatShortDate(lastDate)}</p> : null}
          {isDemo ? (
            <p className="mt-3 text-[13px] text-neutral-500">Sin conexión con la base: se muestran las menciones verificadas sin cifras.</p>
          ) : null}
        </section>

        <section className="mx-auto w-full max-w-[1120px] px-4 pb-24 sm:px-6 md:px-10">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">Cada mención</h2>
          <ul className="mt-6 divide-y divide-neutral-200/70 border-y border-neutral-200/70">
            {rows.map(({ m, r }) => (
              <li key={m.id} className="grid grid-cols-1 gap-3 py-5 sm:grid-cols-[110px_1fr_auto] sm:items-center sm:gap-6">
                <div>
                  <p className="text-[13px] text-neutral-500">{formatMentionDate(m.saidAt)}</p>
                  <p className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-950">{m.symbol}</p>
                  {m.externalId ? <p className="text-[11px] text-neutral-400">{m.externalId}</p> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] text-neutral-800">{m.quote}</p>
                  <p className="mt-1 text-[13px] text-neutral-500">
                    {m.company ? `${m.company} · ` : ""}
                    {mentionKindLabel(m.kind)} ·{" "}
                    <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-neutral-950">
                      Fuente
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-4 sm:justify-end">
                  <Spark points={r.spark} positive={(r.pct ?? 0) >= 0} />
                  <div className="text-right">
                    <Pct value={r.pct} className="block text-lg" />
                    <p className="text-[11px] text-neutral-400">{r.baseDate ? `desde ${formatShortDate(r.baseDate)}` : "sin precios"}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[12px] leading-relaxed text-neutral-500">
            Retorno de cada acción desde el primer cierre en o después de la fecha de entrada hasta el último cierre disponible.
            Rendimiento pasado no garantiza resultados futuros. No es asesoría de inversión.{" "}
            <Link href="/portfolio/trump-dice" className="underline underline-offset-2">Ver el portafolio</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
