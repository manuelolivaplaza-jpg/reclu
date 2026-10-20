"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { canRefer, isValidReferralCode, referralsEnabled, REFERRAL_COOKIE } from "@/lib/referrals";
import type { FormState } from "@/lib/form-state";
import { firstZodMessage, isSafeNextPath, signInSchema, signUpSchema } from "@/lib/validation";

/**
 * Registra el vínculo referrer → invitado tras crear la cuenta.
 *
 * Sólo corre con `REFERRALS_ENABLED=true`. Resuelve el patrocinador por
 * `profiles.referral_code`, rechaza autorreferidos y es best-effort: cualquier
 * fallo (falta service role, código inexistente, fila duplicada) se loguea y
 * el signup sigue su curso con el mismo mensaje genérico de siempre.
 */
async function recordReferral(referredId: string, code: string): Promise<void> {
  if (!referralsEnabled() || !isValidReferralCode(code)) return;

  try {
    const supabase = getServiceClient();
    if (!supabase) return;

    const { data: referrer, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("referral_code", code.toUpperCase())
      .maybeSingle();
    if (error) {
      console.error("[signup] no se pudo resolver el código de referido:", error.message);
      return;
    }
    if (!referrer || !canRefer(referrer.id, referredId)) return;

    const { error: insertError } = await supabase
      .from("referrals")
      .insert({ referrer_id: referrer.id, referred_id: referredId });
    if (insertError && insertError.code !== "23505") {
      console.error("[signup] no se pudo registrar el referido:", insertError.message);
    }
  } catch (err) {
    console.error(
      "[signup] referidos:",
      err instanceof Error ? err.message : "error desconocido",
    );
  }
}

/**
 * Sign in with email + password.
 * On success redirects to `next` (default /dashboard).
 */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") == null ? undefined : String(formData.get("next")),
  });
  if (!parsed.success) return { error: firstZodMessage(parsed.error) };

  const { email, password } = parsed.data;
  const next = parsed.data.next && isSafeNextPath(parsed.data.next) ? parsed.data.next : "/dashboard";

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

/**
 * Sign up with email + password. Supabase sends a confirmation email.
 * Si existe la cookie de referido (ver `withReferralCookie` en el proxy),
 * se registra el vínculo en `referrals` con service role tras crear la cuenta.
 */
export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: formData.get("full_name") == null ? undefined : String(formData.get("full_name")),
  });
  if (!parsed.success) return { error: firstZodMessage(parsed.error) };

  const { email, password, full_name: fullName } = parsed.data;

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // F51-B: código de invitación capturado por el proxy (`?ref=CÓDIGO`).
  const cookieStore = await cookies();
  const referral = cookieStore.get(REFERRAL_COOKIE)?.value ?? null;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    // Sin enumeración de usuarios: el mensaje es genérico exista o no el
    // correo. El error real se loguea solo en el servidor, sin el email.
    console.error("[signup] fallo el registro:", error.status, error.message);
    return { error: "Si el correo es válido, te enviamos un enlace para continuar." };
  }

  // El referido se registra sólo si la cuenta se creó de verdad y el flag
  // está encendido. Un fallo aquí nunca cambia la respuesta del signup.
  if (data.user && referral) {
    await recordReferral(data.user.id, referral);
  }

  // If email confirmation is disabled in Supabase, the session exists already.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  return { success: "¡Cuenta creada! Revisa tu correo para confirmar tu cuenta." };
}

/**
 * Sign in with Google OAuth — redirects to Google, back to /auth/callback.
 */
export async function signInWithGoogle(): Promise<never> {
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.url) {
    redirect(data.url);
  }
  throw new Error("No se pudo iniciar sesión con Google.");
}
