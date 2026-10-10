import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  LayoutDashboard,
  Compass,
  BellRing,
  PieChart,
  Settings,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LogoLockup } from "@/components/logo";
import { DashboardNavLink, type NavItem } from "@/components/dashboard-nav-link";

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/explore", label: "Explorar", icon: Compass },
  { href: "/alerts", label: "Alertas", icon: BellRing },
  { href: "/compare", label: "Mi cartera", icon: PieChart },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

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
  const isPro = profile?.plan === "pro";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard">
            <LogoLockup />
          </Link>
          <div className="flex items-center gap-4">
            {isPro && <span className="text-[13px] text-ink-900">Pro</span>}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex items-center gap-2 text-sm text-ink-500 transition-opacity hover:text-ink-900"
              >
                <LogOut className="size-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-4 py-8 sm:px-6">
        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-24 flex flex-col gap-1" aria-label="Dashboard">
            {NAV_ITEMS.map((item) => (
              <DashboardNavLink key={item.href} item={item} variant="sidebar" />
            ))}
          </nav>
        </aside>

        {/* Contenido */}
        <main id="main" className="min-w-0 flex-1 pb-20 lg:pb-16">
          {children}
        </main>
      </div>

      {/* Nav inferior móvil */}
      <nav
        className="sticky bottom-0 z-40 flex border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Dashboard móvil"
      >
        {NAV_ITEMS.map((item) => (
          <DashboardNavLink key={item.href} item={item} variant="bottom" />
        ))}
      </nav>
    </div>
  );
}
