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
    monthly: 9990,
    annualMonthly: 8325, // precio anual fijo: 99.900 / 12
    annualTotal: 99900,
  },
  elite: {
    monthly: 16990,
    annualMonthly: 13590,
    annualTotal: 163080,
  },
};

export const ANNUAL_DISCOUNT_PCT = 20;

/** Formatea 9990 → "$9.990" (punto como separador de miles). */
export function formatCLP(amount: number): string {
  return `$${amount.toLocaleString("es-CL")}`;
}
