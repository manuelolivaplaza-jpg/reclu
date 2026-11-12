"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { LogoLockup } from "@/components/logo";
import { AppIcon } from "@/components/app/app-icon";
import { isActivePath } from "@/components/app/app-href";
import { navSections, NAV_AJUSTES, type AppNavItem } from "@/components/app/nav-config";
import type { AppUser } from "@/components/app/app-shell";
import { Avatar } from "@/components/app/avatar";
import { cn } from "@/lib/utils";

/** El layout nuevo manda "Gratis"; se tolera "Free" de una sesión ya renderizada. */
function planName(planLabel: string): string {
  return planLabel === "Free" || !planLabel ? "Gratis" : planLabel;
}

function SideLink({ item, collapsed }: { item: AppNavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href, item.match);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-11 items-center gap-3 px-3 text-[13.5px] tracking-[-0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900",
        active ? "font-medium text-ink-900" : "font-normal text-ink-500 hover:bg-ink-50 hover:text-ink-900",
        collapsed && "justify-center px-0",
      )}
    >
      {active ? <span aria-hidden className="absolute inset-y-2 -left-3 w-[2px] bg-ink-900" /> : null}
      <AppIcon name={item.icon} className="size-4 shrink-0" />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function AppSidebar({
  user,
  myPortfolio,
  collapsed,
  onToggle,
}: {
  user: AppUser;
  myPortfolio: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const sections = navSections(myPortfolio);
  const plan = planName(user.planLabel);
  const isFree = plan === "Gratis";

  return (
    <aside
      id="app-sidebar"
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-canvas transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-[240px]",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-line",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {!collapsed && (
          <Link
            href="/dashboard"
            aria-label="Fraccion, ir al resumen"
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-900"
          >
            <LogoLockup />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          className="flex size-11 items-center justify-center rounded-none text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900"
        >
          {collapsed ? (
            <ChevronsRight className="size-4" strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronsLeft className="size-4" strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </div>

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-5">
        {sections.map((s) => (
          <div key={s.title} className="mb-6 last:mb-0">
            {!collapsed && <p className="label-line mb-2 px-3">{s.title}</p>}
            <div className="flex flex-col gap-0.5">
              {s.items.map((item) => (
                <SideLink key={item.href} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line px-3 py-3">
        <SideLink item={NAV_AJUSTES} collapsed={collapsed} />
        <div
          title={collapsed ? `Plan ${plan}` : undefined}
          className={cn(
            "mt-3 flex items-center gap-3 border-t border-line pt-3",
            collapsed ? "justify-center" : "px-1",
          )}
        >
          <Avatar name={user.name || user.email} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight tracking-[-0.01em] text-ink-900">
                {user.name || "Tu cuenta"}
              </p>
              <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-500">{user.email}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Link
                  href="/settings#plan"
                  className="inline-flex h-7 shrink-0 items-center border border-line px-2 text-[11px] font-medium leading-none text-ink-500 transition-colors hover:border-ink-900 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
                >
                  Plan {plan}
                </Link>
                {isFree && (
                  <Link
                    href="/upgrade"
                    className="shrink-0 text-[11px] font-medium text-ink-900 underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
                  >
                    Mejorar →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}