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
  | "Sparkles"
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
export const NAV_CHAT: AppNavItem = { href: "/app/chat", label: "Pregúntale a Reclu", short: "Chat", icon: "MessageCircle" };
export const NAV_ALERTAS: AppNavItem = { href: "/alerts", label: "Alertas", icon: "BellRing" };
export const NAV_MI_PORTAFOLIO: AppNavItem = { href: "/mi-portafolio", label: "Mi portafolio", icon: "Wallet" };
export const NAV_COMPARAR: AppNavItem = { href: "/compare", label: "Comparar", short: "Cartera", icon: "PieChart" };
export const NAV_AJUSTES: AppNavItem = { href: "/settings", label: "Ajustes", icon: "Settings" };
export const NAV_PLAN: AppNavItem = { href: "/upgrade", label: "Plan", icon: "Sparkles" };

export function navSections(myPortfolio: boolean): AppNavSection[] {
  return [
    { title: "Principal", items: [NAV_RESUMEN, NAV_SEGUIMIENTO, NAV_EXPLORAR, NAV_CHAT, NAV_ALERTAS] },
    {
      title: "Mis inversiones",
      items: myPortfolio ? [NAV_MI_PORTAFOLIO, NAV_COMPARAR] : [NAV_COMPARAR],
    },
  ];
}

/** 4 pestañas fijas en móvil; el resto vive en "Más". */
export function mobileTabs(myPortfolio: boolean): AppNavItem[] {
  return [
    NAV_RESUMEN,
    NAV_EXPLORAR,
    NAV_ALERTAS,
    { ...NAV_COMPARAR, label: "Cartera", match: myPortfolio ? ["/mi-portafolio"] : [] },
  ];
}

export function moreItems(myPortfolio: boolean): AppNavItem[] {
  return myPortfolio ? [NAV_CHAT, NAV_SEGUIMIENTO, NAV_MI_PORTAFOLIO, NAV_COMPARAR, NAV_AJUSTES, NAV_PLAN] : [NAV_CHAT, NAV_SEGUIMIENTO, NAV_COMPARAR, NAV_AJUSTES, NAV_PLAN];
}

/** Título para la topbar según la ruta. */
export function titleFor(pathname: string): string {
  const all = [NAV_RESUMEN, NAV_SEGUIMIENTO, NAV_CHAT, NAV_EXPLORAR, NAV_ALERTAS, NAV_MI_PORTAFOLIO, NAV_COMPARAR, NAV_AJUSTES, NAV_PLAN];
  if (pathname.startsWith("/app/portafolio")) return "Portafolio";
  const hit = all.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return hit?.label ?? "Reclu";
}