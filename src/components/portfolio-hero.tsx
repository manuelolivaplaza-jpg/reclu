import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { PortfolioRangeChart } from "@/components/charts/portfolio-range-chart";
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
  /** Avatar del portafolio (D4), sobre el título. */
  avatar?: ReactNode;
  /** Monto de la simulación en USD. */
  amount?: number;
  /**
   * d69: retorno real "desde el inicio" (serie completa, compuesto). Es la
   * misma cifra que explore y la home; el gráfico sigue recortado por el muro.
   */
  headline?: { pct: number; label: string } | null;
}

const AMOUNT = 10_000;

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
  avatar,
  amount = AMOUNT,
  headline = null,
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
  const periodLabel = headline?.label ?? seriesPeriodLabel(cleanSeries);

  const pct = headline?.pct ?? simulation?.gainPct ?? 0;
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
    <section className="border-b border-ink-200 bg-white">
      <div className="container-page py-6 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          {/* Izquierda: identidad, seguidores y CTA */}
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              {avatar ? <div className="shrink-0">{avatar}</div> : null}
              <div className="min-w-0">
                <h1 className="font-sans text-[clamp(1.75rem,4.4vw,2.75rem)] font-semibold leading-[1.02] tracking-tight text-ink-900">
                  {name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-500">
                  {pill ? (
                    <span className="inline-flex rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-700">
                      {pill}
                    </span>
                  ) : null}
                  {simulation ? <span>Serie {periodLabel}</span> : null}
                  {simulation ? (
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        aria-label={explanation}
                        title={explanation}
                        className="inline-flex size-5 items-center justify-center rounded-full border border-ink-200 text-ink-500 transition-colors hover:border-ink-900 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink-900"
                      >
                        <Info className="size-3" aria-hidden="true" />
                      </button>
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-0 top-7 z-20 hidden w-72 rounded-xl border border-ink-200 bg-white p-3 text-[12px] leading-relaxed text-ink-500 shadow-sm group-hover:block group-focus-within:block"
                      >
                        {explanation}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {simulation ? (
              <p className="mt-5 text-[15px] leading-relaxed text-ink-600">
                {name} {positive ? "subió" : "bajó"}{" "}
                <span className={positive ? "font-medium text-positive" : "font-medium text-negative"}>
                  {formatPct(Math.abs(pct))}
                </span>{" "}
                {periodLabel}.
              </p>
            ) : null}

            {action ? (
              <div className="fixed inset-x-0 bottom-[var(--app-tabbar-h,0px)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 border-t border-ink-200 bg-white/90 px-4 py-3 backdrop-blur md:static md:mt-6 md:max-w-xs md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none [&_button]:w-full [&_button]:rounded-full [&_button]:border-ink-900 [&_button]:bg-ink-900 [&_button]:text-white [&_button]:hover:bg-ink-800 [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-offset-2 [&_button]:focus-visible:ring-ink-900">
                {action}
              </div>
            ) : null}
          </div>

          {/* Derecha: retorno por rango y gráfico SVG propio */}
          {simulation ? (
            <PortfolioRangeChart series={cleanSeries} amount={amount} demo={demo} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
