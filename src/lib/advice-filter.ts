/**
 * advice-filter.ts — filtro de salida "no recomendación" (F69).
 *
 * La IA de reclu.cl describe información pública; no puede recomendar
 * comprar, vender ni mantener instrumentos (Ley Fintec 21.521). Este módulo
 * detecta lenguaje de recomendación en español e inglés y reemplaza la
 * respuesta completa por un texto neutro con descargo.
 *
 * Reutiliza `containsAdviceImperative` y `normalizeAdviceText` de
 * `community.ts` para no duplicar reglas ni romper sus tests.
 */
import { containsAdviceImperative, normalizeAdviceText } from "@/lib/community";

/** Descargo fijo que acompaña a cualquier respuesta saneada. */
export const AI_DISCLAIMER =
  "Información general generada por IA a partir de noticias públicas. No es una recomendación de inversión ni asesoría personalizada. Puede contener errores. Decide por tu cuenta o consulta a un asesor registrado en la CMF.";

/** Texto neutro que reemplaza una respuesta con recomendaciones. */
export const NEUTRAL_ADVICE_REPLACEMENT =
  "No puedo entregar recomendaciones de compra, venta o mantención de instrumentos. Puedo describir la información pública disponible, sus fuentes y los riesgos para que decidas por tu cuenta.";

/**
 * Formas verbales de recomendación. Se comparan por palabra completa sobre el
 * texto normalizado (minúsculas, sin tildes y sin puntuación), así que
 * "compraventa", "comprador", "mantenimiento", "buyer" o "holding" no calzan.
 */
const ADVICE_TOKENS = new Set([
  // Español: comprar
  "compra",
  "compras",
  "compre",
  "compren",
  "compres",
  "comprar",
  "compralo",
  "comprala",
  // Español: vender
  "vende",
  "vendas",
  "venda",
  "vendan",
  "vendes",
  "vender",
  "vendelo",
  "vendela",
  // Español: mantener
  "manten",
  "mantenga",
  "mantengan",
  "mantengas",
  "mantener",
  // Español: recomendación
  "deberia",
  "deberias",
  "recomiendo",
  "recomienda",
  "recomendamos",
  "recomiendan",
  // Inglés
  "buy",
  "sell",
  "hold",
]);

/** Frases de recomendación multi-palabra (se buscan con espacios alrededor). */
const ADVICE_PHRASES = [
  "te recomiendo",
  "les recomiendo",
  "le recomiendo",
  "you should",
  "i recommend",
  "we recommend",
  "i suggest",
  "we suggest",
  "should buy",
  "should sell",
  "should hold",
  "would buy",
  "would sell",
  "recommend buying",
  "recommend selling",
] as const;

/**
 * true si el texto contiene una recomendación de inversión.
 * Se exige límite de palabra: "compraventa" y "comprador" quedan fuera.
 */
export function containsAdvice(text: string): boolean {
  if (!text || !text.trim()) return false;

  // Frases ya cubiertas por la comunidad (imperativos y "no compres", etc.).
  if (containsAdviceImperative(text)) return true;

  const normalized = normalizeAdviceText(text);
  if (!normalized) return false;

  const padded = ` ${normalized} `;
  if (ADVICE_PHRASES.some((phrase) => padded.includes(` ${phrase} `))) return true;

  return normalized.split(" ").some((token) => ADVICE_TOKENS.has(token));
}

/**
 * Si hay recomendación, devuelve un texto neutro + el descargo. Si no, deja
 * el texto intacto. Idempotente: un texto que ya trae el descargo no se
 * vuelve a reemplazar.
 */
export function sanitizeAdvice(text: string): string {
  const clean = text.trim();
  if (!clean) return clean;
  if (clean.includes(AI_DISCLAIMER)) return clean;
  if (!containsAdvice(clean)) return clean;
  return `${NEUTRAL_ADVICE_REPLACEMENT}\n\n${AI_DISCLAIMER}`;
}
