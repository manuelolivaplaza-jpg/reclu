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
  Crown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LogoLockup } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/explore", label: "Explorar", icon: Compass },
  { href: "/alerts", label: "Alertas", icon: BellRing },
  { href: "/compare", label: "Mi cartera", icon: PieChart },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Mark this route as dynamic (reads auth cookies) under cacheComponents.
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
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard">
            <LogoLockup />
          </Link>
          <div className="flex items-center gap-3">
            {isPro && (
              <Badge variant="warning" className="gap-1">
                <Crown className="size-3" />
                Pro
              </Badge>
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-24 flex flex-col gap-1" aria-label="Dashboard">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  "text-ink-600 hover:bg-white hover:text-ink-900 hover:shadow-subtle",
                )}
              >
                <item.icon className="size-4.5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="sticky bottom-0 z-40 flex border-t border-ink-200 bg-white lg:hidden"
        aria-label="Dashboard móvil"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium text-ink-600 transition-colors hover:text-brand-600"
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
