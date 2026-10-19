/**
 * Cliente Supabase con service role — SOLO servidor (API routes).
 * Bypassa RLS; nunca importar desde componentes con "use client".
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Cliente con SUPABASE_SERVICE_ROLE_KEY para escribir suscripciones,
 * payment_events y actualizar profiles.plan tras verificar un pago.
 * Lanza con mensaje claro si faltan las variables.
 */
export function getBillingServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[billing] Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY — " +
        "no se puede operar la suscripción en la base de datos.",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
