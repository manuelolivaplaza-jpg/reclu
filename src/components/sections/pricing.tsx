"use client";

import { useEffect, useState } from "react";
import { Check, Lock, Minus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/reveal";
import { track } from "@/lib/analytics";
import { PLANS, TRIAL_DAYS, followLimitLabel, formatClp, planFeatures } from "@/lib/plans";

type Billing = "monthly" | "annual";
type Tone = "light" | "dark";

/**
 * Regla de acceso vigente: seguir portafolios y ver todas las acciones es de
 * pago; las carteras recomendadas de corredoras son gratis. Los bullets de
 * Gratis se muestran aquí (no en `lib/plans.ts`) para no pisar el cambio del
 * muro de pago que vive en otra rama.
 */
const FREE_FEATURES: { text: string; ai?: boolean }[] = [
  { text: "Carteras recomendadas de corredoras (Renta 4, BTG y más) con todas sus acciones" },
  { text: "Explorador público y retorno YTD de cada portafolio" },
  { text: "Resumen semanal «Lo que movieron los grandes»" },
  { text: "Alertas por email con resumen diario" },
  { text: "5 consultas diarias al asistente IA", ai: true },
];

/** Primer bullet de Pro, propio de esta sección (no vive en `lib/plans.ts`). */
const PRO_HEADLINE = "Seguir portafolios y ver todas sus acciones";

const COMPARISON: { label: string; free: string; pro: string; elite: string; ai?: boolean }[] = [
  { label: "Carteras recomendadas de corredoras", free: "Incluido", pro: "Incluido", elite: "Incluido" },
  { label: "Seguir portafolios", free: "-", pro: followLimitLabel("pro"), elite: followLimitLabel("elite") },
  { label: "Ver todas las acciones de cada portafolio", free: "Solo corredoras", pro: "Incluido", elite: "Incluido" },
  { label: "Frecuencia de alertas", free: "Diaria", pro: "Tiempo real", elite: "Prioritaria instantánea" },
  { label: "Fondos 13F y carteras Premium", free: "-", pro: "Parcial", elite: "Acceso total" },
  { label: "Asistente Fraccion AI", free: "5 por día", pro: "50 por semana", elite: "Ilimitado", ai: true },
  { label: "Exportación CSV y Cruce Multi-cartera", free: "-", pro: "-", elite: "Incluido" },
];

/** Descuento real del ciclo anual, calculado desde `PLANS` (nunca a mano). */
function annualDiscountPct(plan: { monthlyPrice: number; annualTotalPrice: number }): number {
  const fullYear = plan.monthlyPrice * 12;
  if (fullYear <= 0) return 0;
  return Math.round((1 - plan.annualTotalPrice / fullYear) * 100);
}

function Cell({ value }: { value: string }) {
  if (value === "-")
    return <Minus className="size-4 text-ink-500 dark:text-neutral-500" aria-label="No incluido" />;
  if (value === "Incluido")
    return <Check className="size-4 text-ink-900 dark:text-white" strokeWidth={1.75} aria-label="Incluido" />;
  return <span>{value}</span>;
}

/**
 * Lista de beneficios sin relleno ni check verde: filas separadas por filetes
 * de 1px y un check tipográfico en `currentColor`. En la tarjeta Pro (fondo
 * negro) la tinta se invierte a blanco.
 */
function FeatureList({ items, tone = "light" }: { items: string[]; tone?: Tone }) {
  const dark = tone === "dark";
  return (
    <ul
      className={
        "mt-6 flex flex-1 flex-col border-t " +
        (dark ? "border-white/15" : "border-ink-200 dark:border-white/12")
      }
    >
      {items.map((f) => (
        <li
          key={f}
          className={
            "flex gap-2.5 border-b py-3 text-[14px] leading-snug " +
            (dark
              ? "border-white/15 text-white/85"
              : "border-ink-200 text-ink-800 dark:border-white/12 dark:text-neutral-200")
          }
        >
          <Check
            className={
              "mt-[3px] size-3.5 shrink-0 " + (dark ? "text-white" : "text-ink-900 dark:text-white")
            }
            strokeWidth={1.75}
            aria-hidden
          />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

/** Precios: tarjetas con jerarquía (Pro en negativo), regla de acceso y comparación. */
export function Pricing({
  aiOn = false,
  titleAs = "h2",
}: {
  aiOn?: boolean;
  /** En /planes el título es el único h1; en la home es un h2. */
  titleAs?: "h1" | "h2";
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const annual = billing === "annual";
  const Heading = titleAs;

  // IA apagada (default del lanzamiento): ni un bullet ni una fila con IA.
  const freeFeatures = FREE_FEATURES.filter((f) => aiOn || f.ai !== true).map((f) => f.text);
  const proFeatures = [PRO_HEADLINE, ...planFeatures("pro", aiOn)];
  const eliteFeatures = planFeatures("elite", aiOn);
  const comparison = COMPARISON.filter((row) => aiOn || row.ai !== true);

  useEffect(() => {
    track("pricing_view", { billing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxAnnualDiscount = Math.max(annualDiscountPct(PLANS.pro), annualDiscountPct(PLANS.elite));
  const proAnnualSaving = PLANS.pro.monthlyPrice * 12 - PLANS.pro.annualTotalPrice;

  const proPrice = annual ? PLANS.pro.annualTotalPrice : PLANS.pro.monthlyPrice;
  const elitePrice = annual ? PLANS.elite.annualTotalPrice : PLANS.elite.monthlyPrice;
  const unit = annual ? "CLP / año" : "CLP / mes";

  return (
    <section
      id="precios"
      aria-labelledby="precios-title"
      className="section-y border-t border-ink-300 bg-white dark:border-white/12 dark:bg-ink-950"
    >
      <div className="container-page">
        <FadeIn>
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label-line">Planes y precios</p>
              <Heading
                id="precios-title"
                className="type-section mt-4 text-ink-900 dark:text-white"
              >
                Empieza en cero.
              </Heading>
              <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-500 dark:text-neutral-400">
                Las carteras de corredoras son gratis. Para seguir portafolios de políticos,
                fondos y ETFs y ver todas sus posiciones, elige Pro o Elite.
              </p>
            </div>

            <div
              role="group"
              aria-label="Ciclo de facturación"
              className="flex w-full rounded-full border border-ink-300 bg-white p-1 dark:border-white/20 dark:bg-ink-950 sm:w-auto"
            >
              {(["monthly", "annual"] as const).map((b) => {
                const active = billing === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBilling(b)}
                    aria-pressed={active}
                    className={
                      "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs sm:text-sm font-medium transition-colors sm:flex-none sm:px-5 " +
                      (active
                        ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900 "
                        : "text-ink-500 hover:text-ink-900 focus-visible:outline-ink-900 dark:text-neutral-400 dark:hover:text-white dark:focus-visible:outline-white ")
                    }
                  >
                    {b === "monthly" ? "Mensual" : "Anual"}
                    {b === "annual" && (
                      <span
                        className={
                          "rounded-full px-1.5 py-0.5 text-[10px] leading-none sm:text-[11px] " +
                          (active
                            ? "bg-white/15 text-white dark:bg-ink-900/10 dark:text-ink-900"
                            : "border border-ink-300 text-ink-500 dark:border-white/20 dark:text-neutral-400")
                        }
                      >
                        hasta −{maxAnnualDiscount}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </FadeIn>

        {/* Regla de acceso: dos columnas separadas por un filete de 1px. */}
        <FadeIn delay={0.04} className="mt-10">
          <div className="grid gap-px border border-ink-300 bg-ink-300 dark:border-white/15 dark:bg-white/15 sm:grid-cols-2">
            <div className="flex items-start gap-3 bg-white p-5 dark:bg-ink-950">
              <Check
                className="mt-0.5 size-4 shrink-0 text-ink-900 dark:text-white"
                strokeWidth={1.75}
                aria-hidden
              />
              <div>
                <p className="text-[14px] font-medium text-ink-900 dark:text-white">Gratis para todos</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
                  Carteras recomendadas de corredoras, como Renta 4, con todas sus acciones.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white p-5 dark:bg-ink-950">
              <Lock
                className="mt-0.5 size-4 shrink-0 text-ink-900 dark:text-white"
                strokeWidth={1.75}
                aria-hidden
              />
              <div>
                <p className="text-[14px] font-medium text-ink-900 dark:text-white">Con suscripción</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
                  Seguir portafolios y ver todas las acciones de políticos, fondos y ETFs.
                </p>
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.08} className="mt-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
            {/* Gratis */}
            <div className="flex flex-col rounded-none bg-white dark:bg-ink-950 border border-ink-300 dark:border-white/15 p-6 md:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-medium text-ink-900 dark:text-white">{PLANS.free.name}</p>
                <p className="text-[12px] text-ink-500 dark:text-neutral-400">{PLANS.free.tagline}</p>
              </div>
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num text-[44px] leading-none text-ink-900 dark:text-white">
                  {formatClp(PLANS.free.monthlyPrice)}
                </span>
                <span className="text-[13px] text-ink-500 dark:text-neutral-400">CLP</span>
              </p>
              <p className="mt-2 text-[13px] text-ink-500 dark:text-neutral-400">Sin tarjeta</p>
              <FeatureList items={freeFeatures} />
              <ButtonLink href="/signup" variant="outline" size="lg" className="mt-8 w-full">
                Crear cuenta
              </ButtonLink>
            </div>

            {/* Pro: bloque negro SpaceX, texto blanco y CTA píldora blanca. */}
            <div className="flex flex-col rounded-none border border-[#0a0a0a] bg-[#0a0a0a] p-6 text-white dark:border-white/20 md:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-medium text-white">{PLANS.pro.name}</p>
                <p className="text-[12px] text-white/60">{PLANS.pro.tagline}</p>
              </div>
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num text-[44px] leading-none text-white">{formatClp(proPrice)}</span>
                <span className="text-[13px] text-white/60">{unit}</span>
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/60">
                {annual ? (
                  <>
                    {formatClp(PLANS.pro.annualMonthlyPrice)} / mes ·{" "}
                    <button
                      type="button"
                      onClick={() => setBilling("monthly")}
                      aria-label={`Ver facturación mensual: ${formatClp(PLANS.pro.monthlyPrice)} al mes`}
                      className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline-white"
                    >
                      {formatClp(PLANS.pro.monthlyPrice)} / mes
                    </button>{" "}
                    en pago mensual
                  </>
                ) : (
                  <>
                    o{" "}
                    <button
                      type="button"
                      onClick={() => setBilling("annual")}
                      aria-label={`Ver facturación anual: ${formatClp(PLANS.pro.annualTotalPrice)} al año`}
                      className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline-white"
                    >
                      {formatClp(PLANS.pro.annualTotalPrice)} / año
                    </button>
                  </>
                )}
              </p>
              {proAnnualSaving > 0 && (
                <p className="mt-1 text-[12px] text-white/50">
                  Ahorras {formatClp(proAnnualSaving)} al año con el plan anual.
                </p>
              )}
              <p className="mt-3 text-[13px] text-white/60">
                {TRIAL_DAYS} días de prueba en cuentas nuevas.
              </p>
              <FeatureList items={proFeatures} tone="dark" />
              <ButtonLink
                href="/signup?plan=pro"
                size="lg"
                className="mt-8 w-full bg-white text-ink-900 hover:bg-ink-100 focus-visible:outline-white dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100"
                onClick={() => track("checkout_click", { plan: "pro", source: "pricing" })}
              >
                Elegir Pro
              </ButtonLink>
            </div>

            {/* Elite */}
            <div className="flex flex-col rounded-none bg-white dark:bg-ink-950 border border-ink-300 dark:border-white/15 p-6 md:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-medium text-ink-900 dark:text-white">{PLANS.elite.name}</p>
                <p className="text-[12px] text-ink-500 dark:text-neutral-400">{PLANS.elite.tagline}</p>
              </div>
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num text-[44px] leading-none text-ink-900 dark:text-white">
                  {formatClp(elitePrice)}
                </span>
                <span className="text-[13px] text-ink-500 dark:text-neutral-400">{unit}</span>
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
                {annual ? (
                  <>
                    {formatClp(PLANS.elite.annualMonthlyPrice)} / mes ·{" "}
                    <button
                      type="button"
                      onClick={() => setBilling("monthly")}
                      aria-label={`Ver facturación mensual: ${formatClp(PLANS.elite.monthlyPrice)} al mes`}
                      className="text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-ink-900 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white"
                    >
                      {formatClp(PLANS.elite.monthlyPrice)} / mes
                    </button>{" "}
                    en pago mensual
                  </>
                ) : (
                  <>
                    o{" "}
                    <button
                      type="button"
                      onClick={() => setBilling("annual")}
                      aria-label={`Ver facturación anual: ${formatClp(PLANS.elite.annualTotalPrice)} al año`}
                      className="text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-ink-900 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white"
                    >
                      {formatClp(PLANS.elite.annualTotalPrice)} / año
                    </button>
                  </>
                )}
              </p>
              <p className="mt-2 text-[13px] text-ink-500 dark:text-neutral-400">Todo Pro, sin límites</p>
              <FeatureList items={eliteFeatures} />
              <ButtonLink
                href="/signup?plan=elite"
                variant="outline"
                size="lg"
                className="mt-8 w-full"
                onClick={() => track("checkout_click", { plan: "elite", source: "pricing" })}
              >
                Pasar a Elite
              </ButtonLink>
            </div>
          </div>
        </FadeIn>

        {/* Comparación: tarjetas en celular, tabla en escritorio. */}
        <FadeIn delay={0.12} className="mt-12">
          <h3 className="text-[18px] font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
            Comparación rápida
          </h3>

          <div className="mt-4 flex flex-col gap-3 md:hidden">
            {comparison.map((row) => (
              <div
                key={row.label}
                className="rounded-none border border-ink-300 bg-white p-4 dark:border-white/15 dark:bg-ink-950"
              >
                <p className="text-[14px] font-medium text-ink-900 dark:text-white">{row.label}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                  {(
                    [
                      ["Gratis", row.free],
                      ["Pro", row.pro],
                      ["Elite", row.elite],
                    ] as const
                  ).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded-none border border-ink-200 px-2.5 py-2 dark:border-white/12"
                    >
                      <dt className="text-[11px] text-ink-500 dark:text-neutral-400">{k}</dt>
                      <dd className="mt-1 flex min-h-4 items-center text-ink-900 dark:text-white">
                        <Cell value={v} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-none border border-ink-300 bg-white dark:border-white/15 dark:bg-ink-950 md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-ink-300 bg-ink-50 text-left text-[13px] text-ink-500 dark:border-white/12 dark:bg-white/5 dark:text-neutral-400">
                  <th className="px-5 py-3.5 font-medium">Función</th>
                  <th className="px-5 py-3.5 font-medium">Gratis</th>
                  <th className="px-5 py-3.5 font-medium text-ink-900 dark:text-white">Pro</th>
                  <th className="px-5 py-3.5 font-medium">Elite</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr
                    key={row.label}
                    className="border-t border-ink-200 dark:border-white/12"
                  >
                    <td className="px-5 py-3.5 text-ink-900 dark:text-white">{row.label}</td>
                    <td className="px-5 py-3.5 text-ink-500 dark:text-neutral-400">
                      <Cell value={row.free} />
                    </td>
                    <td className="bg-ink-50/60 px-5 py-3.5 font-medium text-ink-900 dark:bg-white/[0.04] dark:text-white">
                      <Cell value={row.pro} />
                    </td>
                    <td className="px-5 py-3.5 text-ink-900 dark:text-white">
                      <Cell value={row.elite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>

        <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-500 dark:text-neutral-400">
          <span>Precios en CLP. Facturación mensual o anual.</span>
          <span aria-hidden>·</span>
          <span>
            Planes para equipos:{" "}
            <a
              href="mailto:hola@fraccion.si"
              className="text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-ink-900 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white"
            >
              hola@fraccion.si
            </a>
          </span>
        </p>
      </div>
    </section>
  );
}
