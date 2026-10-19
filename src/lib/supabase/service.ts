/**
 * Supabase admin client — SOLO SERVIDOR (route handlers / server actions).
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY: se salta RLS. Nunca importar desde un
 * componente de cliente ni exponer esta key al navegador.
 *
 * Sin la key configurada devuelve `null` (no construye un cliente con un
 * placeholder peligroso); cada caller decide su fallback.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function getServiceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return cached;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
