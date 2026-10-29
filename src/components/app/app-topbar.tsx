"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/app/logo-mark";
import { CommandPalette } from "@/components/command-palette";
import { Avatar } from "@/components/app/avatar";
import { titleFor } from "@/components/app/nav-config";
import type { AppUser } from "@/components/app/app-shell";

/** Topbar: 52px móvil (logo, ⌘K, avatar) · 56px escritorio (título, ⌘K, avatar). */
export function AppTopbar({ user }: { user: AppUser }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-app-border bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-[52px] max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:h-14 lg:px-8">
        <Link href="/dashboard" className="lg:hidden" aria-label="Reclu, ir al resumen">
          <LogoMark />
        </Link>
        <h1 className="hidden text-[15px] font-semibold text-ink-900 lg:block">{titleFor(pathname)}</h1>
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette />
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="Menú de cuenta"
              className="flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ink-900"
            >
              <Avatar name={user.name || user.email} />
            </button>
            {open && (
              <div
                role="menu"
                className="absolute right-0 top-12 w-60 overflow-hidden rounded-app border border-app-border bg-white shadow-app-raised"
              >
                <div className="border-b border-app-border px-4 py-3">
                  <p className="truncate text-[14px] font-medium text-ink-900">{user.name || "Tu cuenta"}</p>
                  <p className="truncate text-[12px] text-ink-500">{user.email}</p>
                </div>
                <Link role="menuitem" href="/settings" className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-ink-700 hover:bg-ink-50">
                  <Settings className="size-4" /> Ajustes
                </Link>
                <Link role="menuitem" href="/upgrade" className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-ink-700 hover:bg-ink-50">
                  <Sparkles className="size-4" /> Plan {user.planLabel}
                </Link>
                <form action="/auth/signout" method="post" className="border-t border-app-border">
                  <button role="menuitem" type="submit" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-ink-700 hover:bg-ink-50">
                    <LogOut className="size-4" /> Salir
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