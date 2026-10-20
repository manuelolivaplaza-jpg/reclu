/**
 * POST /api/newsletter/subscribe — alta con doble opt-in.
 *
 * Solo guarda el correo en `newsletter_subscribers` (status `pending`) y
 * envía el enlace de confirmación si Resend está configurado. No suscribe a
 * la persona hasta que abra ese enlace.
 *
 * Privacidad (Leyes 19.628 y 21.719): se pide consentimiento explícito para
 * recibir el newsletter semanal, se guarda el texto aceptado y no se recoge
 * ningún otro dato. La respuesta es siempre la misma para no revelar si un
 * correo ya estaba en la lista.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase-admin";
import { firstZodMessage, emailSchema } from "@/lib/validation";

/** Texto que se guarda junto al consentimiento. Debe coincidir con la UI. */
export const NEWSLETTER_CONSENT_TEXT =
  "Acepto recibir el newsletter semanal de reclu.cl en este correo. " +
  "Se usa solo para enviarme ese resumen y puedo darme de baja en cualquier momento.";

export const newsletterSubscribeSchema = z.object({
  email: emailSchema,
  consent: z.literal(true, {
    message: "Debes aceptar el consentimiento para suscribirte.",
  }),
  source: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9_-]*$/i, "Origen inválido.")
    .optional()
    .default("footer"),
});

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = configured && configured.startsWith("http") ? configured : "https://reclu.cl";
  return base.replace(/\/+$/, "");
}

function confirmUrl(token: string): string {
  return `${siteUrl()}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

/**
 * Correo de confirmación por la API HTTP de Resend. Se salta en desarrollo o
 * en tests si falta la clave. No registra direcciones en errores.
 */
async function sendConfirmationEmail(email: string, token: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NEWSLETTER_FROM?.trim() || process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return false;

  const link = confirmUrl(token);
  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:'Instrument Sans',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 24px;padding-bottom:16px;border-bottom:1px solid #e6e6e6;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">reclu.cl</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Confirma que quieres recibir el newsletter semanal de reclu.cl.</p>
    <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#0a0a0a;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-size:14px;">Confirmar suscripción</a></p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6b6b6b;">Si no pediste esta suscripción, ignora este correo: no recibirás nada más.</p>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e6e6e6;font-size:11px;line-height:1.6;color:#6b6b6b;">Información pública con fines informativos. No constituye asesoría de inversión.</p>
  </div>
</body>
</html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: "Confirma tu suscripción al newsletter de reclu.cl",
        html,
      }),
    });
    return response.ok;
  } catch {
    // Sin correo de confirmación la suscripción queda pendiente; no se filtra
    // la dirección en el log.
    return false;
  }
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = newsletterSubscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: firstZodMessage(parsed.error) },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "La suscripción no está disponible en este momento." },
      { status: 503 },
    );
  }

  const { email, source } = parsed.data;
  const normalized = email.toLowerCase();

  const { error } = await supabase.rpc("newsletter_subscribe", {
    p_email: normalized,
    p_consent_text: NEWSLETTER_CONSENT_TEXT,
    p_source: source,
  });

  if (error) {
    if ((error.message ?? "").toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { ok: false, error: "Demasiadas suscripciones en este momento. Intenta más tarde." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "No pudimos registrar tu suscripción." },
      { status: 500 },
    );
  }

  // Solo los pendientes necesitan el correo de confirmación.
  const { data } = await supabase
    .from("newsletter_subscribers")
    .select("confirm_token, status")
    .eq("email", normalized)
    .maybeSingle();

  if (data?.status === "pending" && typeof data.confirm_token === "string") {
    await sendConfirmationEmail(normalized, data.confirm_token);
  }

  return NextResponse.json({
    ok: true,
    message: "Revisa tu correo para confirmar la suscripción.",
  });
}
