import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, formatPctPlain, formatSignedPct } from "@/lib/utils";

/** D80 · Función nueva 1: datos planos calculados en el servidor (ResumenView). */
export interface PulsePortfolioRef {
  slug: string;
  name: string;
  /** Peso del ticker en esa cartera, 0–100. */
  weight: number;
}

export interface PulseConsensusItem {
  symbol: string;
  name: string;
  /** Nº de carteras seguidas (con posiciones visibles) que tienen el ticker. */
  count: number;
  /** Peso medio entre esas carteras, 0–100. */
  avgWeight: number;
  portfolios: PulsePortfolioRef[];
}

export interface PulseMover {
  id: string;
  slug: string;
  name: string;
  /** Variación real del día, % (null = sin serie). */
  day: number | null;
  /** Variación real YTD, % (null = sin serie). */
  ytd: number | null;
}

export interface FollowedPulseProps {
  consensus: PulseConsensusItem[];
  movers: PulseMover[];
  /** Carteras seguidas con posiciones visibles en el plan. */
  unlockedCount: number;
  /** Carteras seguidas totales. */
  followedCount: number;
}

const pctTone = (v: number | null) => (v === null ? "text-ink-400" : v >= 0 ? "text-positive" : "text-negative");

/**
 * Pulso y Consenso de tus Seguidos.
 *
 * Cruza las posiciones de las carteras seguidas cuyas posiciones están abiertas
 * para el plan (nunca usa carteras bloqueadas) y muestra, con filetes de 1px:
 *   - los tickers presentes en 2+ carteras, con su peso medio;
 *   - el ranking real de las carteras visibles (mejor/rezagado en 1D e YTD).
 *
 * Componente de servidor: recibe solo datos planos y no consulta nada.
 */
export function FollowedPulse({ consensus, movers, unlockedCount, followedCount }: FollowedPulseProps) {
  const rank = [...movers].sort((a, b) => {
    if (a.day === null && b.day === null) {
      if (a.ytd === null && b.ytd === null) return 0;
      if (a.ytd === null) return 1;
      if (b.ytd === null) return -1;
      return b.ytd - a.ytd;
    }
    if (a.day === null) return 1;
    if (b.day === null) return -1;
    return b.day - a.day;
  });
  const withDay = rank.filter((m): m is PulseMover & { day: number } => m.day !== null);
  const withYtd = movers
    .filter((m): m is PulseMover & { ytd: number } => m.ytd !== null)
    .sort((a, b) => b.ytd - a.ytd);
  const bestDay = withDay[0];
  const worstDay = withDay[withDay.length - 1];
  const bestYtd = withYtd[0];
  const worstYtd = withYtd[withYtd.length - 1];
  const shown = rank.slice(0, 6);

  return (
    <section aria-label="Pulso y consenso de tus seguidos" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <div className="overflow-hidden rounded-app border border-ink-200 bg-white">
        <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b border-ink-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.14em] text-ink-500 uppercase">Pulso de tus seguidos</p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink-900 sm:text-[20px]">Consenso</h2>
          </div>
          <p className="text-[11px] text-ink-500 tabular-nums">
            {unlockedCount} de {followedCount} {followedCount === 1 ? "cartera" : "carteras"} con posiciones visibles
          </p>
        </header>

        {consensus.length > 0 ? (
          <>
            <ol className="divide-y divide-ink-200">
              {consensus.map((c, i) => (
                <li key={c.symbol} className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 shrink-0 text-[11px] text-ink-400 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <Link
                          href={`/accion/${encodeURIComponent(c.symbol.toLowerCase())}`}
                          className="text-[14px] font-semibold tracking-tight text-ink-900 hover:underline"
                        >
                          {c.symbol}
                        </Link>
                        <span className="min-w-0 max-w-full truncate text-[12px] text-ink-500">{c.name}</span>
                      </div>

                      <div className="mt-2 flex items-center gap-2.5">
                        <div className="h-0.5 min-w-0 flex-1 bg-ink-100" aria-hidden="true">
                          <div className="h-0.5 bg-ink-900" style={{ width: `${Math.max(1, Math.min(100, c.avgWeight))}%` }} />
                        </div>
                        <span className="shrink-0 text-[10px] text-ink-500 tabular-nums">
                          {c.count} {c.count === 1 ? "cartera" : "carteras"}
                        </span>
                      </div>

                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {c.portfolios.map((p) => (
                          <li key={p.slug} className="min-w-0">
                            <Link
                              href={`/app/portafolio/${p.slug}`}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ink-200 px-2 py-0.5 text-[10px] text-ink-600 hover:border-ink-900 hover:text-ink-900"
                            >
                              <span className="min-w-0 truncate">{p.name}</span>
                              <span className="shrink-0 font-semibold text-ink-900 tabular-nums">{formatPctPlain(p.weight, 1)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-semibold text-ink-900 tabular-nums">{formatPctPlain(c.avgWeight, 1)}</p>
                      <p className="mt-0.5 text-[9px] tracking-wide text-ink-500 uppercase">peso medio</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="border-t border-ink-200 px-4 py-2.5 text-[11px] leading-relaxed text-ink-500 sm:px-5">
              {unlockedCount > 15
                ? `Cruce sobre las primeras 15 de ${unlockedCount} carteras con posiciones visibles en tu plan.`
                : `Cruce sobre ${unlockedCount} ${unlockedCount === 1 ? "cartera" : "carteras"} con posiciones visibles en tu plan.`}
              {unlockedCount < followedCount ? " Las carteras con posiciones bloqueadas no se incluyen." : ""}
            </p>
          </>
        ) : unlockedCount < 2 ? (
          <div className="px-4 py-5 sm:px-5">
            <p className="text-[14px] font-medium text-ink-900">Aún no hay cruce de carteras</p>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-500">
              Cuando sigas 2 o más carteras con posiciones abiertas en tu plan, aquí aparece automáticamente el cruce de
              acciones en común, qué carteras coinciden en cada una y su peso medio.
            </p>
            <p className="mt-2 text-[11px] text-ink-400">
              Sigues {followedCount} {followedCount === 1 ? "cartera" : "carteras"}. Con posiciones visibles en tu plan:{" "}
              {unlockedCount}.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/app/explorar"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white hover:bg-black"
              >
                Explorar carteras
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                href="/compare"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:border-ink-900 hover:text-ink-900"
              >
                Comparar carteras
              </Link>
              {unlockedCount < followedCount && (
                <Link
                  href="/upgrade"
                  className="inline-flex h-9 items-center rounded-full border border-ink-900 px-4 text-[12px] font-medium text-ink-900 hover:bg-ink-50"
                >
                  Ver planes
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="px-4 py-5 sm:px-5">
            <p className="text-[14px] font-medium text-ink-900">Sin acciones en común</p>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-500">
              Las {unlockedCount} carteras con posiciones visibles en tu plan no comparten tickers todavía. Cuando dos o
              más coincidan, el cruce aparece aquí solo.
            </p>
            <p className="mt-2 text-[11px] text-ink-400">Sin coincidencias entre las posiciones visibles.</p>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-app border border-ink-200 bg-white">
        <header className="flex items-end justify-between gap-2 border-b border-ink-200 px-4 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.14em] text-ink-500 uppercase">Pulso</p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink-900 sm:text-[20px]">Mejor y rezagado</h2>
          </div>
          <span className="pb-0.5 text-[11px] text-ink-500 tabular-nums">{movers.length} con serie</span>
        </header>

        {movers.length === 0 ? (
          <div className="px-4 py-5">
            <p className="text-[13px] text-ink-500">
              Sin serie para tus carteras visibles todavía. Cuando haya cierres, aquí verás el mejor y el más rezagado
              del día y de lo que va del año.
            </p>
            <p className="mt-2 text-[11px] text-ink-400">Las carteras bloqueadas no se incluyen.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 divide-x divide-ink-200 border-b border-ink-200">
              <PulseLead label="Mejor hoy" mover={bestDay} metric="day" />
              <PulseLead label="Rezagado hoy" mover={worstDay} metric="day" />
            </div>
            <div className="grid grid-cols-2 divide-x divide-ink-200 border-b border-ink-200">
              <PulseLead label="Mejor YTD" mover={bestYtd} metric="ytd" />
              <PulseLead label="Rezagado YTD" mover={worstYtd} metric="ytd" />
            </div>

            <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-[9px] font-medium tracking-[0.1em] text-ink-400 uppercase">
              <span className="w-4 shrink-0">#</span>
              <span className="min-w-0 flex-1">Cartera</span>
              <span className="w-[52px] shrink-0 text-right">1D</span>
              <span className="w-[52px] shrink-0 text-right">YTD</span>
            </div>
            <ol className="divide-y divide-ink-200">
              {shown.map((m, i) => (
                <li key={m.id}>
                  <Link href={`/app/portafolio/${m.slug}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-ink-50">
                    <span className="w-4 shrink-0 text-[10px] text-ink-400 tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-900">{m.name}</span>
                    <span className={cn("w-[52px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums", pctTone(m.day))}>
                      {m.day === null ? <span className="text-[9px] font-normal">Sin dato</span> : formatSignedPct(m.day, 2)}
                    </span>
                    <span className={cn("w-[52px] shrink-0 text-right text-[11.5px] tabular-nums", pctTone(m.ytd))}>
                      {m.ytd === null ? <span className="text-[9px] text-ink-400">Sin dato</span> : formatSignedPct(m.ytd, 1)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            {rank.length > shown.length && (
              <div className="border-t border-ink-200 px-4 py-2.5">
                <Link href="/app/seguimiento" className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-700 hover:text-ink-900">
                  Ver los {rank.length} seguidos con serie
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PulseLead({ label, mover, metric }: { label: string; mover?: PulseMover; metric: "day" | "ytd" }) {
  const value = mover ? mover[metric] : null;
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[9px] font-medium tracking-[0.12em] text-ink-500 uppercase">{label}</p>
      {mover && value !== null ? (
        <>
          <Link
            href={`/app/portafolio/${mover.slug}`}
            className="mt-1 block truncate text-[12px] font-medium text-ink-900 hover:underline"
          >
            {mover.name}
          </Link>
          <p className={cn("mt-0.5 text-[15px] font-semibold tabular-nums", pctTone(value))}>
            {formatSignedPct(value, metric === "day" ? 2 : 1)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-ink-400">Sin dato</p>
      )}
    </div>
  );
}
