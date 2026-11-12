import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/queries";
import { UpgradeSuccess } from "@/components/upgrade-result";

export const metadata = {
  title: "Suscripción activada",
  description: "Confirmación de tu suscripción en fraccion.si.",
};

// Ruta con searchParams + cookies — nunca se prerenderiza.
export const instant = false;

export default async function UpgradeExitoPage({
  searchParams,
}: {
  searchParams: Promise<{ mock_payment?: string }>;
}) {
  await connection();
  const [params, profile] = await Promise.all([searchParams, getProfile()]);
  const planName = profile?.plan === "elite" ? "Elite" : profile?.plan === "pro" ? "Pro" : null;

  // El proveedor puede volver antes que su webhook: si el plan todavía no está
  // activo, esta pantalla afirmaría algo falso. Se muestra el estado real.
  // En modo prueba el webhook se dispara desde esta misma página, por eso
  // `mock_payment` se deja pasar.
  if (!planName && !params.mock_payment) {
    redirect("/upgrade/pendiente");
  }

  return (
    <UpgradeSuccess
      planName={planName ?? "Pro"}
      mockPaymentId={params.mock_payment ?? null}
    />
  );
}
