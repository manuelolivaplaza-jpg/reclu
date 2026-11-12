"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { MobileTabBar } from "@/components/app/mobile-tab-bar";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AppUser {
  name: string;
  email: string;
  /** "Gratis" | "Pro" | "Elite" (el layout server traduce "Free" a "Gratis"). */
  planLabel: string;
}

const STORAGE_KEY = "reclu.sidebar.collapsed";

/**
 * Preferencia del rail como store externo mínimo (localStorage).
 * `useSyncExternalStore` evita leer el almacenamiento durante el render y
 * mantiene el HTML del servidor estable (siempre expandido) hasta hidratar.
 */
let collapsedCache: boolean | null = null;
const collapsedListeners = new Set<() => void>();

function readCollapsed(): boolean {
  if (collapsedCache === null) {
    try {
      collapsedCache = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      collapsedCache = false;
    }
  }
  return collapsedCache;
}

function writeCollapsed(next: boolean): void {
  collapsedCache = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* almacenamiento bloqueado: el estado vive solo en memoria */
  }
  collapsedListeners.forEach((listener) => listener());
}

function subscribeCollapsed(listener: () => void): () => void {
  collapsedListeners.add(listener);
  return () => collapsedListeners.delete(listener);
}

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
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const pathname = usePathname() ?? "";
  const mainRef = useRef<HTMLElement>(null);
  const firstPath = useRef(pathname);

  // Al cambiar de ruta, el foco va al contenido (no al enlace del menú): el
  // lector de pantalla anuncia la página nueva. En la primera carga no se
  // mueve el foco, para no interrumpir la lectura inicial.
  useEffect(() => {
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    mainRef.current?.focus();
  }, [pathname]);

  function toggle() {
    writeCollapsed(!collapsed);
  }

  return (
    <div className="app-root min-h-dvh bg-canvas text-ink-900 [--app-tabbar-h:calc(64px+env(safe-area-inset-bottom))] [--app-topbar-h:calc(52px+env(safe-area-inset-top))] lg:[--app-tabbar-h:0px] lg:[--app-topbar-h:56px]">
      <AppSidebar user={user} myPortfolio={myPortfolio} collapsed={collapsed} onToggle={toggle} />
      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]",
        )}
      >
        <AppTopbar user={user} />
        <main ref={mainRef} id="main" tabIndex={-1} className="flex-1 scroll-mt-16 pb-tabbar outline-none lg:pb-12">
          <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">{children}</div>
        </main>
      </div>
      <MobileTabBar myPortfolio={myPortfolio} />
    </div>
  );
}
