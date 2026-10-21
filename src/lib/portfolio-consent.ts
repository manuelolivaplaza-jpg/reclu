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
export const PORTFOLIO_CONSENT_VERSION = "2026-10-20.v1";

/** Estado del consentimiento guardado frente al texto vigente. */
export type PortfolioConsentStatus = "none" | "current" | "outdated";

/** Mensaje cuando nunca dio consentimiento. */
export const PORTFOLIO_CONSENT_REQUIRED_MESSAGE =
  "Necesitamos tu consentimiento explícito para guardar tu cartera. Actívalo en Ajustes y vuelve a intentar.";

/** Mensaje cuando aceptó una versión anterior del texto. */
export const PORTFOLIO_CONSENT_OUTDATED_MESSAGE =
  "Actualizamos el texto de consentimiento. Acéptalo de nuevo en Ajustes para guardar tu cartera.";

/**
 * Compara lo guardado con la versión vigente. Sin `consent_at` no hay
 * consentimiento; con fecha pero sin la versión actual hay que aceptar de
 * nuevo (Ley 21.719: hay que poder acreditar qué texto aceptó).
 */
export function portfolioConsentStatus(
  consentAt: string | null | undefined,
  consentVersion: string | null | undefined,
  currentVersion: string = PORTFOLIO_CONSENT_VERSION,
): PortfolioConsentStatus {
  if (!consentAt) return "none";
  return (consentVersion ?? "").trim() === currentVersion ? "current" : "outdated";
}

/** true solo si el consentimiento existe y corresponde al texto vigente. */
export function hasCurrentPortfolioConsent(
  consentAt: string | null | undefined,
  consentVersion: string | null | undefined,
  currentVersion: string = PORTFOLIO_CONSENT_VERSION,
): boolean {
  return portfolioConsentStatus(consentAt, consentVersion, currentVersion) === "current";
}

/** Mensaje en español para bloquear guardado/importación, o null si está al día. */
export function portfolioConsentErrorMessage(
  consentAt: string | null | undefined,
  consentVersion: string | null | undefined,
): string | null {
  switch (portfolioConsentStatus(consentAt, consentVersion)) {
    case "none":
      return PORTFOLIO_CONSENT_REQUIRED_MESSAGE;
    case "outdated":
      return PORTFOLIO_CONSENT_OUTDATED_MESSAGE;
    case "current":
      return null;
  }
}

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
 * Párrafos del consentimiento, tomados del texto de la §2.5 del informe legal
 * (borrador para revisión de abogado). La UI los renderiza en orden.
 */
export function portfolioConsentParagraphs(rawModel?: string | null): string[] {
  const model = aiModelLabel(rawModel);
  return [
    "Autorizo a Reclu a tratar los datos de mi cartera que ingrese o importe (instrumentos, pesos y, si los agrego, cantidades, costo promedio, moneda y corredora) con el único fin de mostrarme comparaciones, la exposición de mi cartera a noticias y, si las activo, alertas.",
    "Entiendo que estos datos se tratan como datos sensibles (Ley 21.719).",
    `Para responder preguntas con IA se envían a OpenRouter Inc. y al proveedor del modelo (${model}), en EE.UU., solo los pesos porcentuales, sin mi nombre, correo ni montos, y que los datos se alojan en proveedores fuera de Chile, según la Política de privacidad.`,
    "Reclu no me da recomendaciones de inversión.",
    "Puedo retirar este consentimiento y borrar mi cartera en cualquier momento desde Ajustes.",
    `Versión del texto: ${PORTFOLIO_CONSENT_VERSION}.`,
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
