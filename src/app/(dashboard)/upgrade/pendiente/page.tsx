import { connection } from "next/server";
import { getPaymentProvider, getPaymentsAvailability } from "@/lib/billing";
import { PAYMENTS_UNAVAILABLE_MESSAGE } from "@/lib/billing/messages";

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
      <div className="flex max-w-xl flex-col gap-6">
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[36px]">
          No pudimos confirmar tu pago.
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-500">
          {PAYMENTS_UNAVAILABLE_MESSAGE}
        </p>
        <p className="border border-ink-200 p-4 text-[13px] text-ink-500">
          Si el cobro ya se hizo, escríbenos a hola@fraccion.si con el comprobante y lo
          revisamos a mano.
        </p>
      </div>
    );
  }

  // Hay proveedor: la comprobación anterior ya descartó
  // `PaymentsNotConfiguredError`, así que no hace falta otro try/catch.
  const provider = getPaymentProvider();
  const isMock = provider.id === "mock";
  const providerLabel = provider.label;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[36px]">
        Estamos confirmando tu pago.
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-500">
        {isMock
          ? "Modo prueba: tu suscripción se confirma en segundos."
          : providerLabel
            ? `Tu pago está en proceso con ${providerLabel}. Esto puede tardar unos minutos; tu plan se activa automáticamente al confirmarse. No necesitas hacer nada más.`
            : "Tu pago está en proceso. Esto puede tardar unos minutos; tu plan se activa automáticamente al confirmarse. No necesitas hacer nada más."}
      </p>
      <p className="border border-ink-200 p-4 text-[13px] text-ink-500">
        Si pasadas unas horas tu plan sigue sin activarse, escríbenos a hola@fraccion.si y
        lo resolvemos a mano.
      </p>
    </div>
  );
}
