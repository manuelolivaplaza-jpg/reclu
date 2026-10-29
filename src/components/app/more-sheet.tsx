"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { AppIcon } from "@/components/app/app-icon";
import { isActivePath } from "@/components/app/app-href";
import type { AppNavItem } from "@/components/app/nav-config";
import { cn } from "@/lib/utils";

/** Bottom sheet "Más" (móvil): ítems secundarios + Salir. */
export function MoreSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: AppNavItem[] }) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Más opciones">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-white/95 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-app-raised outline-none backdrop-blur-2xl"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-ink-200" />
        <ul className="mt-3 px-3">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href, item.match);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-4 rounded-app px-3 text-[16px] font-medium",
                    active ? "bg-ink-100 text-ink-900" : "text-ink-800 active:bg-ink-50",
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-ink-100 text-ink-900">
                    <AppIcon name={item.icon} className="size-[18px]" />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="size-4 text-ink-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
        <form action="/auth/signout" method="post" className="mt-2 border-t border-app-border px-3 pt-2">
          <button type="submit" className="flex min-h-14 w-full items-center gap-4 rounded-app px-3 text-left text-[16px] font-medium text-ink-800 active:bg-ink-50">
            <span className="flex size-9 items-center justify-center rounded-full bg-ink-100 text-ink-900">
              <AppIcon name="LogOut" className="size-[18px]" />
            </span>
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}