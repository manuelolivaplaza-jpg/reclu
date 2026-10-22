import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { simulateInvestment, seriesPeriodLabel } from "@/lib/simulated-investment";

export interface PortfolioHeroSeriesPoint {
  /** Fecha del punto (YYYY-MM-DD o ISO). */
  date: string;
  /** Retorno acumulado en % (misma semántica que portfolio_performance). */
  value_pct: number;
}

export interface PortfolioHeroProps {
  /** Nombre del portafolio. */
  name: string;
  /**
   * Serie de rendimiento YA recortada por el servidor (muro de pago).
   * Sin serie => no se muestra el % ni la tarjeta de simulación.
   */
  series?: PortfolioHeroSeriesPoint[];
  /** Nº de seguidores (dato real del portafolio). */
  followers?: number | null;
  /** La serie es ilustrativa (modo demo): se rotula "Ejemplo". */
  demo?: boolean;
  /** CTA (por ejemplo, el FollowButton). */
  action?: ReactNode;
  /** Monto de la simulación en USD. */
  amount?: number;
}

const AMOUNT = 10_000;

function formatUsd(value: number): string {
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(value)} USD`;
}

function formatPct(value: number): string {
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value)}%`;
}

/**
 * Hero del detalle de un portafolio.
 *
 * Izquierda: nombre + variación del período ("<Nombre> subió X%"), botón de
 * ayuda que explica de dónde sale el número, pastilla con una métrica real
 * y el CTA de seguir.
 *
 * Derecha: tarjeta oscura con la simulación ("si hubieras invertido 10.000
 * USD") y el gráfico de área de la serie.
 *
 * Sin serie (muro de pago o falta de datos) no se muestra ni el % ni la
 * tarjeta: solo el título y el CTA. Nunca un número inventado.
 */
export function PortfolioHero({
  name,
  series,
  followers,
  demo = false,
  action,
  amount = AMOUNT,
}: PortfolioHeroProps) {
  const cleanSeries = (series ?? []).filter(
    (point) =>
      !!point &&
      typeof point.date === "string" &&
      point.date.length > 0 &&
      Number.isFinite(Number(point.value_pct)),
  );

  const simulation =
    cleanSeries.length >= 2 ? simulateInvestment(cleanSeries, amount) : null;
  const periodLabel = seriesPeriodLabel(cleanSeries);

  const pct = simulation?.gainPct ?? 0;
  const positive = pct >= 0;

  // Métrica real de la pastilla: seguidores (dato del portafolio).
  const pill = (() => {
    if (typeof followers === "number" && followers > 0) {
      return `${new Intl.NumberFormat("es-CL").format(followers)} seguidores`;
    }
    return null;
  })();

  const explanation = periodLabel
    ? `Variación calculada sobre la serie de rendimiento ${periodLabel}, en base al valor de la cartera. No es una recomendación de inversión.`
    : "Variación calculada sobre la serie de rendimiento del portafolio. No es una recomendación de inversión.";

  return (
    <section className="border-b border-neutral-200/70 bg-white">
      <div className="container-page py-10">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          {/* Izquierda: título, métrica y CTA */}
          <div className="min-w-0">
            <h1 className="font-sans text-[clamp(2.25rem,5.2vw,3.75rem)] font-semibold leading-[0.98] tracking-tight text-neutral-950">
              {simulation ? (
                <>
                  {name} {positive ? "subió" : "bajó"}{" "}
                  <span className={positive ? "text-green-600" : "text-red-600"}>
                    {formatPct(Math.abs(pct))}
                  </span>
                </>
              ) : (
                <>{name}</>
              )}
            </h1>

            {simulation ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-neutral-500">
                  Retorno {periodLabel}
                </span>
                <span className="group relative inline-flex">
                  <button
                    type="button"
                    aria-label={explanation}
                    title={explanation}
                    className="inline-flex size-5 items-center justify-center rounded-full border border-neutral-200/70 text-neutral-500 transition-colors hover:border-neutral-950 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-950"
                  >
                    <Info className="size-3" aria-hidden="true" />
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-0 top-7 z-20 hidden w-72 rounded-xl border border-neutral-200/70 bg-white p-3 text-[12px] leading-relaxed text-neutral-500 shadow-sm group-hover:block group-focus-within:block"
                  >
                    {explanation}
                  </span>
                </span>
                {demo ? (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
                    Ejemplo
                  </span>
                ) : null}
              </div>
            ) : null}

            {pill ? (
              <p className="mt-5 inline-flex rounded-full bg-green-50 px-3 py-1.5 text-[13px] font-medium text-green-700">
                {pill}
              </p>
            ) : null}

            {action ? (
              <div className="mt-6 max-w-xs [&_button]:rounded-full [&_button]:border-neutral-950 [&_button]:bg-neutral-950 [&_button]:text-white [&_button]:hover:bg-neutral-800 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-offset-2 [&_button]:focus-visible:ring-neutral-950">
                {action}
              </div>
            ) : null}
          </div>

          {/* Derecha: simulación */}
          {simulation ? (
            <div className="min-w-0">
              <div className="rounded-2xl bg-[#111] p-6 text-white">
                <p className="text-[13px] text-white/60">
                  Si hubieras invertido {formatUsd(amount)}
                </p>
                <p className="num mt-2 text-[clamp(1.75rem,3.6vw,2.5rem)] leading-none tracking-tight">
                  {formatUsd(simulation.finalValue)}
                </p>
                <p
                  className={
                    simulation.gain >= 0
                      ? "num mt-2 text-[15px] text-green-400"
                      : "num mt-2 text-[15px] text-red-400"
                  }
                >
                  {simulation.gain >= 0 ? "+" : "−"}
                  {formatUsd(Math.abs(simulation.gain))} ({formatPct(Math.abs(simulation.gainPct))})
                </p>

                <div className="mt-5">
                  <AreaChart
                    points={simulation.points.map((point) => ({
                      x: point.date,
                      y: point.value,
                    }))}
                    positive={simulation.gainPct >= 0}
                    dark
                    height={140}
                    formatValue={(value) => formatUsd(value)}
                    ariaLabel={`Evolución de una inversión de ${formatUsd(
                      amount,
                    )}: de ${formatUsd(simulation.points[0].value)} a ${formatUsd(
                      simulation.finalValue,
                    )}.`}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Basado en rendimiento histórico. Rentabilidades pasadas no garantizan
                resultados futuros.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
