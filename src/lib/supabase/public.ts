import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente anon SIN cookies (D36), solo para lecturas públicas cacheadas con
 * "use cache": no puede depender de la sesión del usuario. Respeta RLS como
 * cualquier visitante anónimo. NUNCA usar para datos por usuario.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
