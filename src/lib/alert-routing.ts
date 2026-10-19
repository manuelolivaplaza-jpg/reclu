/**
 * Enrutamiento de alertas — función pura compartida por web y tests.
 *
 * La edge function `send-alerts` (Deno) lleva una copia mínima de esta
 * lógica porque no puede importar desde `src/`. Cualquier cambio aquí debe
 * reflejarse en `supabase/functions/send-alerts/index.ts`.
 */

import {
  allowedFrequencies,
  canUseTelegram,
  type AlertChannelValue,
  type AlertFrequencyValue,
} from "@/lib/plans";

// ---- Tipos ----

export interface AlertRouteInput {
  plan: string;
  /** ISO timestamp; prueba vigente = gratis tratado como pro. */
  trialEndsAt?: string | null;
  /** Preferencia del usuario: realtime | daily | weekly. */
  alertFrequency: string;
  /** Preferencia de canal: email | telegram | both. */
  alertChannel?: string | null;
  /** true si el usuario pidió no recibir más correos. */
  emailUnsubscribed?: boolean | null;
  /** true si tiene chat_id de Telegram vinculado. */
  telegramLinked?: boolean | null;
  /** Modo de ejecución de la función: cada corrida | digest semanal. */
  mode?: "instant" | "daily" | "weekly";
}

export interface AlertRoute {
  /** Enviar correo individual (realtime) o agrupado por digest. */
  email: boolean;
  /** Enviar mensaje corto por Telegram. */
  telegram: boolean;
  /** Frecuencia efectiva con la que se enruta (normalizada al plan). */
  frequency: AlertFrequencyValue;
  /** Canal efectivo (normalizado). */
  channel: AlertChannelValue;
}

/** Normaliza la frecuencia pedida a una válida para el plan. */
export function normalizeFrequency(
  plan: string,
  requested: string,
  trialEndsAt?: string | null,
): AlertFrequencyValue {
  const allowed = allowedFrequencies(plan, trialEndsAt);
  const wanted = (
    ["realtime", "daily", "weekly"].includes(requested) ? requested : "daily"
  ) as AlertFrequencyValue;
  return allowed.includes(wanted) ? wanted : "daily";
}

/** Normaliza el canal pedido; sin Telegram habilitado cae a email. */
export function normalizeChannel(
  plan: string,
  requested: string | null | undefined,
  trialEndsAt?: string | null,
): AlertChannelValue {
  const wantsTelegram = requested === "telegram" || requested === "both";
  if (!canUseTelegram(plan, trialEndsAt)) return "email";
  return wantsTelegram ? (requested as AlertChannelValue) : "email";
}

/**
 * Decide cómo se entrega una alerta para un usuario en el modo actual.
 *
 * - `instant`: cada alerta individual nada más publicarse. Solo realtime.
 * - `daily`: digest diario con las no entregadas (realtime ya fue enviado).
 * - `weekly`: resumen semanal "lo que movieron los grandes" para todos.
 */
export function routeAlert(input: AlertRouteInput): AlertRoute {
  const mode = input.mode ?? "instant";
  const frequency = normalizeFrequency(input.plan, input.alertFrequency, input.trialEndsAt);
  const channel = normalizeChannel(input.plan, input.alertChannel, input.trialEndsAt);
  const unsubscribed = input.emailUnsubscribed === true;
  const telegramReady = input.telegramLinked === true && canUseTelegram(input.plan, input.trialEndsAt);

  const wantsTelegram = channel === "telegram" || channel === "both";
  const telegram = telegramReady && wantsTelegram;

  if (mode === "weekly") {
    // El resumen semanal es informativo para todos; va por correo salvo baja.
    return { email: !unsubscribed, telegram: telegram && !unsubscribed, frequency, channel };
  }

  if (mode === "daily") {
    // El digest diario agrupa a realtime/daily/weekly según lo ya enviado;
    // si el usuario pidió baja, nada por correo.
    return { email: !unsubscribed, telegram: telegram && frequency !== "realtime", frequency, channel };
  }

  // instant: solo quienes eligieron (y pueden) tiempo real.
  if (frequency !== "realtime") {
    return { email: false, telegram, frequency, channel };
  }
  return { email: !unsubscribed, telegram, frequency, channel };
}

/** Rótulo del canal para el correo/Telegram, en español. */
export function channelLabel(channel: AlertChannelValue): string {
  if (channel === "telegram") return "Telegram";
  if (channel === "both") return "Correo y Telegram";
  return "Correo";
}
