import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { followPortfolio, unfollowPortfolio } from "@/lib/queries";
import { FREE_PLAN_FOLLOW_LIMIT, PRO_PLAN_FOLLOW_LIMIT } from "@/lib/types";
import { firstZodMessage, followBodySchema, friendlyFollowDbError } from "@/lib/validation";

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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Body inválido." }, { status: 400 });
  }

  const parsed = followBodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: firstZodMessage(parsed.error) }, { status: 400 });
  }

  const portfolioId = parsed.data.portfolioId;

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
    if (result.reason === "plan_required") {
      // D55: seguir es solo para planes pagados. El botón muestra el aviso.
      return Response.json(
        {
          ok: false,
          error: "Seguir portafolios es parte de los planes pagados. Suscríbete para recibir sus movimientos.",
          upgrade: "/upgrade",
        },
        { status: 403 },
      );
    }
    if (result.reason === "premium_required") {
      return Response.json({
        ok: false,
        error: "Este portafolio requiere un plan de pago (Pro o Elite).",
        redirect: "/#precios",
      });
    }
    const friendly = result.error ? friendlyFollowDbError(result.error) : null;
    const upgrade = !!friendly && !friendly.includes("propia cuenta");
    return Response.json(
      {
        ok: false,
        error: friendly ?? "No pudimos actualizar tu seguimiento.",
        ...(upgrade ? { redirect: "/#precios" } : {}),
      },
      { status: friendly ? 403 : 400 },
    );
  }

  revalidatePath("/explore");
  revalidatePath("/dashboard");
  return Response.json({ ok: true, following: true });
}
