/**
 * Runtime environment validation.
 *
 * Import `requireEnv()` (server-only) or `requirePublicEnv()` anywhere an env
 * var is required. Fails fast with a clear message instead of a cryptic
 * Supabase/auth error deep in the call stack.
 */

const REQUIRED_PUBLIC = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

const REQUIRED_SERVER = ["SUPABASE_SERVICE_ROLE_KEY"] as const;

function formatMissing(missing: string[], context: string): string {
  return (
    `[reclu.cl] Missing required environment variable(s): ${missing.join(", ")}. ` +
    `Required for: ${context}. ` +
    `Copy .env.example to .env.local and fill in the values (see README.md).`
  );
}

/**
 * Validate public (NEXT_PUBLIC_*) env vars. Safe to call on client & server.
 * Throws with an actionable message if any are missing.
 */
export function requirePublicEnv(): void {
  if (typeof window === "undefined") return; // server validates below
  const missing = REQUIRED_PUBLIC.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(formatMissing(missing, "client-side Supabase connection"));
  }
}

/**
 * Validate server-only env vars (service role, API keys).
 * Call at the top of API routes, server actions, or edge functions.
 */
export function requireServerEnv(extra?: readonly string[]): void {
  const all = [...REQUIRED_SERVER, ...(extra ?? [])];
  const missing = all.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(formatMissing(missing, "server-side operations"));
  }
}

/** True when Supabase env vars are configured (for graceful UI fallbacks). */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
