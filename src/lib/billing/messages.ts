/**
 * Mensajes de "pagos no disponibles" (F82).
 *
 * Módulo aparte a propósito: lo importan tanto el CLIENT component del
 * checkout (`src/components/upgrade-checkout.tsx`) como las rutas de API.
 * `src/lib/billing/index.ts` no es apto para el cliente (importa los
 * adaptadores de Flow/Mercado Pago, que son server-only).
 */

/** Aviso visible en /upgrade cuando no hay proveedor de pagos configurado. */
export const PAYMENTS_UNAVAILABLE_MESSAGE =
  "Los pagos no están disponibles por ahora. Vuelve a intentarlo más tarde.";

/** Error devuelto por el API de checkout cuando falta el proveedor. */
export const PAYMENTS_UNAVAILABLE_ERROR = "Los pagos no están disponibles por ahora.";
