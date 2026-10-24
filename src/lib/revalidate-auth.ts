import { timingSafeEqual } from "node:crypto";

/**
 * Valida `Authorization: Bearer <secreto>` contra REVALIDATE_SECRET (D36).
 * Sin la variable configurada nunca autoriza (fail closed). Comparación en
 * tiempo constante; el secreto no se registra ni se devuelve.
 */
export function isRevalidateAuthorized(header: string | null, secret = process.env.REVALIDATE_SECRET): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
