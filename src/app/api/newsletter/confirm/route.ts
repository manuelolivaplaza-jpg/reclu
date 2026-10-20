/**
 * GET /api/newsletter/confirm?token=… — segundo paso del doble opt-in.
 *
 * El token es de un solo uso por suscripción (se regenera si la persona vuelve
 * a inscribirse). Confirmar abre la suscripción; no envía nada más.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase-admin";

const tokenSchema = z.string().uuid("Enlace inválido.");

function done(request: Request, ok: boolean) {
  const dest = ok ? "/?newsletter=confirmado" : "/?newsletter=invalido";
  return NextResponse.redirect(new URL(dest, request.url), 303);
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return done(request, false);

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "La confirmación no está disponible en este momento." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc("newsletter_confirm", {
    p_token: parsed.data,
  });

  return done(request, !error && data === true);
}
