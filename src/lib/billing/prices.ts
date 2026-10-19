/**
 * Precios de planes en CLP.
 *
 * // TODO(integración): usar src/lib/plans.ts (frente F4) cuando exista.
 * Mantener en sincronía con esos valores.
 */

export const PLAN_PRICES_CLP: Record<
  "pro" | "elite",
  { monthly: number; annualMonthly: number; annualTotal: number }
> = {
  pro: {
    monthly: 12990,
    annualMonthly: 10390, // 20% descuento aprox.
    annualTotal: 124680,
  },
  elite: {
    monthly: 16990,
    annualMonthly: 13590,
    annualTotal: 163080,
  },
};

export const ANNUAL_DISCOUNT_PCT = 20;

/** Formatea 12990 → "$12.990" (punto como separador de miles). */
export function formatCLP(amount: number): string {
  return `$${amount.toLocaleString("es-CL")}`;
}
