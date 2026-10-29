import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app/app-shell";
import { isPaidPlan, isElitePlan } from "@/lib/types";
import { isMyPortfolioEnabled } from "@/lib/portfolio-flags";

/**
 * d47: shell de la app (sidebar + topbar en escritorio, tab bar en móvil).
 * Solo pasa strings/booleans al cliente (nunca componentes ni íconos: bug d46).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, full_name")
    .eq("id", user.id)
    .single();
  const planLabel = isElitePlan(profile?.plan) ? "Elite" : isPaidPlan(profile?.plan) ? "Pro" : "Free";

  return (
    <AppShell
      user={{ name: profile?.full_name ?? "", email: user.email ?? "", planLabel }}
      myPortfolio={isMyPortfolioEnabled()}
    >
      {children}
    </AppShell>
  );
}