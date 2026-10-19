/**
 * Límites del asistente de chat — lógica pura (testeable).
 *
 * El servidor toma TODAS las decisiones de cupo aquí descritas; el cliente
 * solo recibe el resultado. La base aplica lo mismo vía `check_chat_quota`
 * (migración 006) y `check_anon_chat_quota` (migración 007).
 */

import { createHash } from "node:crypto";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/** Free: 5 preguntas por día rodante. */
export const FREE_DAILY_CHAT_LIMIT = 5;
/** Pro: 50 preguntas por semana rodante (coincide con `chat_quota_limit` en DB). */
export const PRO_WEEKLY_CHAT_LIMIT = 50;
/** Elite: tope anti-abuso por semana. En la práctica ilimitado; configurable en DB. */
export const ELITE_WEEKLY_CHAT_LIMIT = 500;
/** Anónimos (sin cuenta): 2 preguntas por día, por IP. */
export const ANON_DAILY_CHAT_LIMIT = 2;

/** Límite de entrada para el chat (validación con zod en /api/chat). */
export const CHAT_MAX_MESSAGE_LENGTH = 2000;
/** Máximo de mensajes del historial que acepta el servidor. */
export const CHAT_MAX_HISTORY = 30;

export type ChatPlan = "free" | "pro" | "elite";

/** Normaliza cualquier string de plan a un ChatPlan válido (fallback: free). */
export function normalizeChatPlan(plan?: string | null): ChatPlan {
  return plan === "pro" || plan === "elite" ? plan : "free";
}

/** Límite de preguntas según plan (la DB aplica el mismo criterio). */
export function planChatLimit(plan: ChatPlan): number {
  if (plan === "elite") return ELITE_WEEKLY_CHAT_LIMIT;
  if (plan === "pro") return PRO_WEEKLY_CHAT_LIMIT;
  return FREE_DAILY_CHAT_LIMIT;
}

/** Ventana de renovación: free diaria, pro/elite semanal. */
export function planChatWindowMs(plan: ChatPlan): number {
  return plan === "free" ? DAY_MS : WEEK_MS;
}

export interface QuotaState {
  plan: string | null;
  /** Preguntas usadas en la ventana actual. */
  used: number;
  /** Momento (ms o ISO) del último reset del contador. */
  resetAt: number | string | null;
  /** Ahora, en ms (inyectable para tests). */
  now?: number;
}

export interface QuotaDecision {
  plan: ChatPlan;
  allowed: boolean;
  /** true si el contador estaba vencido y debe renovarse (used → 0). */
  stale: boolean;
  remaining: number;
  limit: number;
  /** Próximo reset del contador, en ms (para el mensaje 429). */
  nextResetAt: number;
}

/**
 * Decisión de cupo por plan, sin efectos secundarios.
 * Si `resetAt` es más viejo que la ventana del plan, el contador está vencido
 * y la decisión se calcula con used = 0.
 */
export function chatQuotaDecision(state: QuotaState): QuotaDecision {
  const plan = normalizeChatPlan(state.plan);
  const limit = planChatLimit(plan);
  const windowMs = planChatWindowMs(plan);
  const now = state.now ?? Date.now();

  const resetAt =
    typeof state.resetAt === "number"
      ? state.resetAt
      : state.resetAt
        ? Date.parse(state.resetAt)
        : Number.NaN;
  const stale = Number.isNaN(resetAt) || resetAt < now - windowMs;

  const used = stale ? 0 : Math.max(0, Math.floor(state.used));
  const remaining = Math.max(0, limit - used);

  return {
    plan,
    allowed: used < limit,
    stale,
    remaining,
    limit,
    // Si estaba vencido, la ventana nueva arranca "ahora".
    nextResetAt: stale ? now + windowMs : resetAt + windowMs,
  };
}

/**
 * Hash SHA-256 de la IP + sal opcional (env CHAT_RATE_SALT).
 * Se trunca a 40 hex: suficiente para agrupar por IP, sin guardar la IP cruda.
 */
export function hashIp(ip: string, salt?: string): string {
  return createHash("sha256")
    .update(`${salt ?? ""}:${ip}`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * Extrae la IP del cliente desde los headers del request.
 * En Vercel la IP real viene en `x-forwarded-for` (primer valor).
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/** Texto humano para cuánto falta hasta un reset, en español de Chile. */
export function formatTimeUntilReset(targetMs: number, now: number): string {
  const diff = targetMs - now;
  if (diff <= 0) return "ahora";
  const minutes = Math.ceil(diff / (60 * 1000));
  if (minutes <= 1) return "menos de un minuto";
  if (minutes < 60) return `en ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes > 0 ? `en ${hours} h y ${restMinutes} min` : `en ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `en ${days} días y ${restHours} h` : `en ${days} días`;
}
