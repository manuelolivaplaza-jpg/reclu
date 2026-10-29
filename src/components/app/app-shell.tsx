"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { MobileTabBar } from "@/components/app/mobile-tab-bar";
import { cn } from "@/lib/utils";

export interface AppUser {
  name: string;
  email: string;
  /** "Free" | "Pro" | "Elite" */
  planLabel: string;
}

const STORAGE_KEY = "reclu.sidebar.collapsed";

/**
 * d47: shell de la app. Escritorio: sidebar fija 240px (colapsable a 72px)
 * + topbar 56px con ⌘K y avatar. Móvil: header 52px + tab bar fija con blur.
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
    <div className="app-root min-h-dvh bg-app-canvas text-ink-900 [--app-tabbar-h:calc(64px+env(safe-area-inset-bottom))] [--app-topbar-h:52px] lg:[--app-tabbar-h:0px] lg:[--app-topbar-h:56px]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-app-control focus:bg-white focus:px-3 focus:py-2 focus:shadow-app-raised"
      >
        Saltar al contenido
      </a>
      <AppSidebar user={user} myPortfolio={myPortfolio} collapsed={collapsed} onToggle={toggle} />
      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]")}>
        <AppTopbar user={user} />
        <main id="main" tabIndex={-1} className="flex-1 pb-tabbar outline-none lg:pb-12">
          <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-8 lg:pt-8">{children}</div>
        </main>
      </div>
      <MobileTabBar myPortfolio={myPortfolio} />
    </div>
  );
}