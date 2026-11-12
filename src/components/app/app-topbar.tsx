"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, CreditCard } from "lucide-react";
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

  // El menú se cierra al elegir un ítem (onClick del contenedor) y al hacer
  // clic fuera o Escape. Sin efecto sobre `pathname`: evita un render extra
  // en cada navegación.

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
      triggerRef.current?.focus();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-[52px] w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:h-14 lg:px-8">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center lg:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
          aria-label="Fraccion, ir al resumen"
        >
          <LogoMark />
        </Link>
        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          <p className="truncate text-[15px] font-medium leading-none tracking-[-0.01em] text-ink-900">{titleFor(pathname)}</p>
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-line" />
          <Link
            href={isFree ? "/upgrade" : "/settings#plan"}
            className="inline-flex h-7 shrink-0 items-center border border-line px-2 text-[11px] font-medium leading-none text-ink-500 transition-colors hover:border-ink-900 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
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
              aria-controls={open ? "app-account-menu" : undefined}
              aria-label="Menú de cuenta"
              className="flex size-11 items-center justify-center rounded-none transition-colors hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900"
            >
              <Avatar name={user.name || user.email} />
            </button>
            {open && (
              <div
                ref={menuRef}
                id="app-account-menu"
                role="menu"
                aria-label="Cuenta"
                onKeyDown={onMenuKeys}
                onClick={() => setOpen(false)}
                className="absolute right-0 top-[calc(100%+10px)] w-[248px] rounded-none border border-line bg-canvas"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-[13px] font-medium leading-tight tracking-[-0.01em] text-ink-900">
                    {user.name || "Tu cuenta"}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-500">{user.email}</p>
                  <p className="label-line mt-1.5">Plan {plan}</p>
                </div>
                <div className="divide-y divide-line">
                  <Link
                    role="menuitem"
                    tabIndex={-1}
                    href="/settings"
                    className="flex min-h-11 items-center gap-3 px-4 text-[13.5px] text-ink-900 transition-colors hover:bg-ink-50 focus:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900"
                  >
                    <Settings className="size-4 shrink-0 text-ink-500" strokeWidth={1.5} aria-hidden /> Ajustes
                  </Link>
                  <Link
                    role="menuitem"
                    tabIndex={-1}
                    href="/upgrade"
                    className="flex min-h-11 items-center gap-3 px-4 text-[13.5px] text-ink-900 transition-colors hover:bg-ink-50 focus:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900"
                  >
                    <CreditCard className="size-4 shrink-0 text-ink-500" strokeWidth={1.5} aria-hidden /> Suscripción
                  </Link>
                </div>
                <form action="/auth/signout" method="post" className="border-t border-line">
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    type="submit"
                    className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-[13.5px] text-ink-900 transition-colors hover:bg-ink-50 focus:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-900"
                  >
                    <LogOut className="size-4 shrink-0 text-ink-500" strokeWidth={1.5} aria-hidden /> Cerrar sesión
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