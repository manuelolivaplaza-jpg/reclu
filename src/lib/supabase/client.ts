import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components (browser).
 * Uses the public anon key — safe for the client.
 *
 * Falls back to placeholder values so the client can be constructed even
 * before env vars are set; queries then fail gracefully at call time
 * (see lib/queries.ts) instead of crashing module load.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";
  return createBrowserClient(url, key);
}
