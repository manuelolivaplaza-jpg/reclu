import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** GET muestra la confirmación. No da de baja: los lectores de correo prefetchean enlaces. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const dest = isUuid(token) ? `/baja?token=${encodeURIComponent(token)}` : "/baja";
  return NextResponse.redirect(new URL(dest, request.url));
}

/**
 * POST da de baja con unsubscribe_by_token.
 * Un clic del cliente de correo (List-Unsubscribe-Post) responde 200.
 * El formulario de /baja manda confirm=1 y vuelve a la página.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token");
  let confirm = false;
  const type = request.headers.get("content-type") ?? "";

  if (type.includes("form") || type.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData().catch(() => null);
    const fromForm = form?.get("token")?.toString();
    if (!token && fromForm) token = fromForm;
    confirm = form?.get("confirm")?.toString() === "1";
  }

  if (!isUuid(token)) {
    return NextResponse.json({ ok: false, error: "Enlace inválido." }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "La baja no está disponible en este momento." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc("unsubscribe_by_token", { p_token: token });
  if (error || data !== true) {
    return NextResponse.json(
      { ok: false, error: "No encontramos ese enlace de baja." },
      { status: 400 },
    );
  }

  if (confirm) {
    return NextResponse.redirect(new URL("/baja?ok=1", request.url), 303);
  }
  return NextResponse.json({ ok: true });
}
