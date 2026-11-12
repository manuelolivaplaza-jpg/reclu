import { connection } from "next/server";
import Link from "next/link";
import { getPaymentProvider, getPaymentsAvailability } from "@/lib/billing";
import { PAYMENTS_UNAVAILABLE_MESSAGE } from "@/lib/billing/messages";
import { ButtonLink } from "@/components/ui/button";

export const metadata = {
  title: "Pago en proceso",
  description: "Estamos confirmando tu suscripción en fraccion.si.",
};

// Ruta dinámica (proveedor por env) — nunca se prerenderiza.
export const instant = false;

export default async function UpgradePendientePage() {
  await connection();

  // F82: sin proveedor de pagos la página no se cae. `getPaymentsAvailability`
  // captura SOLO `PaymentsNotConfiguredError`; cualquier otro error se propaga
  // (no se esconde un bug real detrás de un catch genérico).
  const payments = getPaymentsAvailability();

  if (!payments.available) {
    return (
      <div className="flex max-w-2xl flex-col gap-8 pb-8">
        <header className="border-b border-line pb-6">
          <p className="label-line">Suscripción</p>
          <h1 className="mt-3 text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
            No pudimos confirmar tu pago.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
            {PAYMENTS_UNAVAILABLE_MESSAGE}
          </p>
        </header>

        <p className="max-w-xl text-[13px] leading-relaxed text-ink-500">
          Si el cobro ya se hizo, escríbenos a{" "}
          <a
            href="mailto:hola@fraccion.si"
            className="text-ink-900 underline underline-offset-4"
          >
            hola@fraccion.si
          </a>{" "}
          con el comprobante y lo revisamos a mano.
        </p>

        <div className="flex flex-wrap items-center gap-5">
          <ButtonLink href="/upgrade?plan=pro">Volver a los planes</ButtonLink>
          <Link
            href="/settings"
            className="text-[13px] font-medium text-ink-900 underline underline-offset-4 hover:opacity-60"
          >
            Ir a Ajustes
          </Link>
        </div>
      </div>
    );
  }

  // Hay proveedor: la comprobación anterior ya descartó
  // `PaymentsNotConfiguredError`, así que no hace falta otro try/catch.
  const provider = getPaymentProvider();
  const isMock = provider.id === "mock";
  const providerLabel = provider.label;

  return (
    <div className="flex max-w-2xl flex-col gap-8 pb-8">
      <header className="border-b border-line pb-6">
        <p className="label-line">Suscripción</p>
        <h1 className="mt-3 text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
          Estamos confirmando tu pago.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-500">
          {isMock
            ? "Modo prueba: el pago es simulado y no se cobra nada."
            : `Tu pago está en proceso con ${providerLabel}.`}
        </p>
      </header>

      {/* Lo que sigue, sin prometer plazos que no controlamos */}
      <dl className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 bg-app-card p-4 sm:p-5">
          <dt className="label-line">Qué pasa ahora</dt>
          <dd className="text-[14px] leading-relaxed text-ink-900">
            Cuando el proveedor confirme el pago, activamos tu plan.
          </dd>
        </div>
        <div className="flex flex-col gap-1.5 bg-app-card p-4 sm:p-5">
          <dt className="label-line">Qué necesitas hacer</dt>
          <dd className="text-[14px] leading-relaxed text-ink-900">
            Nada. Puede tardar unos minutos; no vuelvas a pagar.
          </dd>
        </div>
      </dl>

      <p className="max-w-xl text-[13px] leading-relaxed text-ink-500">
        Si pasadas unas horas tu plan sigue sin activarse, escríbenos a{" "}
        <a
          href="mailto:hola@fraccion.si"
          className="text-ink-900 underline underline-offset-4"
        >
          hola@fraccion.si
        </a>{" "}
        con el comprobante y lo resolvemos a mano.
      </p>

      <div className="flex flex-wrap items-center gap-5">
        <ButtonLink href="/dashboard">Ir a Resumen</ButtonLink>
        <Link
          href="/settings"
          className="text-[13px] font-medium text-ink-900 underline underline-offset-4 hover:opacity-60"
        >
          Ir a Ajustes
        </Link>
      </div>
    </div>
  );
}
