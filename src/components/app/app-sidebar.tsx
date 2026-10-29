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

function SideLink({ item, collapsed }: { item: AppNavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href, item.match);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-app-control px-3 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900",
        active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        collapsed && "justify-center px-0",
      )}
    >
      <AppIcon name={item.icon} className="size-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
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
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-app-border bg-app-card transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-[240px]",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-app-border px-4", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <Link href="/dashboard" aria-label="Fraccion, ir al resumen">
            <LogoLockup />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!collapsed}
          className="flex size-8 items-center justify-center rounded-app-control text-ink-500 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-ink-900"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>

      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((s) => (
          <div key={s.title} className="mb-5">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-ink-500">{s.title}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {s.items.map((item) => (
                <SideLink key={item.href} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-app-border px-3 py-3">
        <SideLink item={NAV_AJUSTES} collapsed={collapsed} />
        <div className={cn("mt-2 flex items-center gap-3 rounded-app-control px-2 py-2", collapsed && "justify-center px-0")}>
          <Avatar name={user.name || user.email} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink-900">{user.name || user.email}</p>
              <Link href="/upgrade" className="text-[12px] text-ink-500 hover:text-ink-900">
                Plan {user.planLabel}
              </Link>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}