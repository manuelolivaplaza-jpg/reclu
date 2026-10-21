/**
 * portfolio-consent.ts — textos y validaciones de privacidad de Mi portafolio
 * (F75). Sin acceso a red ni a Supabase: todo es puro para poder probarlo y
 * reutilizarlo en la UI y en las server actions.
 *
 * Ley 21.719 (datos personales) y Ley Fintec 21.521: las tenencias se tratan
 * como datos financieros sensibles. El consentimiento es explícito, el checkbox
 * parte sin marcar y el borrado exige escribir una palabra de confirmación.
 */
import {
  getPlan,
  portfolioLimitsFor,
  type AlertChannelValue,
  type AutoAlertsMode,
} from "@/lib/plans";

/** Palabra exacta que el usuario debe escribir para borrar su cartera. */
export const DELETE_CONFIRMATION_WORD = "BORRAR";

/** Versión del texto de consentimiento (para auditoría futura). */
export const PORTFOLIO_CONSENT_VERSION = "2026-10";

/** Canales de alerta automática que entiende `user_portfolio_settings`. */
export const PORTFOLIO_ALERT_CHANNELS: readonly AlertChannelValue[] = [
  "email",
  "telegram",
  "both",
];

/** Umbrales de relevancia que ofrece la UI (0–1, columna numeric(4,3)). */
export const PORTFOLIO_RELEVANCE_THRESHOLDS = [0.3, 0.5, 0.7] as const;

/**
 * true si el checkbox de consentimiento vino marcado. Un checkbox HTML sin
 * marcar no envía el campo; cualquier otro valor se considera NO aceptado.
 */
export function isPortfolioConsentChecked(
  value: FormDataEntryValue | null | undefined,
): boolean {
  return value === "on" || value === "true";
}

/** true si el texto de confirmación es exactamente "BORRAR" (ignora espacios). */
export function isDeleteConfirmationValid(value: unknown): boolean {
  return typeof value === "string" && value.trim() === DELETE_CONFIRMATION_WORD;
}

/** Nombre del modelo para el texto legal; nunca vacío. */
export function aiModelLabel(raw?: string | null): string {
  const model = (raw ?? "").trim();
  return model.length > 0 ? model : "el modelo configurado en el servidor";
}

/**
 * Párrafos del consentimiento. Explican finalidad, minimización, transferencia
 * internacional y derecho a borrar. La UI los renderiza en orden.
 */
export function portfolioConsentParagraphs(rawModel?: string | null): string[] {
  return [
    "Finalidad: cruzamos los símbolos de tu cartera con noticias y datos públicos para avisarte de lo que podría afectarte. No ejecutamos órdenes ni entregamos asesoría de inversión.",
    "Datos sensibles: tus tenencias son datos financieros y los tratamos como sensibles (Ley 21.719). Se guardan asociados solo a tu cuenta, con row-level security, y nunca se publican.",
    "Minimización: no enviamos a la IA montos invertidos, cantidades, tu nombre, tu correo ni ningún dato que te identifique. Cuando haces una consulta solo viajan símbolos y pesos en porcentaje.",
    `Transferencia internacional: el proveedor de IA es OpenRouter, con servidores fuera de Chile, y el modelo utilizado es ${aiModelLabel(rawModel)}. Al dar tu consentimiento aceptas esta transferencia para la finalidad descrita.`,
    "Derecho a borrar: puedes retirar el consentimiento y borrar tu cartera y estos ajustes cuando quieras desde Ajustes. El borrado es inmediato e irreversible.",
  ];
}

/** Etiqueta corta del switch de alertas automáticas. */
export const AUTO_ALERTS_LABEL = "Alertas automáticas de mi cartera";

/**
 * Canales que la UI puede ofrecer según el plan (o la prueba vigente).
 * "both" solo aparece si el plan permite correo y Telegram.
 */
export function portfolioAlertChannelsFor(
  plan?: string | null,
  trialEndsAt?: string | null,
  now: number = Date.now(),
): AlertChannelValue[] {
  const allowed = getPlan(portfolioLimitsFor(plan, trialEndsAt, now).plan).alertChannels;
  const channels: AlertChannelValue[] = [];
  if (allowed.includes("email")) channels.push("email");
  if (allowed.includes("telegram")) channels.push("telegram", "both");
  return channels.length > 0 ? channels : ["email"];
}

/** Descripción del switch, según lo que permita el plan. */
export function autoAlertsDescription(mode: AutoAlertsMode): string {
  switch (mode) {
    case "none":
      return "Tu plan no incluye alertas automáticas de tu cartera. Puedes activarlas con Pro o Elite.";
    case "daily_digest":
      return "Un resumen diario por el canal que elijas cuando una noticia supere el umbral.";
    case "realtime":
      return "Aviso apenas aparezca una noticia que supere el umbral, con tope diario del plan.";
  }
}

export interface PortfolioAlertSettingsInput {
  autoAlerts: boolean;
  /** Valor crudo del formulario (string) o número ya parseado. */
  minRelevance: unknown;
  /** Valor crudo del formulario. */
  alertChannel: unknown;
}

export interface PortfolioAlertSettingsValues {
  autoAlerts: boolean;
  minRelevance: number;
  alertChannel: AlertChannelValue;
}

export type PortfolioAlertSettingsResult =
  | { ok: true; values: PortfolioAlertSettingsValues }
  | { ok: false; error: string };

/**
 * Valida y normaliza los ajustes de alertas automáticas respetando el plan
 * (`autoAlerts` de plans.ts), los canales disponibles y el consentimiento.
 */
export function validatePortfolioAlertSettings(
  input: PortfolioAlertSettingsInput,
  options: {
    plan?: string | null;
    trialEndsAt?: string | null;
    hasConsent: boolean;
    now?: number;
  },
): PortfolioAlertSettingsResult {
  const limits = portfolioLimitsFor(
    options.plan,
    options.trialEndsAt,
    options.now ?? Date.now(),
  );

  const rawChannel = typeof input.alertChannel === "string" ? input.alertChannel : "";
  if (!PORTFOLIO_ALERT_CHANNELS.includes(rawChannel as AlertChannelValue)) {
    return { ok: false, error: "Canal de alerta inválido." };
  }
  const alertChannel = rawChannel as AlertChannelValue;

  const allowedChannels = getPlan(limits.plan).alertChannels;
  const channelAllowed =
    alertChannel === "email" ||
    (alertChannel === "telegram" && allowedChannels.includes("telegram")) ||
    (alertChannel === "both" &&
      allowedChannels.includes("email") &&
      allowedChannels.includes("telegram"));
  if (!channelAllowed) {
    return {
      ok: false,
      error: "Telegram está disponible en Pro, Elite y durante la prueba.",
    };
  }

  const minRelevance =
    typeof input.minRelevance === "number"
      ? input.minRelevance
      : Number(String(input.minRelevance ?? "").replace(",", "."));
  if (!Number.isFinite(minRelevance) || minRelevance < 0 || minRelevance > 1) {
    return { ok: false, error: "El umbral debe estar entre 0 y 1." };
  }

  if (input.autoAlerts) {
    if (limits.autoAlerts === "none") {
      return {
        ok: false,
        error: "Tu plan no incluye alertas automáticas. Pasa a Pro o Elite para activarlas.",
      };
    }
    if (!options.hasConsent) {
      return {
        ok: false,
        error: "Primero debes otorgar tu consentimiento explícito para tratar tu cartera.",
      };
    }
  }

  return {
    ok: true,
    values: {
      autoAlerts: input.autoAlerts,
      // numeric(4,3): tres decimales, sin sorpresas de coma flotante.
      minRelevance: Math.round(minRelevance * 1000) / 1000,
      alertChannel,
    },
  };
}

/** Formatea `consent_at` de forma estable (UTC) para no romper la hidratación. */
export function formatConsentDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(time));
}
