import { createClient } from "@/lib/supabase/server";
import { getProviderById, PaymentsNotConfiguredError } from "@/lib/billing";
import { PAYMENTS_UNAVAILABLE_ERROR } from "@/lib/billing/messages";
import { getBillingServiceClient } from "@/lib/billing/supabase-admin";
import { revalidatePath } from "next/cache";

/**
 * POST /api/billing/cancel — cancela la suscripción propia del usuario.
 *
 * Encuentra la suscripción ACTIVA del usuario en la base, llama al
 * proveedor para cancelarla y marca cancel_at_period_end. El downgrade
 * real a `free` lo hace el webhook cuando el período termina (o el
 * proceso de expiración), no esta ruta: nunca bajamos el plan por una
 * acción del usuario sin confirmación del proveedor.
 */

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ ok: false, error: "Debes iniciar sesión." }, { status: 401 });
  }

  const admin = getBillingServiceClient();
  const { data: sub, error } = await admin
    .from("subscriptions")
    .select("id, provider, provider_subscription_id, status")
    .eq("user_id", user.id)
    .in("status", ["active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !sub) {
    return Response.json(
      { ok: false, error: "No encontramos una suscripción activa." },
      { status: 404 },
    );
  }

  // El proveedor se elige por la FILA (la suscripción se creó con él),
  // no por el env actual — permite migrar de proveedor sin romper las
  // suscripciones vigentes.
  let provider;
  try {
    provider = getProviderById(sub.provider);
  } catch (err) {
    // F82: sin claves del proveedor de la suscripción no se puede cancelar
    // por API. Se responde 503 con mensaje genérico en vez de un 500.
    if (err instanceof PaymentsNotConfiguredError) {
      return Response.json(
        { ok: false, error: PAYMENTS_UNAVAILABLE_ERROR },
        { status: 503 },
      );
    }
    throw err;
  }
  let cancelAtPeriodEnd = false;
  if (sub.provider_subscription_id) {
    try {
      const result = await provider.cancelSubscription(sub.provider_subscription_id);
      cancelAtPeriodEnd = result.cancelAtPeriodEnd;
    } catch (err) {
      console.error("[billing/cancel]", err);
      return Response.json(
        { ok: false, error: "No pudimos cancelar con el proveedor. Intenta más tarde." },
        { status: 502 },
      );
    }
  }

  // Marcar en la base. Con cancel_at_period_end el plan sigue vigente hasta
  // que el webhook confirme el fin del período.
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      status: cancelAtPeriodEnd ? "active" : "canceled",
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);
  if (updateError) {
    console.error("[billing/cancel] db:", updateError.message);
    return Response.json({ ok: false, error: "Error guardando la cancelación." }, { status: 500 });
  }

  revalidatePath("/settings");
  revalidatePath("/upgrade");
  return Response.json({ ok: true, cancelAtPeriodEnd });
}
