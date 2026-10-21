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
import { AI_DISCLAIMER } from "@/lib/ai-disclaimer";
import { containsAdviceImperative, normalizeAdviceText } from "@/lib/community";

/**
 * Descargo fijo que acompaña a cualquier respuesta saneada (texto §2.2 del
 * informe legal). Se reexporta aquí porque las rutas ya lo importaban desde
 * este módulo; la fuente única vive en `ai-disclaimer.ts`.
 */
export { AI_DISCLAIMER };

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
 * Devuelve la regla que saltó (para logs y tests) o `null` si el texto no
 * contiene recomendaciones. No incluye el texto analizado, así que es seguro
 * registrarlo: solo expone qué patrón calzó.
 *
 * Se exige límite de palabra: "compraventa" y "comprador" quedan fuera.
 */
export function adviceRule(text: string): string | null {
  if (!text || !text.trim()) return null;

  // Frases ya cubiertas por la comunidad (imperativos y "no compres", etc.).
  if (containsAdviceImperative(text)) return "imperative";

  const normalized = normalizeAdviceText(text);
  if (!normalized) return null;

  const padded = ` ${normalized} `;
  const phrase = ADVICE_PHRASES.find((candidate) => padded.includes(` ${candidate} `));
  if (phrase) return `phrase:${phrase}`;

  const token = normalized.split(" ").find((candidate) => ADVICE_TOKENS.has(candidate));
  return token ? `token:${token}` : null;
}

/**
 * true si el texto contiene una recomendación de inversión.
 * Se exige límite de palabra: "compraventa" y "comprador" quedan fuera.
 */
export function containsAdvice(text: string): boolean {
  return adviceRule(text) !== null;
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
