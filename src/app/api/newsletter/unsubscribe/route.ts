/**
 * Baja del newsletter.
 *
 * GET muestra una página mínima con un botón: los lectores de correo
 * prefetchean enlaces y no deben dar de baja a nadie por accidente.
 * POST ejecuta la baja; acepta el formulario de esa página y también el
 * `List-Unsubscribe-Post` de un clic (responde 200 sin cuerpo).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase-admin";

const tokenSchema = z.string().uuid("Enlace inválido.");

function page(token: string, message: string, withForm: boolean): string {
  const form = withForm
    ? `<form method="POST" action="/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}">
        <input type="hidden" name="confirm" value="1" />
        <button type="submit" style="background:#0a0a0a;color:#ffffff;border:0;border-radius:999px;padding:12px 22px;font-size:14px;cursor:pointer;">Confirmar baja</button>
      </form>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Newsletter — fraccion.si</title>
  <meta name="robots" content="noindex" />
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:'Instrument Sans',Helvetica,Arial,sans-serif;">
  <main style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <p style="margin:0 0 32px;padding-bottom:16px;border-bottom:1px solid #e6e6e6;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">fraccion.si</p>
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:500;letter-spacing:-.03em;">Newsletter semanal</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d3d3d;">${message}</p>
    ${form}
    <p style="margin:40px 0 0;padding-top:16px;border-top:1px solid #e6e6e6;font-size:12px;line-height:1.6;color:#6b6b6b;">Información pública con fines informativos. No constituye asesoría de inversión.</p>
  </main>
</body>
</html>`;
}

function html(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokenSchema.safeParse(token).success) {
    return html(page("", "El enlace no es válido. Usa el enlace del último correo.", false), 400);
  }

  return html(
    page(
      token,
      "Si confirmas, dejarás de recibir el newsletter semanal. Tu cuenta de fraccion.si no se modifica.",
      true,
    ),
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  const type = request.headers.get("content-type") ?? "";

  if (type.includes("form")) {
    const form = await request.formData().catch(() => null);
    if (!token && form) token = form.get("token")?.toString() ?? "";
  } else {
    // List-Unsubscribe-Post puede venir sin query si el token va en el cuerpo.
    const body = await request.json().catch(() => null);
    if (!token && body && typeof body.token === "string") token = body.token;
  }

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enlace inválido." }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "La baja no está disponible en este momento." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc("newsletter_unsubscribe", {
    p_token: parsed.data,
  });

  if (error || data !== true) {
    return NextResponse.json(
      { ok: false, error: "No encontramos ese enlace de baja." },
      { status: 400 },
    );
  }

  if (type.includes("form")) {
    return html(page("", "Listo. No volverás a recibir el newsletter semanal.", false));
  }
  return NextResponse.json({ ok: true });
}
