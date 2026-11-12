"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/app/logo-mark";
import { CommandPalette } from "@/components/command-palette-lazy";
import { Avatar } from "@/components/app/avatar";
import { titleFor } from "@/components/app/nav-config";
import type { AppUser } from "@/components/app/app-shell";

/** "Free" (legado) y "Gratis" se muestran igual: la navegación siempre habla español. */
function planName(planLabel: string): string {
  return planLabel === "Free" || !planLabel ? "Gratis" : planLabel;
}

/** Topbar: 52px móvil (logo, ⌘K, avatar) · 56px escritorio (título, plan, ⌘K, avatar). */
export function AppTopbar({ user }: { user: AppUser }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const plan = planName(user.planLabel);
  const isFree = plan === "Gratis";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();

    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKeys(e: React.KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(index + 1) % nodes.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(index - 1 + nodes.length) % nodes.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      nodes[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      nodes[nodes.length - 1].focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-[52px] w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:h-14 lg:px-8">
        <Link
          href="/dashboard"
          className="lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          aria-label="Fraccion, ir al resumen"
        >
          <LogoMark />
        </Link>
        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          <h1 className="truncate text-[15px] font-medium leading-none tracking-[-0.01em] text-ink-900">{titleFor(pathname)}</h1>
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-ink-200" />
          <Link
            href={isFree ? "/upgrade" : "/settings#plan"}
            className="inline-flex h-[22px] shrink-0 items-center border border-ink-200 px-2 text-[10.5px] font-medium leading-none text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          >
            Plan {plan}
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <CommandPalette />
          <div ref={wrapRef} className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="Menú de cuenta"
              className="flex size-11 items-center justify-center rounded-none transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 lg:size-10"
            >
              <Avatar name={user.name || user.email} />
            </button>
            {open && (
              <div
                ref={menuRef}
                role="menu"
                aria-label="Cuenta"
                onKeyDown={onMenuKeys}
                className="absolute right-0 top-[calc(100%+10px)] w-[248px] rounded-none border border-ink-200 bg-white"
              >
                <div className="border-b border-ink-200 px-3 py-3">
                  <p className="truncate text-[13px] font-medium leading-tight tracking-[-0.01em] text-ink-900">
                    {user.name || "Tu cuenta"}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] leading-tight text-ink-500">{user.email}</p>
                  <p className="mt-2 text-[10.5px] leading-none text-ink-500">Plan {plan}</p>
                </div>
                <div className="divide-y divide-ink-200">
                  <Link
                    role="menuitem"
                    tabIndex={-1}
                    href="/settings"
                    className="flex min-h-11 items-center gap-3 px-3 text-[13.5px] text-ink-700 outline-none transition-colors hover:bg-ink-50 hover:text-ink-900 focus:bg-ink-50 focus:text-ink-900"
                  >
                    <Settings className="size-4 shrink-0 text-ink-500" strokeWidth={1.6} aria-hidden /> Ajustes
                  </Link>
                  <Link
                    role="menuitem"
                    tabIndex={-1}
                    href="/upgrade"
                    className="flex min-h-11 items-center gap-3 px-3 text-[13.5px] text-ink-700 outline-none transition-colors hover:bg-ink-50 hover:text-ink-900 focus:bg-ink-50 focus:text-ink-900"
                  >
                    <Sparkles className="size-4 shrink-0 text-ink-500" strokeWidth={1.6} aria-hidden /> Suscripción
                  </Link>
                </div>
                <form action="/auth/signout" method="post" className="border-t border-ink-200">
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    type="submit"
                    className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-[13.5px] text-ink-700 outline-none transition-colors hover:bg-ink-50 hover:text-ink-900 focus:bg-ink-50 focus:text-ink-900"
                  >
                    <LogOut className="size-4 shrink-0 text-ink-500" strokeWidth={1.6} aria-hidden /> Cerrar sesión
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}