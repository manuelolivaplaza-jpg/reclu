/**
 * d47: navegación del dashboard. Los íconos viajan como string (nombre)
 * y se resuelven en el cliente: nunca pasar componentes de Server a Client (d46).
 */
export type AppIconName =
  | "LayoutDashboard"
  | "Compass"
  | "BellRing"
  | "PieChart"
  | "Wallet"
  | "Settings"
  | "CreditCard"
  | "Menu"
  | "LogOut"
  | "Star"
  | "MessageCircle";

export interface AppNavItem {
  href: string;
  label: string;
  /** Label corto para la barra inferior móvil. */
  short?: string;
  icon: AppIconName;
  /** Rutas extra que también marcan el ítem como activo. */
  match?: string[];
}

export interface AppNavSection {
  title: string;
  items: AppNavItem[];
}

export const NAV_RESUMEN: AppNavItem = { href: "/dashboard", label: "Resumen", icon: "LayoutDashboard" };
export const NAV_EXPLORAR: AppNavItem = {
  href: "/app/explorar",
  label: "Explorar",
  icon: "Compass",
  match: ["/app/portafolio"],
};
export const NAV_SEGUIMIENTO: AppNavItem = { href: "/app/seguimiento", label: "Seguimiento", icon: "Star" };
export const NAV_CHAT: AppNavItem = { href: "/app/chat", label: "Pregúntale a Fraccion", short: "Chat", icon: "MessageCircle" };
export const NAV_ALERTAS: AppNavItem = { href: "/alerts", label: "Alertas", icon: "BellRing" };
export const NAV_MI_PORTAFOLIO: AppNavItem = { href: "/mi-portafolio", label: "Mi portafolio", short: "Portafolio", icon: "Wallet" };
export const NAV_COMPARAR: AppNavItem = { href: "/compare", label: "Comparar", short: "Comparar", icon: "PieChart" };
export const NAV_AJUSTES: AppNavItem = { href: "/settings", label: "Ajustes", icon: "Settings" };
export const NAV_PLAN: AppNavItem = { href: "/upgrade", label: "Suscripción", short: "Plan", icon: "CreditCard" };

export function navSections(myPortfolio: boolean): AppNavSection[] {
  return [
    { title: "Principal", items: [NAV_RESUMEN, NAV_SEGUIMIENTO, NAV_EXPLORAR, NAV_CHAT, NAV_ALERTAS] },
    {
      title: "Mis inversiones",
      items: myPortfolio ? [NAV_MI_PORTAFOLIO, NAV_COMPARAR] : [NAV_COMPARAR],
    },
  ];
}

/**
 * 4 pestañas fijas en móvil; el resto vive en "Más". La cuarta pestaña es el
 * portafolio propio cuando está habilitado y, si no, la comparación.
 */
export function mobileTabs(myPortfolio: boolean): AppNavItem[] {
  return [NAV_RESUMEN, NAV_EXPLORAR, NAV_ALERTAS, myPortfolio ? NAV_MI_PORTAFOLIO : NAV_COMPARAR];
}

/** Ítems de "Más", sin repetir lo que ya está en la barra inferior. */
export function moreItems(myPortfolio: boolean): AppNavItem[] {
  const visible = new Set(mobileTabs(myPortfolio).map((item) => item.href));
  const all = myPortfolio
    ? [NAV_CHAT, NAV_SEGUIMIENTO, NAV_MI_PORTAFOLIO, NAV_COMPARAR, NAV_AJUSTES, NAV_PLAN]
    : [NAV_CHAT, NAV_SEGUIMIENTO, NAV_COMPARAR, NAV_AJUSTES, NAV_PLAN];
  return all.filter((item) => !visible.has(item.href));
}

/** Título para la topbar según la ruta (incluye subrutas y fichas). */
export function titleFor(pathname: string): string {
  if (pathname === "/settings/api" || pathname.startsWith("/settings/api/")) return "API";
  if (pathname.startsWith("/app/portafolio")) return "Ficha de portafolio";
  if (pathname === "/mi-portafolio" || pathname.startsWith("/mi-portafolio/")) return "Mi portafolio";
  if (pathname === "/upgrade" || pathname.startsWith("/upgrade/")) return "Suscripción";
  const all = [NAV_RESUMEN, NAV_SEGUIMIENTO, NAV_CHAT, NAV_EXPLORAR, NAV_ALERTAS, NAV_MI_PORTAFOLIO, NAV_COMPARAR, NAV_AJUSTES, NAV_PLAN];
  const hit = all.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return hit?.short ?? hit?.label ?? "Fraccion";
}