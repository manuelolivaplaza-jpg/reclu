import { connection } from "next/server";
import { getProfile } from "@/lib/queries";
import { UpgradeSuccess } from "@/components/upgrade-result";

export const metadata = {
  title: "Suscripción activada",
  description: "Tu plan de reclu.cl quedó activo.",
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
  const planName =
    profile?.plan === "elite" ? "Elite" : profile?.plan === "pro" ? "Pro" : "Pro";
  return (
    <UpgradeSuccess
      planName={planName}
      mockPaymentId={params.mock_payment ?? null}
    />
  );
}
