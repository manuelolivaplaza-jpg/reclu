import { processPaymentNotification } from "@/lib/billing/process";
import { createFlowProvider, createMercadoPagoProvider, createMockProvider } from "@/lib/billing";
import type { PaymentProvider } from "@/lib/billing/types";

/**
 * POST /api/billing/webhook/[provider]
 *
 * Notificación server-to-server del proveedor de pagos. La ruta:
 *  1. Instancia el proveedor por segmento de URL (no por env) — así se
 *     pueden registrar ambos webhooks a la vez durante una migración.
 *  2. Delega la verificación al proveedor: firma (MP x-signature) o
 *     consulta al API (Flow payment/getStatus). El cuerpo NUNCA es la
 *     verdad: solo sirve para saber qué preguntar.
 *  3. procesa de forma idempotente (payment_events.event_id único).
 *  4. Actualiza profiles.plan con service role SOLO tras verificación.
 *
 * Siempre responde 200 a notificaciones bien formadas (los proveedores
 * reintentan con backoff si respondes 4xx/5xx; responder 200 sin procesar
 * un duplicado es lo correcto).
 */

const providers: Record<string, () => PaymentProvider> = {
  flow: () => createFlowProvider(getMode()),
  mercadopago: () => createMercadoPagoProvider(),
  mock: () => createMockProvider(),
};

function getMode(): "sandbox" | "production" {
  return process.env.PAYMENT_MODE === "production" ? "production" : "sandbox";
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await ctx.params;
  const factory = providers[providerId];
  if (!factory) {
    return Response.json({ ok: false, error: "Proveedor desconocido." }, { status: 404 });
  }

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const url = new URL(request.url);

  const provider = factory();
  try {
    const result = await processPaymentNotification(provider, {
      rawBody,
      headers,
      query: url.searchParams,
    });
    // 200 siempre que la notificación es de este proveedor y llegó bien
    // (aunque sea duplicado o no cambie el plan).
    return Response.json(result);
  } catch (err) {
    console.error(`[billing/webhook/${providerId}]`, err);
    // 500 para que el proveedor reintente (p.ej. base caída).
    return Response.json({ ok: false, error: "Error procesando." }, { status: 500 });
  }
}
