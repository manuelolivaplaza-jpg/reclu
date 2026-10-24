/**
 * ¿Se permite caer a datos de demostración cuando la base real está vacía?
 *
 * Nunca en producción: un portafolio real sin holdings debe verse vacío, no
 * con datos inventados. Fuera de producción se mantiene (staging recién
 * creado sin seed), salvo DEMO_FALLBACK=false.
 * Sin Supabase configurado (modo demo puro) esta regla no aplica.
 */
export function demoFallbackAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.DEMO_FALLBACK === "false") return false;
  return true;
}
