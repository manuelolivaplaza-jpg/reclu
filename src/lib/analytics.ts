/**
 * Analítica ligera sin cookies invasivas.
 *
 * - Vercel Analytics: se activa con `<Analytics />` (ya montado en layout)
 *   y funciona sin configuración en Vercel.
 * - Plausible: script dedicado que NO usa cookies; se activa solo si
 *   NEXT_PUBLIC_PLAUSIBLE_DOMAIN está definido. Eventos vía `track()`.
 *
 * `track()` es seguro en cualquier contexto: si no hay proveedor, no-op.
 */

/** Eventos del embudo de negocio (los 5 del informe F6). */
export type AnalyticsEvent =
  | "signup"
  | "follow"
  | "chat_open"
  | "pricing_view"
  | "checkout_click";

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void;
  }
}

/** Registra un evento de analítica (Plausible custom event; no-op sin proveedor). */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    /* analítica jamás rompe la UI */
  }
}

/** Dominio de Plausible si está configurado (controla si se carga el script). */
export function plausibleDomain(): string | null {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";
  return domain.trim() !== "" ? domain.trim() : null;
}
