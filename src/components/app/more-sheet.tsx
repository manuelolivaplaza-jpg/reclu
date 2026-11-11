"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { AppIcon } from "@/components/app/app-icon";
import { isActivePath } from "@/components/app/app-href";
import type { AppNavItem } from "@/components/app/nav-config";
import { cn } from "@/lib/utils";

/**
 * d80: hoja inferior "Menú" (móvil). Blanca sólida, filete superior negro,
 * sin radios ni blur: filas con filete de 1px y toque mínimo de 56px.
 */
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
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="more-sheet-title">
      <button
        type="button"
        aria-label="Cerrar menú"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 focus-visible:outline-none"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-none border-t border-ink-900 bg-white pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-ink-200 bg-white px-4">
          <h2 id="more-sheet-title" className="text-[13px] font-medium leading-none tracking-[-0.01em] text-ink-900">
            Menú
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center px-2 text-[13px] text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          >
            Cerrar
          </button>
        </div>
        <ul className="divide-y divide-ink-200">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href, item.match);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 items-center gap-3 px-4 text-[15px] tracking-[-0.01em] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-900",
                    active ? "bg-ink-50 font-medium text-ink-900" : "font-normal text-ink-700 active:bg-ink-50",
                  )}
                >
                  {active && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-ink-900" />}
                  <AppIcon
                    name={item.icon}
                    className={cn("size-[18px] shrink-0", active ? "text-ink-900" : "text-ink-500")}
                    strokeWidth={1.6}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-400" strokeWidth={1.5} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
        <form action="/auth/signout" method="post" className="border-t border-ink-200">
          <button
            type="submit"
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] tracking-[-0.01em] text-ink-700 transition-colors active:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink-900"
          >
            <AppIcon name="LogOut" className="size-[18px] shrink-0 text-ink-500" strokeWidth={1.6} />
            <span className="flex-1">Cerrar sesión</span>
          </button>
        </form>
      </div>
    </div>
  );
}