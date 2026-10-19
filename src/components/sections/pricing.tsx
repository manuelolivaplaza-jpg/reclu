"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { FadeIn, StaggerList, StaggerItem } from "@/components/ui/motion";
import { track } from "@/lib/analytics";
import { PLANS, followLimitLabel, formatClp } from "@/lib/plans";

type Billing = "monthly" | "annual";

// Características y precios salen de la fuente única `src/lib/plans.ts`.
const COMPARISON: { label: string; free: string; pro: string; elite: string }[] = [
  {
    label: "Portafolios seguidos",
    free: followLimitLabel("free"),
    pro: followLimitLabel("pro"),
    elite: followLimitLabel("elite"),
  },
  {
    label: "Frecuencia de alertas",
    free: "Diaria",
    pro: "Tiempo real",
    elite: "Prioritaria instantánea",
  },
  {
    label: "Fondos 13F y carteras Premium",
    free: "—",
    pro: "Parcial",
    elite: "Acceso total",
  },
  {
    label: "Asistente reclu AI",
    free: "5 por día",
    pro: "50 por semana",
    elite: "Ilimitado",
  },
  {
    label: "Exportación CSV y Cruce Multi-cartera",
    free: "—",
    pro: "—",
    elite: "Incluido",
  },
];

const WHITE_FILET = "rgba(255,255,255,0.16)";

/**
 * Precios — tres columnas. Gratis y Pro en blanco, Elite en negativo.
 * Toggle de facturación Mensual / Anual (−20%). Gap de 1px sobre
 * #e6e6e6 = el filete entre columnas. Radio 0, sin sombras.
 */
export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const annual = billing === "annual";

  // Medición: la sección de precios entró en viewport.
  useEffect(() => {
    track("pricing_view", { billing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const proPrice = formatClp(
    annual ? PLANS.pro.annualMonthlyPrice : PLANS.pro.monthlyPrice,
  );
  const proSuffix = annual ? "CLP / mes · facturado anual" : "CLP / mes";
  const elitePrice = formatClp(
    annual ? PLANS.elite.annualMonthlyPrice : PLANS.elite.monthlyPrice,
  );
  const eliteSuffix = annual ? "CLP / mes · facturado anual" : "CLP / mes";

  return (
    <section id="precios" className="bg-white py-28 md:py-36">
      <div className="container-page">
        <FadeIn>
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <h2 className="type-section text-ink-900">Empieza en cero.</h2>

            {/* Toggle de facturación — filete 1px negro, fondo negro en activo */}
            <div
              role="group"
              aria-label="Ciclo de facturación"
              className="flex w-fit border border-ink-900"
            >
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                aria-pressed={!annual}
                className={
                  "px-5 py-2.5 text-[13px] transition-colors " +
                  (!annual
                    ? "bg-ink-900 text-white"
                    : "bg-white text-ink-500 hover:text-ink-900")
                }
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setBilling("annual")}
                aria-pressed={annual}
                className={
                  "px-5 py-2.5 text-[13px] transition-colors " +
                  (annual
                    ? "bg-ink-900 text-white"
                    : "bg-white text-ink-500 hover:text-ink-900")
                }
              >
                Anual (−20%)
              </button>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.08} className="mt-16 md:mt-20">
          <div className="grid max-w-[1120px] grid-cols-1 gap-px border border-ink-200 bg-ink-200 lg:grid-cols-3">
            {/* Gratis */}
            <div className="flex flex-col bg-white p-8 md:p-12">
              <p className="label-line">Gratis</p>
              <p className="type-section num mt-5 text-ink-900">$0</p>
              <p className="label-line mt-3">Para siempre</p>

              <StaggerList className="mt-10 flex flex-1 flex-col border-t border-ink-200">
                {PLANS.free.features.map((f) => (
                  <StaggerItem
                    key={f}
                    className="border-b border-ink-200 py-3.5 text-[15px] leading-snug text-ink-900 last:border-b-0"
                  >
                    {f}
                  </StaggerItem>
                ))}
              </StaggerList>

              <ButtonLink href="/signup" variant="outline" className="mt-10 w-full">
                Crear cuenta
              </ButtonLink>
            </div>

            {/* Pro */}
            <div className="relative flex flex-col bg-white p-8 md:p-12">
              <span className="absolute top-0 left-1/2 h-[3px] w-16 -translate-x-1/2 bg-ink-900" aria-hidden />
              <p className="label-line">Pro · Inversor activo</p>
              <p className="mt-4 text-[11px] tracking-[0.08em] text-ink-900">
                Más elegido
              </p>
              <p className="type-section num mt-3 text-ink-900">{proPrice}</p>
              <p className="label-line mt-3">{proSuffix}</p>

              <StaggerList className="mt-10 flex flex-1 flex-col border-t border-ink-200">
                {PLANS.pro.features.map((f) => (
                  <StaggerItem
                    key={f}
                    className="border-b border-ink-200 py-3.5 text-[15px] leading-snug text-ink-900 last:border-b-0"
                  >
                    {f}
                  </StaggerItem>
                ))}
              </StaggerList>

              <ButtonLink href="/signup?plan=pro" className="mt-10 w-full" onClick={() => track("checkout_click", { plan: "pro", source: "pricing" })}>
                Elegir Pro
              </ButtonLink>
            </div>

            {/* Elite — monolito negativo */}
            <div className="flex flex-col bg-ink-900 p-8 text-white md:p-12">
              <p className="text-[13px] text-white/60">Elite · Institucional & 13F</p>
              <p className="type-section num mt-5 text-white">{elitePrice}</p>
              <p className="mt-3 text-[13px] text-white/60">{eliteSuffix}</p>

              <StaggerList
                className="mt-10 flex flex-1 flex-col border-t"
                style={{ borderColor: WHITE_FILET }}
              >
                {PLANS.elite.features.map((f) => (
                  <StaggerItem
                    key={f}
                    className="border-b py-3.5 text-[15px] leading-snug text-white last:border-b-0"
                    style={{ borderColor: WHITE_FILET }}
                  >
                    {f}
                  </StaggerItem>
                ))}
              </StaggerList>

              <ButtonLink
                href="/signup?plan=elite"
                className="mt-10 w-full bg-white text-ink-900 hover:opacity-90"
                onClick={() => track("checkout_click", { plan: "elite", source: "pricing" })}
              >
                Pasar a Elite
              </ButtonLink>
            </div>
          </div>
        </FadeIn>

        {/* Matriz comparativa — filetes 1px #e6e6e6 */}
        <FadeIn delay={0.12} className="mt-16">
          <div className="max-w-[1120px] overflow-x-auto">
            <table className="w-full border border-ink-200 text-[15px]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[13px] text-ink-500">
                  <th className="p-4 font-normal">Comparación rápida</th>
                  <th className="p-4 font-normal">Gratis</th>
                  <th className="p-4 font-normal">Pro</th>
                  <th className="p-4 font-normal">Elite</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-ink-200 last:border-b-0">
                    <td className="p-4 text-ink-900">{row.label}</td>
                    <td className="p-4 text-ink-500">{row.free}</td>
                    <td className="p-4 text-ink-900">{row.pro}</td>
                    <td className="p-4 text-ink-900">{row.elite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>

        <p className="mt-10 text-[13px] text-ink-500">
          Planes para equipos:{" "}
          <a
            href="mailto:hola@reclu.cl"
            className="text-ink-900 underline decoration-transparent underline-offset-[0.25em] [text-decoration-thickness:1px] transition-[text-decoration-color] duration-200 hover:decoration-ink-900"
          >
            hola@reclu.cl
          </a>
        </p>
      </div>
    </section>
  );
}
