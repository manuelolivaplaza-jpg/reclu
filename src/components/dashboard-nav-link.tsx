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
 * Dashboard nav link — activo con filete izquierdo 2px negro (sidebar)
 * o barra inferior (bottom nav móvil). Iconos Lucide 16px, stroke 1.5,
 * color heredado. Sin cajas de color.
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
          "flex items-center gap-3 border-l-2 py-2.5 pl-4 text-[15px] transition-opacity",
          active
            ? "border-ink-900 text-ink-900"
            : "border-transparent text-ink-500 hover:text-ink-900",
        )}
      >
        <Icon className="size-4" strokeWidth={1.5} />
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-opacity",
        active ? "text-ink-900" : "text-ink-500 hover:text-ink-900",
      )}
    >
      <span
        className={cn(
          "flex h-1 w-8 rounded-full transition-colors",
          active ? "bg-ink-900" : "bg-transparent",
        )}
      />
      <Icon className="mt-1 size-5" strokeWidth={1.5} />
      {item.label}
    </Link>
  );
}
