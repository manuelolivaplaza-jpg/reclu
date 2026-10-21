/**
 * Esquemas de entrada del servidor. El cliente no es fuente de verdad:
 * slugs, uuids, enums y largos se rechazan aquí antes de tocar la base.
 */
import { z } from "zod";
import { CHAT_MAX_HISTORY, CHAT_MAX_MESSAGE_LENGTH } from "@/lib/chat-limits";

/** Slug público: minúsculas, dígitos y guiones, 1–80. */
export const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

export const slugSchema = z.string().regex(SLUG_PATTERN, "Slug inválido.");

export const uuidSchema = z.string().uuid("Identificador inválido.");

export const emailSchema = z
  .string()
  .trim()
  .max(320)
  .email("Correo inválido.");

/** Ruta interna post-login. Rechaza open redirects (`//`, esquemas, backslash). */
export const nextPathSchema = z
  .string()
  .max(200)
  .refine(isSafeNextPath, "Ruta inválida.");

export function isSafeNextPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  if (value.includes("://")) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return false;
    if (decoded.includes("\\") || decoded.includes("://")) return false;
  } catch {
    return false;
  }
  return true;
}

export const alertFrequencySchema = z.enum(["realtime", "daily", "weekly"]);

/** Canales previstos (email hoy, telegram en la 007). La columna puede no existir aún. */
export const alertChannelSchema = z.enum(["email", "telegram"]);

export const settingsSchema = z.object({
  full_name: z.string().trim().max(100).optional(),
  alert_frequency: alertFrequencySchema.optional(),
  alert_channel: alertChannelSchema.optional(),
  weekly_digest: z.boolean().optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresa tu contraseña.").max(128),
  next: z.string().max(200).optional(),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
  full_name: z.string().trim().max(100).optional().default(""),
});

/**
 * Posición de la cartera del usuario (F60). Se acepta `weight` (peso 0–100)
 * o, desde la 050, cantidad y costo promedio. Si no viene `weight`, el peso
 * queda expresado como valor de costo (cantidad × costo) y `saveUserHoldings`
 * lo normaliza a 100 junto con el resto de la cartera.
 */
export const userHoldingSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9.\-]+$/, "Símbolo inválido."),
    name: z.string().trim().max(100).optional().default(""),
    weight: z.number().finite().min(0).max(100).optional(),
    quantity: z.number().finite().min(0).optional(),
    avg_cost: z.number().finite().min(0).optional(),
    currency: z.enum(["USD", "CLP"]).optional().default("USD"),
    market: z.enum(["US", "CL"]).optional(),
    broker: z.string().trim().max(60, "La corredora no puede superar 60 caracteres.").optional(),
  })
  .refine(
    (holding) =>
      holding.weight !== undefined ||
      (holding.quantity !== undefined && holding.avg_cost !== undefined),
    {
      message: "Indica una ponderación o cantidad y costo promedio.",
      path: ["weight"],
    },
  )
  .transform((holding) => ({
    ...holding,
    weight:
      holding.weight ??
      (holding.quantity as number) * (holding.avg_cost as number),
  }));

export const userHoldingsSchema = z.array(userHoldingSchema).max(100);

export const followBodySchema = z.object({
  portfolioId: uuidSchema,
});

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(CHAT_MAX_MESSAGE_LENGTH),
});

export const chatRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(CHAT_MAX_HISTORY),
    slug: slugSchema.optional(),
  })
  .refine((data) => data.messages.at(-1)?.role === "user", {
    message: "El último mensaje debe ser del usuario.",
    path: ["messages"],
  });

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos.";
}

/** Traduce el raise del trigger `enforce_follow_limits` (migración 007). */
export function friendlyFollowDbError(message: string): string | null {
  const text = message.toLowerCase();
  if (text.includes("límite") || text.includes("limite")) {
    return "Alcanzaste el límite de portafolios de tu plan.";
  }
  if (text.includes("plan de pago")) {
    return "Este portafolio requiere un plan de pago (Pro o Elite).";
  }
  if (text.includes("propia cuenta")) {
    return "Solo puedes seguir portafolios con tu propia cuenta.";
  }
  return null;
}
