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
 *
 * D55 (decisión de Manu): las posiciones son solo para planes pagados.
 * anon y free ven 0, salvo en las carteras recomendadas de corredoras
 * (category 'broker_cl') y las declaraciones oficiales de EE.UU., que
 * cualquiera ve completas. Misma regla en la migración 069.
 */

import type { Holding, Alert, Plan } from "@/lib/types";
import { isPaidPlan } from "@/lib/types";

export type AccessRole = "anon" | "free" | "paid";

/** Cuántas posiciones (top N por peso) puede ver cada rol. */
export const HOLDING_LIMITS: Record<"anon" | "free" | "paid", number> = {
  anon: 0,
  free: 0,
  paid: Infinity,
};

/** Categoría de las carteras recomendadas de corredoras (Renta 4, BTG, LarrainVial...). */
export const RECOMMENDED_BROKER_CATEGORY = "broker_cl";

/** ¿Es una cartera recomendada de corredora? (abierta para todos). */
export function isRecommendedBrokerPortfolio(p: { category?: string | null } | null | undefined): boolean {
  return p?.category === RECOMMENDED_BROKER_CATEGORY;
}

/** Fuentes oficiales EE.UU. (mismo listado que public-disclosure.ts, sin importar para evitar ciclos). */
const OPEN_SOURCES = new Set(["oge_278t", "house_ptr", "senate_ptr"]);

/** ¿Las posiciones de este portafolio están abiertas sin plan de pago? */
export function holdingsOpenToAll(
  p: { category?: string | null; source?: string | null } | null | undefined,
): boolean {
  return isRecommendedBrokerPortfolio(p) || (!!p?.source && OPEN_SOURCES.has(p.source));
}

/** Límite de posiciones del rol para un portafolio concreto (Infinity = todas). */
export function holdingLimitFor(
  role: AccessRole,
  p: { category?: string | null; source?: string | null } | null | undefined,
): number {
  return holdingsOpenToAll(p) ? Infinity : HOLDING_LIMITS[role];
}

/** ¿El rol puede seguir portafolios? (D55: solo planes pagados). */
export function canFollow(role: AccessRole): boolean {
  return role === "paid";
}

/** Cuántas alertas recientes puede ver cada rol. */
export const ALERT_LIMITS: Record<"anon" | "free" | "paid", number> = {
  anon: 3,
  free: 10,
  paid: Infinity,
};


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
