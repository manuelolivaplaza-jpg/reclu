"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form-state";
import { firstZodMessage, isSafeNextPath, signInSchema, signUpSchema } from "@/lib/validation";

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
 * Si existe la cookie de referido (?ref=CÓDIGO guardada en el proxy),
 * se envía como metadata para que el trigger de la base registre el
 * vínculo (migración 009).
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

  // M3 Referidos: la cookie `ref` la guarda el proxy (ver proxy matcher)
  // cuando el usuario llegó con ?ref=CODIGO. La pasamos como metadata.
  const cookieStore = await cookies();
  const referral = cookieStore.get("ref")?.value ?? null;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        ...(referral ? { referred_by: referral } : {}),
      },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
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
