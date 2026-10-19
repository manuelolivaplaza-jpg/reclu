import { connection } from "next/server";
import { getPaymentProvider } from "@/lib/billing";

export const metadata = {
  title: "Pago en proceso",
  description: "Estamos confirmando tu suscripción.",
};

// Ruta dinámica (proveedor por env) — nunca se prerenderiza.
export const instant = false;

export default async function UpgradePendientePage() {
  await connection();
  // FAIL CLOSED: sin proveedor configurado la página no debe crashear.
  let isMock = false;
  let providerLabel = "";
  try {
    const provider = getPaymentProvider();
    isMock = provider.id === "mock";
    providerLabel = provider.label;
  } catch {
    providerLabel = "";
  }

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
        Si pasadas unas horas tu plan sigue sin activarse, escríbenos a hola@reclu.cl y
        lo resolvemos a mano.
      </p>
    </div>
  );
}
