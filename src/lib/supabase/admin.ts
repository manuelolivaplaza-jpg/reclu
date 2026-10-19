import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con rol de servicio — SOLO servidor.
 *
 * Se usa exclusivamente para agregados internos del servidor (radar de
 * consenso, filtros por símbolo, comparador) que necesitan leer holdings
 * completos sin pasar por el muro de pago de la migración 012. El resultado
 * de estas consultas nunca se expone crudo al navegador: siempre son
 * agregados (conteos, coincidencias).
 *
 * Devuelve null si falta SUPABASE_SERVICE_ROLE_KEY o la URL es un
 * placeholder — el caller cae al cliente anon (que con la migración 012
 * aplicada devuelve vacío y el sitio se degrada sin romperse).
 *
 * NUNCA importar este archivo desde un componente de cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.startsWith("https://") || url.includes("placeholder") || !key) {
    return null;
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
