import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { followPortfolio, unfollowPortfolio } from "@/lib/queries";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT } from "@/lib/types";

/**
 * POST /api/follow — toggle follow for a portfolio.
 * Body: { portfolioId: string }
 * Response: { ok: true, following: boolean } or { ok: false, error, redirect? }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ ok: false, error: "Debes iniciar sesión.", redirect: "/login?next=/dashboard" }, { status: 401 });
  }

  let body: { portfolioId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Body inválido." }, { status: 400 });
  }

  const portfolioId = body.portfolioId;
  if (!portfolioId || typeof portfolioId !== "string") {
    return Response.json({ ok: false, error: "portfolioId requerido." }, { status: 400 });
  }

  // Check current state
  const { data: existing } = await supabase
    .from("follows")
    .select("portfolio_id")
    .eq("user_id", user.id)
    .eq("portfolio_id", portfolioId)
    .maybeSingle();

  if (existing) {
    await unfollowPortfolio(portfolioId);
    revalidatePath("/explore");
    revalidatePath("/dashboard");
    return Response.json({ ok: true, following: false });
  }

  const result = await followPortfolio(portfolioId);
  if (!result.ok) {
    if (result.reason === "limit_reached") {
      return Response.json(
        {
          ok: false,
          error:
            result.limit === PRO_PLAN_FOLLOW_LIMIT
              ? `El plan Pro permite seguir hasta ${PRO_PLAN_FOLLOW_LIMIT} portafolios. ¡Pasa a Elite para seguir ilimitados!`
              : `El plan gratuito permite seguir hasta ${FREE_PLAN_FOLLOW_LIMIT} portafolios. ¡Actualiza a Pro!`,
          redirect: "/#precios",
        },
      );
    }
    if (result.reason === "premium_required") {
      return Response.json({
        ok: false,
        error: "Este portafolio requiere un plan de pago (Pro o Elite).",
        redirect: "/#precios",
      });
    }
    return Response.json({ ok: false, error: result.error ?? "Error al seguir." });
  }

  revalidatePath("/explore");
  revalidatePath("/dashboard");
  return Response.json({ ok: true, following: true });
}
