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
  { text: "Carteras recomendadas de corredoras (Renta 4, BTG y más) con todas sus posiciones" },
  { text: "Explorador público y retorno YTD de cada portafolio" },
  { text: "Resumen semanal «Lo que movieron los grandes»" },
  { text: "Alertas por email con resumen diario o semanal" },
  { text: `${PLANS.free.chatQuota.limit} consultas diarias al asistente IA`, ai: true },
];

/**
 * Primer bullet de Pro, propio de esta sección (no vive en `lib/plans.ts`).
 * No enumera categorías: `plans.ts` acota Pro a políticos y corredoras, y la
 * tarjeta no debe prometer más de lo que el plan entrega. El tope sale de
 * `followLimitLabel("pro")`, nunca escrito a mano.
 */
const PRO_HEADLINE = `Seguir hasta ${followLimitLabel("pro")} portafolios con todas sus posiciones`;

/** Cupo del asistente ya formateado, leído de `PLANS` (sin cifras a mano). */
function chatQuotaLabel(plan: "free" | "pro" | "elite"): string {
  const { limit, window: period } = PLANS[plan].chatQuota;
  if (!Number.isFinite(limit) || period === "unlimited") return "Ilimitado";
  return `${limit} ${period === "day" ? "por día" : "por semana"}`;
}

const COMPARISON: { label: string; free: string; pro: string; elite: string; ai?: boolean }[] = [
  { label: "Carteras recomendadas de corredoras", free: "Incluido", pro: "Incluido", elite: "Incluido" },
  { label: "Seguir portafolios", free: "-", pro: `Hasta ${followLimitLabel("pro")}`, elite: followLimitLabel("elite") },
  { label: "Ver todas las posiciones de cada portafolio", free: "Solo corredoras", pro: "Incluido", elite: "Incluido" },
  {
    label: "Fondos 13F institucionales y soberanos",
    free: "-",
    pro: "-",
    elite: "Incluido",
  },
  { label: "Frecuencia de alertas", free: "Diaria o semanal", pro: "Tiempo real", elite: "Tiempo real" },
  {
    label: "Alertas automáticas de Mi portafolio",
    free: "-",
    pro: "Resumen diario",
    elite: `Tiempo real, hasta ${PLANS.elite.autoAlertsMaxPerDay} al día`,
  },
  {
    label: "Asistente Fraccion AI",
    free: chatQuotaLabel("free"),
    pro: chatQuotaLabel("pro"),
    elite: chatQuotaLabel("elite"),
    ai: true,
  },
  { label: "Exportación CSV y comparador multi-cartera", free: "-", pro: "-", elite: "Incluido" },
];

/** Descuento real del ciclo anual, calculado desde `PLANS` (nunca a mano). */
function annualDiscountPct(plan: { monthlyPrice: number; annualTotalPrice: number }): number {
  const fullYear = plan.monthlyPrice * 12;
  if (fullYear <= 0) return 0;
  return Math.round((1 - plan.annualTotalPrice / fullYear) * 100);
}

function Cell({ value }: { value: string }) {
  if (value === "-")
    return (
      <span className="inline-flex items-center">
        <Minus className="size-4 shrink-0 text-ink-500 dark:text-neutral-400" aria-hidden />
        <span className="sr-only">No incluido</span>
      </span>
    );
  if (value === "Incluido")
    return (
      <span className="inline-flex items-center">
        <Check
          className="size-4 shrink-0 text-ink-900 dark:text-white"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="sr-only">Incluido</span>
      </span>
    );
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
  /** En /planes el h1 ya lo emite `Pricing`, así que la comparación es h2. */
  const ComparisonHeading = titleAs === "h1" ? "h2" : "h3";

  // IA apagada (default del lanzamiento): ni un bullet ni una fila con IA.
  const freeFeatures = FREE_FEATURES.filter((f) => aiOn || f.ai !== true).map((f) => f.text);
  const proFeatures = [
    PRO_HEADLINE,
    ...planFeatures("pro", aiOn).filter((feature) => !feature.startsWith("Seguir hasta ")),
  ];
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
                Las carteras de corredoras son gratis. Seguir portafolios (políticos, fondos y
                ETFs) y ver todas sus posiciones requiere Pro o Elite.
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
                      "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 sm:flex-none sm:px-5 sm:text-sm dark:focus-visible:outline-white " +
                      (active
                        ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900 "
                        : "text-ink-500 hover:text-ink-900 dark:text-neutral-400 dark:hover:text-white")
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
          <p className="sr-only" role="status">
            {annual ? "Mostrando precios del ciclo anual." : "Mostrando precios del ciclo mensual."}
          </p>
        </FadeIn>

        {/* Regla de acceso: dos columnas separadas por un filete de 1px. */}
        <FadeIn delay={0.04} className="mt-10">
          <div className="grid gap-px border border-ink-300 bg-ink-300 dark:border-white/15 dark:bg-white/15 sm:grid-cols-2">
            <div className="flex items-start gap-3 bg-white p-5 dark:bg-panel">
              <Check
                className="mt-0.5 size-4 shrink-0 text-ink-900 dark:text-white"
                strokeWidth={1.75}
                aria-hidden
              />
              <div>
                <p className="text-[14px] font-medium text-ink-900 dark:text-white">Gratis para todos</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
                  Carteras recomendadas de corredoras, como Renta 4, con todas sus posiciones.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white p-5 dark:bg-panel">
              <Lock
                className="mt-0.5 size-4 shrink-0 text-ink-900 dark:text-white"
                strokeWidth={1.75}
                aria-hidden
              />
              <div>
                <p className="text-[14px] font-medium text-ink-900 dark:text-white">Con suscripción</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500 dark:text-neutral-400">
                  Seguir portafolios y ver todas las posiciones de políticos, fondos y ETFs.
                </p>
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.08} className="mt-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
            {/* Gratis */}
            <div className="flex flex-col rounded-none border border-ink-300 bg-white p-6 dark:border-white/15 dark:bg-panel md:p-8">
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
                Empezar gratis
              </ButtonLink>
            </div>

            {/* Pro: bloque negro SpaceX, texto blanco y CTA píldora blanca. */}
            <div className="flex flex-col rounded-none border border-ink-900 bg-ink-900 p-6 text-white dark:border-white/25 md:p-8">
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
                    Equivale a {formatClp(PLANS.pro.annualMonthlyPrice)} al mes ·{" "}
                    <button
                      type="button"
                      onClick={() => setBilling("monthly")}
                      aria-label={`Ver facturación mensual: ${formatClp(PLANS.pro.monthlyPrice)} al mes`}
                      className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {formatClp(PLANS.pro.monthlyPrice)} al mes
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
                      className="text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {formatClp(PLANS.pro.annualTotalPrice)} al año
                    </button>
                  </>
                )}
              </p>
              {proAnnualSaving > 0 && (
                <p className="mt-1 text-[12px] text-white/65">
                  {annual
                    ? `Ahorras ${formatClp(proAnnualSaving)} al año frente al pago mensual.`
                    : `Ahorras ${formatClp(proAnnualSaving)} al año con el ciclo anual.`}
                </p>
              )}
              <p className="mt-3 text-[13px] text-white/60">
                {TRIAL_DAYS} días de prueba de Pro en cuentas nuevas.
              </p>
              <FeatureList items={proFeatures} tone="dark" />
              <ButtonLink
                href="/signup?plan=pro"
                size="lg"
                className="mt-8 w-full bg-white text-ink-900 hover:bg-ink-100 active:bg-ink-200 focus-visible:outline-white dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100 dark:active:bg-ink-200"
                onClick={() => track("checkout_click", { plan: "pro", source: "pricing" })}
              >
                Elegir Pro
              </ButtonLink>
            </div>

            {/* Elite */}
            <div className="flex flex-col rounded-none border border-ink-300 bg-white p-6 dark:border-white/15 dark:bg-panel md:p-8">
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
                    Equivale a {formatClp(PLANS.elite.annualMonthlyPrice)} al mes ·{" "}
                    <button
                      type="button"
                      onClick={() => setBilling("monthly")}
                      aria-label={`Ver facturación mensual: ${formatClp(PLANS.elite.monthlyPrice)} al mes`}
                      className="text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white"
                    >
                      {formatClp(PLANS.elite.monthlyPrice)} al mes
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
                      className="text-ink-900 underline decoration-ink-300 underline-offset-4 transition-colors hover:decoration-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:text-white dark:decoration-white/30 dark:hover:decoration-white dark:focus-visible:outline-white"
                    >
                      {formatClp(PLANS.elite.annualTotalPrice)} al año
                    </button>
                  </>
                )}
              </p>
              <p className="mt-2 text-[13px] text-ink-500 dark:text-neutral-400">Todo lo de Pro y más</p>
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
          <ComparisonHeading className="text-[18px] font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
            Comparación rápida
          </ComparisonHeading>

          <div className="mt-4 flex flex-col gap-3 lg:hidden">
            {comparison.map((row) => (
              <div
                key={row.label}
                className="rounded-none border border-ink-300 bg-white p-4 dark:border-white/15 dark:bg-panel"
              >
                <p className="text-[14px] font-medium leading-snug text-ink-900 dark:text-white">
                  {row.label}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["Gratis", row.free],
                      ["Pro", row.pro],
                      ["Elite", row.elite],
                    ] as const
                  ).map(([k, v]) => (
                    <div
                      key={k}
                      className="min-w-0 rounded-none border border-ink-200 px-2 py-2 dark:border-white/12"
                    >
                      <dt className="text-[11px] leading-tight text-ink-500 dark:text-neutral-400">{k}</dt>
                      <dd className="mt-1 flex min-h-4 min-w-0 break-words text-[12px] leading-snug text-ink-900 dark:text-white">
                        <Cell value={v} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden overflow-x-auto rounded-none border border-ink-300 bg-white dark:border-white/15 dark:bg-panel lg:block">
            <table className="w-full text-[14px]">
              <caption className="sr-only">
                Comparación de funciones por plan: Gratis, Pro y Elite
              </caption>
              <thead>
                <tr className="border-b border-ink-300 bg-ink-50 text-left text-[13px] text-ink-500 dark:border-white/12 dark:bg-white/5 dark:text-neutral-400">
                  <th scope="col" className="px-5 py-3.5 text-left font-medium">
                    Función
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left font-medium">
                    Gratis
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left font-medium text-ink-900 dark:text-white">
                    Pro
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left font-medium">
                    Elite
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.label} className="border-t border-ink-200 dark:border-white/12">
                    <th
                      scope="row"
                      className="px-5 py-3.5 text-left align-top font-normal text-ink-900 dark:text-white"
                    >
                      {row.label}
                    </th>
                    <td className="px-5 py-3.5 align-top text-ink-500 dark:text-neutral-400">
                      <Cell value={row.free} />
                    </td>
                    <td className="bg-ink-50/60 px-5 py-3.5 align-top font-medium text-ink-900 dark:bg-white/[0.04] dark:text-white">
                      <Cell value={row.pro} />
                    </td>
                    <td className="px-5 py-3.5 align-top text-ink-900 dark:text-white">
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
