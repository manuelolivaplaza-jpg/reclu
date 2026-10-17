"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { Plan } from "@/lib/types";

export type UpgradePlanChoice = "pro" | "elite";
export type BillingCycle = "monthly" | "annual";
export type PaymentMethodId = "webpay" | "fintoc" | "mercadopago";

export interface UpgradeCheckoutProps {
  currentPlan: Plan;
  initialSelectedPlan?: UpgradePlanChoice;
  initialBilling?: BillingCycle;
  userEmail?: string;
}

const PLAN_DETAILS: Record<
  UpgradePlanChoice,
  {
    name: string;
    tagline: string;
    monthlyPrice: string;
    annualMonthlyPrice: string;
    annualTotal: string;
    features: string[];
  }
> = {
  pro: {
    name: "Plan Pro",
    tagline: "Seguimiento activo en tiempo real con contexto AI en cada movimiento.",
    monthlyPrice: "$12.990",
    annualMonthlyPrice: "$10.390",
    annualTotal: "$124.680",
    features: [
      "Hasta 15 portafolios seguidos en simultáneo",
      "Alertas en tiempo real apenas se detecta un filing o cambio",
      "Resúmenes AI completos explicando la tesis de cada movimiento",
      "Acceso completo a carteras temáticas y portafolios premium",
      "50 consultas semanales al asistente reclu AI",
    ],
  },
  elite: {
    name: "Plan Elite",
    tagline: "Cobertura institucional completa, libros 13F y radar político en vivo.",
    monthlyPrice: "$16.990",
    annualMonthlyPrice: "$13.590",
    annualTotal: "$163.080",
    features: [
      "Portafolios ilimitados",
      "Fondos 13F institucionales y soberanos (Buffett, Burry, Druckenmiller, Ackman, PIF)",
      "Radar de menciones de Trump y políticos en tiempo real",
      "Asistente reclu AI ilimitado",
      "Comparador multi-cartera y exportación CSV",
    ],
  },
};

const PAYMENT_METHODS: {
  id: PaymentMethodId;
  label: string;
  description: string;
  instructions: string;
}[] = [
  {
    id: "webpay",
    label: "Tarjeta de crédito o débito (Webpay Plus)",
    description: "Visa, Mastercard, Redcompra · Transbank Chile en CLP.",
    instructions:
      "Procesamos tu suscripción con cargo automático en CLP vía Webpay Plus. Envía tu código de referencia o comprobante a hola@reclu.cl para activar tu plan de inmediato mientras finalizamos la pasarela automática.",
  },
  {
    id: "fintoc",
    label: "Transferencia bancaria instantánea (Fintoc)",
    description: "Banco de Chile, Santander, BCI, Itaú, Scotiabank, BancoEstado.",
    instructions:
      "Realiza la transferencia desde tu banco con el código de referencia indicado y responde al correo de confirmación o escribe a hola@reclu.cl. Tu cuenta quedará activada en minutos.",
  },
  {
    id: "mercadopago",
    label: "Mercado Pago",
    description: "Saldo en cuenta o tarjetas guardadas en Mercado Pago Chile.",
    instructions:
      "Completa el pago con tu cuenta de Mercado Pago indicando tu código de referencia a hola@reclu.cl para habilitar todas las funciones del plan en tu perfil.",
  },
];

export function UpgradeCheckout({
  currentPlan,
  initialSelectedPlan = "pro",
  initialBilling = "monthly",
  userEmail = "",
}: UpgradeCheckoutProps) {
  const [selectedPlan, setSelectedPlan] = useState<UpgradePlanChoice>(initialSelectedPlan);
  const [billing, setBilling] = useState<BillingCycle>(initialBilling);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("webpay");
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const plan = PLAN_DETAILS[selectedPlan];
  const activePayment =
    PAYMENT_METHODS.find((m) => m.id === paymentMethod) ?? PAYMENT_METHODS[0];
  const displayMonthly =
    billing === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice;
  const totalDueNow = billing === "annual" ? plan.annualTotal : plan.monthlyPrice;

  function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    const prefix = selectedPlan === "elite" ? "ELITE" : "PRO";
    const cycleCode = billing === "annual" ? "ANUAL" : "MES";
    const suffix = (userEmail || "RECLU")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();
    setSubmittedRef(`RCL-${prefix}-${cycleCode}-${suffix || "CL2026"}`);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          Volver al dashboard
        </Link>
        <h1 className="mt-3 text-[28px] font-medium tracking-[-0.035em] text-ink-900 sm:text-[36px]">
          Activar suscripción.
        </h1>
        <p className="mt-1.5 max-w-xl text-[15px] text-ink-500">
          Elige tu nivel de acceso y modalidad de pago en pesos chilenos. Sin contratos de permanencia.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-ink-200 py-4">
        <div className="text-[14px] text-ink-500">
          Plan actual:{" "}
          <span className="font-medium text-ink-900">
            {currentPlan === "elite"
              ? "Elite"
              : currentPlan === "pro"
                ? "Pro"
                : "Gratis"}
          </span>
          {userEmail && <span className="ml-2 text-ink-500">· {userEmail}</span>}
        </div>

        <div
          role="group"
          aria-label="Ciclo de facturación"
          className="inline-flex border border-ink-900 p-0.5"
        >
          <button
            type="button"
            onClick={() => {
              setBilling("monthly");
              setSubmittedRef(null);
            }}
            className={`px-4 py-1.5 text-[13px] font-medium transition-colors ${
              billing === "monthly"
                ? "bg-ink-900 text-white"
                : "bg-white text-ink-900 hover:bg-ink-50"
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => {
              setBilling("annual");
              setSubmittedRef(null);
            }}
            className={`px-4 py-1.5 text-[13px] font-medium transition-colors ${
              billing === "annual"
                ? "bg-ink-900 text-white"
                : "bg-white text-ink-900 hover:bg-ink-50"
            }`}
          >
            Anual (20% descuento)
          </button>
        </div>
      </div>

      {/* Main layout: Left = Plan & Payment selector, Right = Side-by-side summary */}
      <div className="grid gap-8 lg:grid-cols-12">
        <form onSubmit={handleActivate} className="flex flex-col gap-8 lg:col-span-7">
          {/* Step 1: Plan selector */}
          <section className="flex flex-col gap-4">
            <h2 className="text-[13px] text-ink-500">01 · Selecciona tu plan</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["pro", "elite"] as const).map((tierKey) => {
                const tier = PLAN_DETAILS[tierKey];
                const isSelected = selectedPlan === tierKey;
                const price =
                  billing === "annual" ? tier.annualMonthlyPrice : tier.monthlyPrice;

                return (
                  <button
                    key={tierKey}
                    type="button"
                    onClick={() => {
                      setSelectedPlan(tierKey);
                      setSubmittedRef(null);
                    }}
                    className={`flex flex-col justify-between border p-5 text-left transition-colors ${
                      isSelected
                        ? "border-ink-900 bg-ink-900 text-white"
                        : "border-ink-200 bg-white text-ink-900 hover:border-ink-900"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[13px] ${
                            isSelected ? "text-white/70" : "text-ink-500"
                          }`}
                        >
                          {tier.name}
                        </span>
                        {currentPlan === tierKey && (
                          <span
                            className={`text-[11px] ${
                              isSelected ? "text-white/70" : "text-ink-500"
                            }`}
                          >
                            Actual
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-[28px] font-medium tracking-[-0.03em] tabular-nums">
                        {price}{" "}
                        <span
                          className={`text-[13px] font-normal ${
                            isSelected ? "text-white/60" : "text-ink-500"
                          }`}
                        >
                          CLP / mes
                        </span>
                      </p>
                      <p
                        className={`mt-1 text-[12px] tabular-nums ${
                          isSelected ? "text-white/60" : "text-ink-500"
                        }`}
                      >
                        {billing === "annual"
                          ? `Facturado anualmente (${tier.annualTotal} CLP/año)`
                          : `En plan anual: ${tier.annualMonthlyPrice} CLP / mes`}
                      </p>
                    </div>
                    <p
                      className={`mt-4 text-[13px] leading-relaxed ${
                        isSelected ? "text-white/80" : "text-ink-500"
                      }`}
                    >
                      {tier.tagline}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: Payment method selector */}
          <section className="flex flex-col gap-4">
            <h2 className="text-[13px] text-ink-500">02 · Medio de pago (Chile)</h2>
            <div className="flex flex-col border-t border-ink-200">
              {PAYMENT_METHODS.map((method) => {
                const active = paymentMethod === method.id;
                return (
                  <label
                    key={method.id}
                    className="flex cursor-pointer items-start justify-between gap-4 border-b border-ink-200 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.id}
                        checked={active}
                        onChange={() => {
                          setPaymentMethod(method.id);
                          setSubmittedRef(null);
                        }}
                        className="mt-1 size-4 accent-ink-900"
                      />
                      <div>
                        <p className="text-[15px] font-medium text-ink-900">
                          {method.label}
                        </p>
                        <p className="mt-0.5 text-[13px] text-ink-500">
                          {method.description}
                        </p>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Submit CTA */}
          <div className="flex flex-col gap-3">
            <Button type="submit" size="lg" className="w-full sm:w-fit">
              {selectedPlan === "elite" ? "Activar Plan Elite" : "Activar Plan Pro"}
              <ArrowRight className="size-4" />
            </Button>
            <p className="text-[12px] text-ink-500">
              Solo notificaciones sobre información pública. No ejecutamos órdenes ni entregamos asesoría de inversión.
            </p>
          </div>

          {/* Interactive confirmation panel */}
          {submittedRef && (
            <div
              role="status"
              aria-live="polite"
              className="border border-ink-900 bg-white p-6"
            >
              <p className="text-[13px] text-ink-500">Solicitud de activación generada</p>
              <h3 className="mt-1 text-[20px] font-medium tracking-[-0.025em] text-ink-900">
                {plan.name} · {billing === "annual" ? "Facturación anual" : "Facturación mensual"}
              </h3>

              <div className="mt-4 grid gap-3 border-y border-ink-200 py-4 text-[13px] sm:grid-cols-3">
                <div>
                  <p className="text-ink-500">Código de referencia</p>
                  <p className="mt-0.5 font-medium tabular-nums text-ink-900">
                    {submittedRef}
                  </p>
                </div>
                <div>
                  <p className="text-ink-500">Medio seleccionado</p>
                  <p className="mt-0.5 font-medium text-ink-900">
                    {activePayment.label}
                  </p>
                </div>
                <div>
                  <p className="text-ink-500">Total a pagar</p>
                  <p className="mt-0.5 font-medium tabular-nums text-ink-900">
                    {totalDueNow} CLP
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[14px] leading-relaxed text-ink-900">
                {activePayment.instructions}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <ButtonLink
                  href={`mailto:hola@reclu.cl?subject=${encodeURIComponent(
                    `Activación ${plan.name} (${submittedRef})`,
                  )}&body=${encodeURIComponent(
                    `Hola equipo reclu,\n\nQuiero activar mi suscripción:\n- Plan: ${plan.name}\n- Ciclo: ${billing === "annual" ? "Anual (20% dcto.)" : "Mensual"}\n- Medio de pago: ${activePayment.label}\n- Total: ${totalDueNow} CLP\n- Referencia: ${submittedRef}\n- Cuenta: ${userEmail}\n`,
                  )}`}
                  size="sm"
                >
                  Confirmar activación por correo
                  <ArrowRight className="size-3.5" />
                </ButtonLink>
                <Link
                  href="/explore"
                  className="text-[13px] text-ink-900 underline-offset-4 hover:underline"
                >
                  Explorar catálogo →
                </Link>
              </div>
            </div>
          )}
        </form>

        {/* Side-by-side summary of what the chosen plan unlocks */}
        <aside className="lg:col-span-5">
          <div className="border border-ink-900 p-6">
            <div className="flex items-baseline justify-between border-b border-ink-200 pb-4">
              <div>
                <p className="text-[13px] text-ink-500">Resumen del plan</p>
                <h2 className="mt-1 text-[22px] font-medium tracking-[-0.03em] text-ink-900">
                  {plan.name}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-[24px] font-medium tracking-[-0.03em] tabular-nums text-ink-900">
                  {displayMonthly}
                </p>
                <p className="text-[12px] text-ink-500">CLP / mes</p>
              </div>
            </div>

            <p className="mt-4 text-[13px] text-ink-500">
              Lo que desbloqueas al activar {plan.name}:
            </p>

            <ul className="mt-3 flex flex-col border-t border-ink-200">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 border-b border-ink-200 py-3 text-[14px] text-ink-900"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-ink-900" strokeWidth={1.5} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-center justify-between text-[14px]">
              <span className="text-ink-500">
                {billing === "annual" ? "Total anual (20% dcto.)" : "Total mensual"}
              </span>
              <span className="font-medium tabular-nums text-ink-900">
                {totalDueNow} CLP
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
