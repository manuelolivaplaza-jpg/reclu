import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/billing";
import { recordPendingCheckout } from "@/lib/billing/pending";
import { revalidatePath } from "next/cache";

/**
 * POST /api/billing/checkout
 * Body: { plan: "pro" | "elite", period: "mensual" | "anual" }
 * Requiere sesión. Crea el checkout con el proveedor activo y devuelve
 * { ok: true, url } para redirigir al usuario.
 */

const checkoutSchema = z.object({
  plan: z.enum(["pro", "elite"]),
  period: z.enum(["mensual", "anual"]).default("mensual"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { ok: false, error: "Debes iniciar sesión.", redirect: "/login?next=/upgrade" },
      { status: 401 },
    );
  }

  let parsed: z.infer<typeof checkoutSchema>;
  try {
    parsed = checkoutSchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "Plan o periodo inválido." },
      { status: 400 },
    );
  }

  const provider = getPaymentProvider();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  try {
    const result = await provider.createCheckout({
      userId: user.id,
      email: user.email ?? "",
      plan: parsed.plan,
      period: parsed.period,
      successUrl: `${origin}/upgrade/exito`,
      failureUrl: `${origin}/upgrade/error`,
      webhookUrl: `${origin}/api/billing/webhook/${provider.id}`,
    });

    // Guardamos el intento para poder retomar el alta tras el enrolamiento
    // de tarjeta (Flow) o si el webhook llega con solo el id del proveedor.
    await recordPendingCheckout({
      userId: user.id,
      plan: parsed.plan,
      period: parsed.period,
      provider: provider.id,
      providerSubscriptionId: result.providerSubscriptionId,
      providerCustomerId: result.providerCustomerId,
    });

    revalidatePath("/upgrade");
    return Response.json({ ok: true, url: result.url, provider: provider.id });
  } catch (err) {
    console.error("[billing/checkout]", err);
    return Response.json(
      { ok: false, error: "No se pudo iniciar el pago. Intenta de nuevo." },
      { status: 502 },
    );
  }
}
