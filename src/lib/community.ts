/**
 * community.ts — Comunidad de creadores (F49-A).
 *
 * Todo el módulo está apagado por defecto: `communityEnabled()` solo
 * devuelve true si COMMUNITY_ENABLED es exactamente "true". Mismo criterio
 * que src/lib/publish/flags.ts (falla cerrado).
 *
 * Además de los esquemas de entrada, aquí vive la detección de lenguaje
 * imperativo de inversión ("compra ya", "vendan ahora"...). La comunidad es
 * informativa: no se publican recomendaciones ni instrucciones de compra o
 * venta. Antes de encender el flag hace falta revisión legal (Ley Fintec
 * 21.521); ver NOTAS-F49A.md.
 */
import { z } from "zod";
import { userHoldingSchema } from "@/lib/validation";

/** Única variable que enciende la comunidad. */
export const COMMUNITY_FLAG = "COMMUNITY_ENABLED";

export function communityEnabled(): boolean {
  return process.env[COMMUNITY_FLAG] === "true";
}

/** Alias público: minúsculas, 3–30, empieza por letra o dígito. */
export const CREATOR_ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;
export const CREATOR_ALIAS_MIN = 3;
export const CREATOR_ALIAS_MAX = 30;
export const CREATOR_BIO_MAX = 600;
export const CREATOR_CONFLICT_MAX = 1000;
export const CREATOR_PORTFOLIO_TITLE_MIN = 3;
export const CREATOR_PORTFOLIO_TITLE_MAX = 120;
export const CREATOR_PORTFOLIO_DESCRIPTION_MAX = 2000;
export const CREATOR_PORTFOLIO_HOLDINGS_MAX = 100;

export const creatorAliasSchema = z
  .string()
  .trim()
  .min(CREATOR_ALIAS_MIN, "El alias debe tener al menos 3 caracteres.")
  .max(CREATOR_ALIAS_MAX, "El alias no puede superar 30 caracteres.")
  .regex(
    CREATOR_ALIAS_PATTERN,
    "El alias solo admite minúsculas, números, guion y guion bajo.",
  );

export const creatorBioSchema = z
  .string()
  .trim()
  .max(CREATOR_BIO_MAX, "La bio no puede superar 600 caracteres.");

export const creatorProfileSchema = z.object({
  alias: creatorAliasSchema,
  bio: creatorBioSchema.optional().default(""),
  conflicto_interes: z
    .string()
    .trim()
    .max(CREATOR_CONFLICT_MAX, "El conflicto de interés es demasiado largo.")
    .optional()
    .default(""),
  declara_no_asesoria: z.boolean().default(false),
});

export const creatorPortfolioSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(
      CREATOR_PORTFOLIO_TITLE_MIN,
      "El título debe tener al menos 3 caracteres.",
    )
    .max(
      CREATOR_PORTFOLIO_TITLE_MAX,
      "El título no puede superar 120 caracteres.",
    ),
  descripcion: z
    .string()
    .trim()
    .max(
      CREATOR_PORTFOLIO_DESCRIPTION_MAX,
      "La descripción no puede superar 2000 caracteres.",
    )
    .optional()
    .default(""),
  holdings: z
    .array(userHoldingSchema)
    .min(1, "Agrega al menos una posición.")
    .max(CREATOR_PORTFOLIO_HOLDINGS_MAX, "Máximo 100 posiciones."),
});

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;
export type CreatorPortfolioInput = z.infer<typeof creatorPortfolioSchema>;

/**
 * Frases imperativas prohibidas. Se comparan sobre texto normalizado
 * (minúsculas, sin tildes y con la puntuación convertida en espacios).
 * Frases multi-palabra para no marcar usos neutros de "compra"/"venta".
 */
export const ADVICE_PHRASES = [
  "compra ya",
  "compre ya",
  "compren ya",
  "compra ahora",
  "compre ahora",
  "compren ahora",
  "vende ya",
  "venda ya",
  "vendan ya",
  "vende ahora",
  "venda ahora",
  "vendan ahora",
  "compren",
  "vendan",
  "compra esto",
  "vende esto",
  "te recomiendo comprar",
  "te recomiendo vender",
  "les recomiendo comprar",
  "les recomiendo vender",
  "recomiendo comprar",
  "recomiendo vender",
  "recomendamos comprar",
  "recomendamos vender",
  "hay que comprar",
  "hay que vender",
  "es momento de comprar",
  "es momento de vender",
  "es hora de comprar",
  "es hora de vender",
  "compra fuerte",
  "vende fuerte",
  "no compres",
  "no vendas",
] as const;

/**
 * Normaliza para comparar: NFKD, sin diacríticos, minúsculas, puntuación
 * como espacio y espacios colapsados. "Compra, ¡ya!" -> "compra ya".
 */
export function normalizeAdviceText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * true si el texto contiene una instrucción de inversión.
 * Se compara con espacios alrededor para respetar límites de palabra:
 * "comprenden" no contiene la frase "compren".
 */
export function containsAdviceImperative(text: string): boolean {
  const normalized = normalizeAdviceText(text);
  if (!normalized) return false;
  const padded = ` ${normalized} `;
  return ADVICE_PHRASES.some((phrase) => padded.includes(` ${phrase} `));
}
