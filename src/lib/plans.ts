/**
 * planes reclu — Fuente única de verdad para precios, límites y permisos por plan.
 *
 * Toda la web (pricing, checkout, ajustes), la base (migración 008) y los
 * correos (edge function send-alerts) deben salir de aquí. Si cambias un
 * número, cambia también `supabase/migrations/008_planes_alertas.sql` y la
 * copia mínima de `supabase/functions/send-alerts/index.ts` (Deno no puede
 * importar desde `src/`).
 *
 * Copiado de `src/lib/types.ts` sin romperlo:
 *   isPaidPlan / isElitePlan / FREE_PLAN_FOLLOW_LIMIT / PRO_PLAN_FOLLOW_LIMIT
 */

import type { Plan } from "@/lib/types";
import { isPaidPlan } from "@/lib/types";

export { isPaidPlan } from "@/lib/types";

// ---- Tipos ----

export type AlertFrequencyValue = "realtime" | "daily" | "weekly";
export type AlertChannelValue = "email" | "telegram" | "both";
export type ChatQuotaWindow = "day" | "week" | "unlimited";

export interface ChatQuota {
  /** Número de consultas. Infinity = ilimitado. */
  limit: number;
  /** Ventana de renovación del cupo. */
  window: ChatQuotaWindow;
}

/** Origen permitido para cargar posiciones en Mi portafolio. */
export type PortfolioImportSource = "manual" | "csv" | "cartola" | "cartola_multi";
/** Profundidad del feed de noticias que tocan la cartera. */
export type NewsDepth = "direct" | "direct_sector" | "all";
/** Relación entre una noticia y un ticker. */
export type NewsRelation = "direct" | "sector" | "supplier" | "competitor" | "macro";
/** Alertas automáticas de Mi portafolio. */
export type AutoAlertsMode = "none" | "daily_digest" | "realtime";

/** Límites efectivos de Mi portafolio (la prueba vigente usa los de Pro). */
export interface PortfolioLimits {
  /** Plan efectivo después de aplicar la prueba. */
  plan: Plan;
  maxPositions: number;
  importSources: PortfolioImportSource[];
  newsDepth: NewsDepth;
  newsDelayHours: number;
  newsRelations: NewsRelation[];
  autoAlerts: AutoAlertsMode;
  autoAlertsMaxPerDay: number;
  exportCsv: boolean;
}

export interface PlanConfig {
  id: Plan;
  /** Nombre visible: "Gratis" | "Pro" | "Elite". */
  name: string;
  /** Subtítulo corto para tarjetas. */
  tagline: string;
  /** Precio mensual en CLP. 0 = gratis. */
  monthlyPrice: number;
  /** Precio mensual equivalente del ciclo anual (20% dcto.), en CLP. */
  annualMonthlyPrice: number;
  /** Total anual en CLP. */
  annualTotalPrice: number;
  /** Portafolios seguidos permitidos. Infinity = ilimitado. */
  followLimit: number;
  /** Cupo del asistente IA. */
  chatQuota: ChatQuota;
  /** Frecuencias de alerta que el plan puede elegir. */
  alertFrequencies: AlertFrequencyValue[];
  /** Canales de alerta disponibles (email siempre). */
  alertChannels: AlertChannelValue[];
  /** Exportación CSV (Elite). */
  exportCsv: boolean;
  /** Tope de posiciones en Mi portafolio. */
  portfolioMaxPositions: number;
  /** Orígenes de carga habilitados (manual, CSV, cartola). */
  portfolioImport: PortfolioImportSource[];
  /** Profundidad del feed de noticias que tocan la cartera. */
  newsDepth: NewsDepth;
  /** Horas de retraso del feed (Gratis ve las noticias con 24 h). */
  newsDelayHours: number;
  /** Alertas automáticas de Mi portafolio. */
  autoAlerts: AutoAlertsMode;
  /** Tope diario de alertas automáticas (0 = no aplica). */
  autoAlertsMaxPerDay: number;
  /** Exportación CSV de Mi portafolio (solo Elite). */
  portfolioExportCsv: boolean;
  /** Bullets de la página de precios. */
  features: string[];
}

// ---- Constantes de negocio ----

/** Duración de la prueba de Pro para cuentas nuevas. */
export const TRIAL_DAYS = 7;
/** Descuento del ciclo anual (20%). */
export const ANNUAL_DISCOUNT = 0.2;
/** Plan efectivo durante la prueba. */
export const TRIAL_PLAN: Plan = "pro";

/** Precio mensual anualizado: mensual × 0,8 redondeado a $10. */
function annualMonthlyFrom(monthly: number): number {
  if (monthly <= 0) return 0;
  return Math.round((monthly * (1 - ANNUAL_DISCOUNT)) / 10) * 10;
}

function buildPlan(
  id: Plan,
  name: string,
  tagline: string,
  monthlyPrice: number,
  rest: Omit<PlanConfig, "id" | "name" | "tagline" | "monthlyPrice" | "annualMonthlyPrice" | "annualTotalPrice">,
): PlanConfig {
  const annualMonthlyPrice = annualMonthlyFrom(monthlyPrice);
  return {
    id,
    name,
    tagline,
    monthlyPrice,
    annualMonthlyPrice,
    annualTotalPrice: annualMonthlyPrice * 12,
    ...rest,
  };
}

// ---- Los tres planes ----

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    ...buildPlan("free", "Gratis", "Para siempre", 0, {
      followLimit: 2,
      chatQuota: { limit: 5, window: "day" },
      alertFrequencies: ["daily", "weekly"],
      alertChannels: ["email"],
      exportCsv: false,
      portfolioMaxPositions: 10,
      portfolioImport: ["manual", "csv"],
      newsDepth: "direct",
      newsDelayHours: 24,
      autoAlerts: "none",
      autoAlertsMaxPerDay: 0,
      portfolioExportCsv: false,
      features: [
        "Solo incluye las carteras recomendadas de corredoras",
        "Alertas por email con resumen diario",
        "Resumen semanal «Lo que movieron los grandes»",
        "Explorador público y retorno YTD",
        "5 consultas diarias al asistente IA",
      ],
    }),
  },
  pro: {
    ...buildPlan("pro", "Pro", "Inversor activo", 12990, {
      followLimit: 15,
      chatQuota: { limit: 50, window: "week" },
      alertFrequencies: ["realtime", "daily", "weekly"],
      alertChannels: ["email", "telegram"],
      exportCsv: false,
      portfolioMaxPositions: 50,
      portfolioImport: ["manual", "csv", "cartola"],
      newsDepth: "direct_sector",
      newsDelayHours: 0,
      autoAlerts: "daily_digest",
      autoAlertsMaxPerDay: 1,
      portfolioExportCsv: false,
      features: [
        "Seguir hasta 15 portafolios (Políticos EE.UU. y Corredoras Chile)",
        "Alertas en tiempo real apenas se publica el filing",
        "Resúmenes AI ejecutivos en cada movimiento",
        "Asistente Fraccion AI (50 consultas por semana)",
        "Comparador de cartera completo y detector de solapamiento",
        "Medidor de desfase de divulgación (Disclosure Lag)",
        "Alertas por Telegram además del correo",
      ],
    }),
  },
  elite: {
    ...buildPlan("elite", "Elite", "Institucional & 13F", 16990, {
      followLimit: Infinity,
      chatQuota: { limit: Infinity, window: "unlimited" },
      alertFrequencies: ["realtime", "daily", "weekly"],
      alertChannels: ["email", "telegram"],
      exportCsv: true,
      portfolioMaxPositions: 200,
      portfolioImport: ["manual", "csv", "cartola", "cartola_multi"],
      newsDepth: "all",
      newsDelayHours: 0,
      autoAlerts: "realtime",
      autoAlertsMaxPerDay: 20,
      portfolioExportCsv: true,
      features: [
        "Portafolios ilimitados en todas las categorías",
        "Acceso total a Fondos 13F Institucionales, Soberanos y Tesis AI",
        "Radar de Consenso (detecta compras simultáneas de múltiples ballenas)",
        "Asistente Fraccion AI ilimitado con cruce profundo de carteras",
        "Comparador multi-cartera (Fondos vs. Políticos vs. Tu cartera)",
        "Exportación de composiciones e historial en CSV",
        "Alertas por Telegram además del correo",
        "Soporte prioritario y acceso anticipado a nuevas fuentes",
      ],
    }),
  },
};

// ---- Helpers ----

/** Config del plan; cualquier valor desconocido cae a Gratis. */
export function getPlan(plan?: string | null): PlanConfig {
  if (plan === "pro" || plan === "elite" || plan === "free") return PLANS[plan];
  return PLANS.free;
}

/** Límite de portafolios seguidos (Infinity = ilimitado). */
export function followLimitFor(plan?: string | null): number {
  return getPlan(plan).followLimit;
}

/** Etiqueta del límite de follows para tablas: "2" | "15" | "Ilimitados". */
export function followLimitLabel(plan?: string | null): string {
  const limit = followLimitFor(plan);
  return Number.isFinite(limit) ? String(limit) : "Ilimitados";
}

/** Cupo del asistente IA por plan. */
export function chatQuotaFor(plan?: string | null): ChatQuota {
  return getPlan(plan).chatQuota;
}

/** True si la ventana de prueba sigue vigente (independiente del plan). */
export function isInTrial(trialEndsAt?: string | null, now: number = Date.now()): boolean {
  if (typeof trialEndsAt !== "string" || trialEndsAt.length === 0) return false;
  const ends = Date.parse(trialEndsAt);
  return Number.isFinite(ends) && ends > now;
}

/** Días completos que quedan de prueba (0 si ya venció, null si no aplica). */
export function trialDaysLeft(
  trialEndsAt?: string | null,
  now: number = Date.now(),
): number | null {
  if (typeof trialEndsAt !== "string" || trialEndsAt.length === 0) return null;
  const ends = Date.parse(trialEndsAt);
  if (!Number.isFinite(ends)) return null;
  return Math.max(0, Math.ceil((ends - now) / 86_400_000));
}

/** Usuario en prueba = plan gratis con trial vigente → se trata como Pro. */
export function isTrialPro(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): boolean {
  return !isPaidPlan(plan) && isInTrial(trialEndsAt, now);
}

/** Relaciones de noticia que habilita cada profundidad (orden estable). */
export const NEWS_RELATIONS_BY_DEPTH: Record<NewsDepth, readonly NewsRelation[]> = {
  direct: ["direct"],
  direct_sector: ["direct", "sector"],
  all: ["direct", "sector", "supplier", "competitor", "macro"],
};

/** Plan efectivo: la prueba vigente de un plan gratis se trata como Pro. */
function effectivePlan(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): Plan {
  return isTrialPro(plan, trialEndsAt, now) ? TRIAL_PLAN : getPlan(plan).id;
}

/**
 * Límites de Mi portafolio por plan. Sin plan o con un valor desconocido cae
 * a Gratis; Gratis con prueba vigente usa los límites de Pro.
 */
export function portfolioLimitsFor(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): PortfolioLimits {
  const effective = effectivePlan(plan, trialEndsAt, now);
  const config = getPlan(effective);
  return {
    plan: effective,
    maxPositions: config.portfolioMaxPositions,
    importSources: [...config.portfolioImport],
    newsDepth: config.newsDepth,
    newsDelayHours: config.newsDelayHours,
    newsRelations: [...NEWS_RELATIONS_BY_DEPTH[config.newsDepth]],
    autoAlerts: config.autoAlerts,
    autoAlertsMaxPerDay: config.autoAlertsMaxPerDay,
    exportCsv: config.portfolioExportCsv,
  };
}

/**
 * ¿Caben `adding` posiciones nuevas sobre `current`? Los valores inválidos o
 * negativos se tratan como 0. La prueba vigente usa el tope de Pro.
 */
export function canAddPositions(
  plan?: string | null,
  current: number = 0,
  adding: number = 0,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): boolean {
  const limit = portfolioLimitsFor(plan, trialEndsAt, now).maxPositions;
  const used = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  const incoming = Number.isFinite(adding) ? Math.max(0, Math.floor(adding)) : 0;
  return used + incoming <= limit;
}

/** Relaciones de noticia disponibles según plan y prueba. */
export function newsRelationsFor(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): NewsRelation[] {
  const effective = effectivePlan(plan, trialEndsAt, now);
  return [...NEWS_RELATIONS_BY_DEPTH[getPlan(effective).newsDepth]];
}


export function canUseRealtime(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): boolean {
  return isPaidPlan(plan) || isTrialPro(plan, trialEndsAt, now);
}

/** ¿Puede vincular Telegram? Pro, Elite o durante la prueba. */
export function canUseTelegram(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): boolean {
  return canUseRealtime(plan, trialEndsAt, now);
}

/** Frecuencias que el plan (o la prueba) permite elegir. */
export function allowedFrequencies(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): AlertFrequencyValue[] {
  return canUseRealtime(plan, trialEndsAt, now)
    ? ["realtime", "daily", "weekly"]
    : ["daily", "weekly"];
}

/** Formato CLP determinista: 12990 → "$12.990". */
export function formatClp(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + "$" + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
