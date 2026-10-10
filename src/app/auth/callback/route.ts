import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback route — Supabase redirects here after Google sign-in
 * (or email confirmation) with a `code` query param. We exchange it for
 * a session and redirect to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/dashboard"}`);
    }
  }

  // No code or exchange failed — send to login with an error flag.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
