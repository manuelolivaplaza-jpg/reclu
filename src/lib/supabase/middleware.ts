import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  normalizeReferralCode,
  referralsEnabled,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
} from "@/lib/referrals";

/**
 * Guarda `?ref=CÓDIGO` en una cookie httpOnly de 30 días para atribuir el alta
 * al patrocinador. Sólo con `REFERRALS_ENABLED=true` y códigos válidos: con el
 * flag apagado el flujo es invisible (ni cookie ni lectura posterior).
 */
function withReferralCookie(request: NextRequest, response: NextResponse): NextResponse {
  if (!referralsEnabled()) return response;

  const code = normalizeReferralCode(request.nextUrl.searchParams.get("ref"));
  if (!code) return response;

  response.cookies.set(REFERRAL_COOKIE, code, {
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

/**
 * Refreshes the Supabase auth session on every request and guards
 * /dashboard, /alerts, /settings, /compare y /admin (redirect a /login si no
 * hay usuario). El control de admin por email NO vive aquí: lo hace
 * requireAdmin() en cada página/layout de /admin (404 si no es admin).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

  const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  // getUser() validates the JWT and refreshes tokens.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // /portfolio/[slug] es PÚBLICO (con censura para anónimos, ver el componente
  // PaywallGate). Solo estas rutas requieren sesión real.
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/alerts") ||
    path.startsWith("/settings") ||
    path.startsWith("/compare") ||
    path.startsWith("/app/") ||
    path.startsWith("/admin");
  const isAuthPage = path === "/login" || path === "/signup";

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return withReferralCookie(request, NextResponse.redirect(url));
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return withReferralCookie(request, NextResponse.redirect(url));
  }

  return withReferralCookie(request, supabaseResponse);
}
