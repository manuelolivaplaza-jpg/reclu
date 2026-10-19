/**
 * Reglas de acceso del muro de pago — qué ve cada rol.
 *
 * El servidor recorta ANTES de serializar: lo que no está permitido
 * nunca llega al navegador. El difuminado (paywall-gate) es solo la
 * máscara visual de datos que ya no existen en el HTML.
 *
 * Propuesta del informe (F6):
 *   - anónimo:    top 5 posiciones y 3 alertas.
 *   - free (con cuenta): top 10 posiciones y 10 alertas.
 *   - pro / elite:      todo + historial completo de snapshots.
 *   - portafolio premium: requiere plan de pago (pro/elite) para todo.
 */

import type { Holding, Alert, Plan } from "@/lib/types";
import { isPaidPlan } from "@/lib/types";

/** Cuántas posiciones (top N por peso) puede ver cada rol. */
export const HOLDING_LIMITS: Record<"anon" | "free" | "paid", number> = {
  anon: 5,
  free: 10,
  paid: Infinity,
};

/** Cuántas alertas recientes puede ver cada rol. */
export const ALERT_LIMITS: Record<"anon" | "free" | "paid", number> = {
  anon: 3,
  free: 10,
  paid: Infinity,
};

export type AccessRole = keyof typeof HOLDING_LIMITS;

/** Rol efectivo según sesión y plan (null = sin sesión). */
export function roleFor(profile: { plan?: Plan | null } | null): AccessRole {
  if (!profile) return "anon";
  if (isPaidPlan(profile.plan)) return "paid";
  return "free";
}

/** ¿El rol puede ver la composición completa de un portafolio premium? */
export function canViewPremium(role: AccessRole): boolean {
  return role === "paid";
}

interface Sliceable {
  holdings?: Holding[];
  alerts?: Alert[];
}

/**
 * Recorta holdings/alerts al máximo del rol. holdings ya viene ordenado
 * por peso descendente (queries.getHoldings).
 */
export function sliceForRole<T extends Sliceable>(data: T, role: AccessRole): T {
  const out = { ...data };
  if (data.holdings && Number.isFinite(HOLDING_LIMITS[role])) {
    out.holdings = data.holdings.slice(0, HOLDING_LIMITS[role]);
  }
  if (data.alerts && Number.isFinite(ALERT_LIMITS[role])) {
    out.alerts = data.alerts.slice(0, ALERT_LIMITS[role]);
  }
  return out;
}
