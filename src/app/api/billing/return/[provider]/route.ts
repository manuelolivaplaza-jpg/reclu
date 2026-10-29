import { NextResponse } from "next/server";
import { getProviderById, PaymentsNotConfiguredError } from "@/lib/billing";
import { syncProviderSubscription } from "@/lib/billing/process";
import { siteUrl } from "@/lib/site";

/**
 * GET /api/billing/return/[provider]
 *
 * Vuelta del usuario desde el checkout del proveedor (back_url de Mercado
 * Pago: ?preapproval_id=...). Nunca confía en los parámetros: consulta el
 * estado al API del proveedor, sincroniza la suscripción local (misma lógica
 * idempotente que el webhook) y redirige a:
 *   active  -> /upgrade/exito
 *   pending -> /upgrade/pendiente
 *   otro    -> /upgrade/error
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await ctx.params;
  const base = siteUrl();
  const go = (path: string) => NextResponse.redirect(`${base}${path}`, 303);

  if (providerId !== "mercadopago") return go("/upgrade/error");

  const url = new URL(request.url);
  const id = (url.searchParams.get("preapproval_id") ?? "").trim();
  if (!id || !/^[A-Za-z0-9_-]{6,80}$/.test(id)) return go("/upgrade/error");

  try {
    const provider = getProviderById(providerId);
    const synced = await syncProviderSubscription(provider, id);
    if (!synced) return go("/upgrade/pendiente");
    if (synced.state === "active") return go("/upgrade/exito");
    if (synced.state === "pending") return go("/upgrade/pendiente");
    return go("/upgrade/error");
  } catch (err) {
    if (!(err instanceof PaymentsNotConfiguredError)) {
      console.error("[billing/return]", err instanceof Error ? err.message : err);
    }
    // Ante la duda, pendiente: el webhook termina de sincronizar.
    return go("/upgrade/pendiente");
  }
}
