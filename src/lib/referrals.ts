/**
 * Programa de referidos — lógica pura y flag de activación.
 *
 * Todo el flujo está APAGADO por defecto: sólo `REFERRALS_ENABLED=true`
 * (exacto, minúsculas) lo enciende. La persistencia vive en
 * `supabase/migrations/039_referidos.sql` (tabla `referrals`,
 * `profiles.referral_code` y la RPC `reward_referral`).
 *
 * Sin autorreferidos: `canRefer()` rechaza que un usuario se invite a sí
 * mismo y la RPC vuelve a validarlo en la base.
 */

/** Nombre de la cookie que recuerda el código de invitación. */
export const REFERRAL_COOKIE = "reclu_ref";

/** Vigencia de la cookie de referido: 30 días. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Códigos válidos: 6-16 caracteres alfanuméricos, sin espacios ni guiones. */
const REFERRAL_CODE_RE = /^[A-Za-z0-9]{6,16}$/;

/** True sólo con `REFERRALS_ENABLED=true`. Cualquier otro valor apaga el flujo. */
export function referralsEnabled(): boolean {
  return process.env.REFERRALS_ENABLED === "true";
}

/** Valida un código de referido con la regex estricta de 6-16 [A-Za-z0-9]. */
export function isValidReferralCode(code: unknown): code is string {
  return typeof code === "string" && REFERRAL_CODE_RE.test(code);
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
