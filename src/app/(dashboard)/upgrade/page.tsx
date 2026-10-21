import { connection } from "next/server";
import { getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsAvailability } from "@/lib/billing";
import {
  UpgradeCheckout,
  type BillingCycle,
  type UpgradePlanChoice,
} from "@/components/upgrade-checkout";

export const metadata = {
  title: "Activar plan",
  description: "Actualiza tu cuenta de reclu.cl a Plan Pro o Plan Elite.",
};

// Ruta protegida por auth: lee cookies y searchParams por request — nunca se prerenderiza.
export const instant = false;

interface UpgradePageProps {
  searchParams: Promise<{ plan?: string; billing?: string }>;
}

export default async function UpgradePage({ searchParams }: UpgradePageProps) {
  await connection();
  const [params, profile, supabase] = await Promise.all([
    searchParams,
    getProfile(),
    createClient(),
  ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const initialSelectedPlan: UpgradePlanChoice =
    params.plan === "elite"
      ? "elite"
      : params.plan === "pro"
        ? "pro"
        : profile?.plan === "pro"
          ? "elite"
          : "pro";

  const initialBilling: BillingCycle =
    params.billing === "annual" || params.billing === "anual" ? "annual" : "monthly";

  // F82: sin proveedor de pagos la página NO se cae: se muestran los planes
  // con un aviso y el checkout queda deshabilitado. getPaymentsAvailability
  // nunca cae a mock por falta de claves (fail closed).
  const payments = getPaymentsAvailability();

  return (
    <UpgradeCheckout
      currentPlan={profile?.plan ?? "free"}
      initialSelectedPlan={initialSelectedPlan}
      initialBilling={initialBilling}
      userEmail={profile?.email ?? user?.email ?? ""}
      isTestMode={payments.available && payments.isTestMode}
      paymentsAvailable={payments.available}
    />
  );
}
