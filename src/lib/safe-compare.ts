/**
 * Comparación de strings en tiempo constante (evita timing attacks
 * sobre secretos en headers). El bucle recorre siempre maxLen y mezcla
 * la diferencia de longitudes en `diff` sin abortar temprano; el
 * resultado final exige igual largo.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = 0;
  for (let i = 0; i < maxLen; i++) {
    const ai = i < aBytes.length ? aBytes[i] : 0;
    const bi = i < bBytes.length ? bBytes[i] : 0;
    diff |= ai ^ bi;
  }
  return diff === 0 && aBytes.length === bBytes.length;
}
