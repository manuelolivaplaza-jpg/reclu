"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { MobileTabBar } from "@/components/app/mobile-tab-bar";
import { cn } from "@/lib/utils";

export interface AppUser {
  name: string;
  email: string;
  /** "Gratis" | "Pro" | "Elite" (el layout server traduce "Free" a "Gratis"). */
  planLabel: string;
}

const STORAGE_KEY = "reclu.sidebar.collapsed";

/**
 * d80: cabina de Fraccion. Escritorio: sidebar blanca de 240px (colapsable a 72px)
 * + topbar de 56px con filete inferior; móvil: header de 52px + tab bar sólida.
 * Solo recibe datos serializables (strings/booleans) desde el layout server.
 */
export function AppShell({
  user,
  myPortfolio,
  children,
}: {
  user: AppUser;
  myPortfolio: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  return (
    <div className="app-root min-h-dvh bg-white text-ink-900 [--app-tabbar-h:calc(64px+env(safe-area-inset-bottom))] [--app-topbar-h:52px] lg:[--app-tabbar-h:0px] lg:[--app-topbar-h:56px]">
      <a
        href="#main"
        className="fixed left-4 top-4 z-[60] inline-flex h-10 -translate-y-24 items-center rounded-full bg-ink-900 px-5 text-[13px] font-medium text-white transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-ink-900 motion-reduce:transition-none"
      >
        Saltar al contenido principal
      </a>
      <AppSidebar user={user} myPortfolio={myPortfolio} collapsed={collapsed} onToggle={toggle} />
      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]",
        )}
      >
        <AppTopbar user={user} />
        <main id="main" tabIndex={-1} className="flex-1 pb-tabbar outline-none lg:pb-12">
          <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">{children}</div>
        </main>
      </div>
      <MobileTabBar myPortfolio={myPortfolio} />
    </div>
  );
}
