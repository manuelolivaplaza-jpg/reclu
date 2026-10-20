/**
 * Programa de referidos — lógica pura y flag de activación.
 *
 * Todo el flujo está APAGADO por defecto: sólo `REFERRALS_ENABLED=true`
 * (exacto, minúsculas) lo enciende. La persistencia vive en
 * `supabase/migrations/009_pagos_suscripciones.sql` (tablas `referral_codes`
 * y `referrals`, trigger `handle_referral_code`) y la RPC `reward_referral`
 * se define en la 039.
 *
 * Sin autorreferidos: el trigger de la 009 los ignora y `reward_referral`
 * vuelve a validarlo en la base. `canRefer()` replica la regla en TS.
 */

/** Nombre de la cookie que recuerda el código de invitación. */
export const REFERRAL_COOKIE = "reclu_ref";

/** Vigencia de la cookie de referido: 30 días. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Formato de la 009: `manuel-ab12` (3-6 alfanuméricos + 4 hex). */
const REFERRAL_CODE_RE = /^[a-z0-9]{3,6}-[a-f0-9]{4}$/;

/** True sólo con `REFERRALS_ENABLED=true`. Cualquier otro valor apaga el flujo. */
export function referralsEnabled(): boolean {
  return process.env.REFERRALS_ENABLED === "true";
}

/**
 * Normaliza un código de referido al formato de la 009: `trim` y minúsculas.
 * Devuelve null si no es string o no cumple `^[a-z0-9]{3,6}-[a-f0-9]{4}$`.
 */
export function normalizeReferralCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const normalized = code.trim().toLowerCase();
  return REFERRAL_CODE_RE.test(normalized) ? normalized : null;
}

/** Valida un código de referido; acepta mayúsculas y espacios exteriores. */
export function isValidReferralCode(code: unknown): code is string {
  return normalizeReferralCode(code) !== null;
}

/**
 * True si `referrerId` puede invitar a `referredId`.
 * Rechaza ids vacíos y el autorreferido (mismo usuario).
 */
export function canRefer(
  referrerId?: string | null,
  referredId?: string | null,
): boolean {
  if (!referrerId || !referredId) return false;
  return referrerId !== referredId;
}
