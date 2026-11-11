import { connection } from "next/server";
import { getPaymentProvider, getPaymentsAvailability } from "@/lib/billing";
import { PAYMENTS_UNAVAILABLE_MESSAGE } from "@/lib/billing/messages";
import { ButtonLink } from "@/components/ui/button";

export const metadata = {
  title: "Pago en proceso",
  description: "Estamos confirmando tu suscripción.",
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
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-none text-ink-500">Suscripción</p>
          <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[36px]">
            No pudimos confirmar tu pago.
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-ink-500">
            {PAYMENTS_UNAVAILABLE_MESSAGE}
          </p>
        </div>

        <p className="max-w-xl border-t border-ink-200 pt-5 text-[13px] leading-relaxed text-ink-500">
          Si el cobro ya se hizo, escríbenos a{" "}
          <a
            href="mailto:hola@fraccion.si"
            className="text-ink-900 underline underline-offset-4"
          >
            hola@fraccion.si
          </a>{" "}
          con el comprobante y lo revisamos a mano.
        </p>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/upgrade?plan=pro">Volver a los planes</ButtonLink>
          <ButtonLink href="/settings" variant="outline">
            Ir a Ajustes
          </ButtonLink>
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
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-none text-ink-500">Suscripción</p>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[36px]">
          Estamos confirmando tu pago.
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-ink-500">
          {isMock
            ? "Modo prueba: tu suscripción se confirma en segundos."
            : `Tu pago está en proceso con ${providerLabel}.`}
        </p>
      </div>

      {/* Lo que sigue, sin prometer plazos que no controlamos */}
      <dl className="grid grid-cols-1 gap-px border-y border-ink-200 bg-ink-200 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 bg-white p-4 sm:p-5">
          <dt className="text-[12px] leading-none text-ink-500">Qué pasa ahora</dt>
          <dd className="text-[13px] leading-relaxed text-ink-900">
            Confirmamos el pago y activamos tu plan automáticamente.
          </dd>
        </div>
        <div className="flex flex-col gap-1.5 bg-white p-4 sm:p-5">
          <dt className="text-[12px] leading-none text-ink-500">Qué necesitas hacer</dt>
          <dd className="text-[13px] leading-relaxed text-ink-900">
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
        y lo resolvemos a mano.
      </p>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/dashboard">Ir al dashboard</ButtonLink>
        <ButtonLink href="/settings" variant="outline">
          Ir a Ajustes
        </ButtonLink>
      </div>
    </div>
  );
}
