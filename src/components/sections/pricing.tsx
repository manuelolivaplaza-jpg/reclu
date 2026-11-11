"use client";

import { useEffect, useState } from "react";
import { Check, Lock, Minus, Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn } from "@/components/ui/reveal";
import { track } from "@/lib/analytics";
import { PLANS, followLimitLabel, formatClp, planFeatures } from "@/lib/plans";

type Billing = "monthly" | "annual";

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

function Cell({ value, dark = false }: { value: string; dark?: boolean }) {
  if (value === "-")
    return <Minus className={"size-4 " + (dark ? "text-white/30" : "text-ink-400")} aria-label="No incluido" />;
  if (value === "Incluido")
    return <Check className={"size-4 " + (dark ? "text-white" : "text-positive")} aria-label="Incluido" />;
  return <span>{value}</span>;
}

function FeatureList({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="mt-6 flex flex-1 flex-col gap-3">
      {items.map((f) => (
        <li key={f} className="flex gap-3 text-[14px] leading-snug">
          <span
            className={
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full " +
              (dark ? "bg-white/10 text-white" : "bg-positive/10 text-positive")
            }
          >
            <Check className="size-3" strokeWidth={3} aria-hidden />
          </span>
          <span className={dark ? "text-white/85" : "text-ink-800"}>{f}</span>
        </li>
      ))}
    </ul>
  );
}

/** Precios: tarjetas con jerarquía (Pro destacado), regla de acceso y comparación. */
export function Pricing({ aiOn = false }: { aiOn?: boolean }) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const annual = billing === "annual";

  // IA apagada (default del lanzamiento): ni un bullet ni una fila con IA.
  const freeFeatures = FREE_FEATURES.filter((f) => aiOn || f.ai !== true).map((f) => f.text);
  const proFeatures = [PRO_HEADLINE, ...planFeatures("pro", aiOn)];
  const eliteFeatures = planFeatures("elite", aiOn);
  const comparison = COMPARISON.filter((row) => aiOn || row.ai !== true);

  useEffect(() => {
    track("pricing_view", { billing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proPrice = formatClp(annual ? PLANS.pro.annualMonthlyPrice : PLANS.pro.monthlyPrice);
  const elitePrice = formatClp(annual ? PLANS.elite.annualMonthlyPrice : PLANS.elite.monthlyPrice);
  const suffix = annual ? "/ mes · facturado anual" : "/ mes";

  return (
    <section id="precios" className="pub-canvas py-20 md:py-32">
      <div className="container-page">
        <FadeIn>
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="pub-chip">Planes y precios</span>
              <h2 className="type-section mt-4 text-ink-900">Empieza en cero.</h2>
              <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-500">
                Las carteras de corredoras son gratis. Para seguir portafolios y ver todas sus
                acciones, elige Pro o Elite.
              </p>
            </div>

            <div role="group" aria-label="Ciclo de facturación" className="flex w-full rounded-full border border-ink-200 bg-white p-1 sm:w-fit">
              {(["monthly", "annual"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBilling(b)}
                  aria-pressed={billing === b}
                  className={
                    "flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-colors sm:flex-none " +
                    (billing === b ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900")
                  }
                >
                  {b === "monthly" ? "Mensual" : "Anual"}
                  {b === "annual" && (
                    <span className={"rounded-full px-1.5 py-0.5 text-[11px] " + (annual ? "bg-white/15" : "bg-positive/10 text-positive")}>
                      -20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Regla de acceso */}
        <FadeIn delay={0.04} className="mt-10">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="pub-card flex items-start gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-positive/10 text-positive">
                <Check className="size-4" strokeWidth={3} aria-hidden />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-ink-900">Gratis para todos</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
                  Carteras recomendadas de corredoras, como Renta 4, con todas sus acciones.
                </p>
              </div>
            </div>
            <div className="pub-card flex items-start gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white">
                <Lock className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-ink-900">Con suscripción</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">
                  Seguir portafolios y ver todas las acciones de políticos, fondos y ballenas.
                </p>
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.08} className="mt-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
            {/* Gratis */}
            <div className="pub-card flex flex-col p-6 md:p-8">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold text-ink-900">Gratis</p>
                <span className="pub-chip">Para siempre</span>
              </div>
              <p className="num mt-6 text-[44px] leading-none text-ink-900">$0</p>
              <p className="mt-2 text-[13px] text-ink-500">Sin tarjeta</p>
              <FeatureList items={freeFeatures} />
              <ButtonLink href="/signup" variant="outline" size="lg" className="mt-8 w-full">
                Crear cuenta
              </ButtonLink>
            </div>

            {/* Pro */}
            <div className="pub-card relative flex flex-col p-6 ring-2 ring-ink-900 md:p-8 lg:-my-3 lg:py-11">
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1 text-[11px] font-medium text-white">
                <Sparkles className="size-3" aria-hidden />
                Más elegido
              </span>
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold text-ink-900">Pro</p>
                <span className="pub-chip">{PLANS.pro.tagline}</span>
              </div>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="num text-[44px] leading-none text-ink-900">{proPrice}</span>
                <span className="text-[13px] text-ink-500">CLP {suffix}</span>
              </p>
              <p className="mt-2 text-[13px] text-positive">7 días de prueba en cuentas nuevas</p>
              <FeatureList items={proFeatures} />
              <ButtonLink
                href="/signup?plan=pro"
                size="lg"
                className="mt-8 w-full"
                onClick={() => track("checkout_click", { plan: "pro", source: "pricing" })}
              >
                Elegir Pro
              </ButtonLink>
            </div>

            {/* Elite */}
            <div className="pub-card-dark flex flex-col p-6 md:p-8">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold">Elite</p>
                <span className="pub-chip pub-chip-dark">{PLANS.elite.tagline}</span>
              </div>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="num text-[44px] leading-none">{elitePrice}</span>
                <span className="text-[13px] text-white/60">CLP {suffix}</span>
              </p>
              <p className="mt-2 text-[13px] text-white/60">Todo Pro, sin límites</p>
              <FeatureList items={eliteFeatures} dark />
              <ButtonLink
                href="/signup?plan=elite"
                size="lg"
                className="mt-8 w-full bg-white text-ink-900 hover:bg-white hover:opacity-90"
                onClick={() => track("checkout_click", { plan: "elite", source: "pricing" })}
              >
                Pasar a Elite
              </ButtonLink>
            </div>
          </div>
        </FadeIn>

        {/* Comparación: tarjetas en celular, tabla en escritorio */}
        <FadeIn delay={0.12} className="mt-12">
          <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-ink-900">Comparación rápida</h3>

          <div className="mt-4 flex flex-col gap-3 md:hidden">
            {comparison.map((row) => (
              <div key={row.label} className="pub-card p-4">
                <p className="text-[14px] font-medium text-ink-900">{row.label}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                  {(
                    [
                      ["Gratis", row.free],
                      ["Pro", row.pro],
                      ["Elite", row.elite],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-ink-50 px-2.5 py-2">
                      <dt className="text-[11px] text-ink-500">{k}</dt>
                      <dd className="mt-1 flex min-h-4 items-center text-ink-900">
                        <Cell value={v} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className="pub-card mt-4 hidden overflow-hidden md:block">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-ink-50 text-left text-[13px] text-ink-500">
                  <th className="px-5 py-3.5 font-medium">Función</th>
                  <th className="px-5 py-3.5 font-medium">Gratis</th>
                  <th className="px-5 py-3.5 font-semibold text-ink-900">Pro</th>
                  <th className="px-5 py-3.5 font-medium">Elite</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.label} className="border-t border-ink-200">
                    <td className="px-5 py-3.5 text-ink-900">{row.label}</td>
                    <td className="px-5 py-3.5 text-ink-500"><Cell value={row.free} /></td>
                    <td className="bg-ink-50/50 px-5 py-3.5 font-medium text-ink-900"><Cell value={row.pro} /></td>
                    <td className="px-5 py-3.5 text-ink-900"><Cell value={row.elite} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>

        <div className="mt-8 flex flex-wrap items-center gap-2 text-[13px] text-ink-500">
          <span className="pub-chip">Pago seguro con Mercado Pago</span>
          <span>
            Planes para equipos:{" "}
            <a href="mailto:hola@fraccion.si" className="text-ink-900 underline underline-offset-4">
              hola@fraccion.si
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}
