/**
 * Hook opcional de proveedores para completar el alta tras el enrolamiento
 * (p.ej. Flow: tras registrar la tarjeta se crea la suscripción al plan
 * pendiente del checkout).
 */

export interface SubscriptionCompleter {
  /**
   * Crea la suscripción al plan pendiente y devuelve su id en el proveedor,
   * o null si no se pudo crear (proveedor sin soporte, plan sin id, error).
   */
  completeSubscriptionAfterEnrollment?(
    providerCustomerId: string,
    plan: "pro" | "elite",
    period: "mensual" | "anual",
  ): Promise<string | null>;
}
