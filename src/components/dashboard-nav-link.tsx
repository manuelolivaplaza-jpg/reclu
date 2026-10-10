"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Dashboard navigation link that highlights the active route.
 * Renders as a sidebar row or a mobile bottom-bar tab.
 */
export function DashboardNavLink({
  item,
  variant,
}: {
  item: NavItem;
  variant: "sidebar" | "bottom";
}) {
  const pathname = usePathname();
  const active = pathname === item.href;
  const Icon = item.icon;

  if (variant === "sidebar") {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-brand-50 text-brand-700"
            : "text-ink-600 hover:bg-white hover:text-ink-900 hover:shadow-subtle",
        )}
      >
        <Icon className={cn("size-4.5", active && "text-brand-600")} />
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
        active ? "text-brand-600" : "text-ink-600 hover:text-brand-600",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
          active && "bg-brand-50",
        )}
      >
        <Icon className={cn("size-5", active && "text-brand-600")} />
      </span>
      {item.label}
    </Link>
  );
}
