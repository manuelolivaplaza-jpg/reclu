/**
 * Interruptores de publicación. Fallan cerrados.
 *
 * Un canal está activo solo si su variable es exactamente "true".
 * "TRUE", "1", "yes" o vacío no alcanzan.
 *
 * PUBLISH_MODE:
 * - preview (defecto, y cualquier valor distinto de draft o live)
 * - draft: se prepara, no se envía
 * - live: puede enviar si el canal está activo y el borrador está approved
 */

import type { Channel, DraftStatus } from "./types";

const CHANNEL_FLAGS = {
  x: "PUBLISH_X_ENABLED",
  telegram: "PUBLISH_TELEGRAM_ENABLED",
  newsletter: "PUBLISH_NEWSLETTER_ENABLED",
} as const satisfies Record<Channel, string>;

export type PublishMode = "preview" | "draft" | "live";

export function isChannelEnabled(ch: Channel): boolean {
  const key = CHANNEL_FLAGS[ch];
  if (!key) return false;
  return process.env[key] === "true";
}

export function publishMode(): PublishMode {
  const value = process.env.PUBLISH_MODE;
  if (value === "draft" || value === "live") return value;
  return "preview";
}

/** Live exige el flag del canal y el borrador approved. Si no, no se envía. */
export function canSendLive(channel: Channel, status: DraftStatus): boolean {
  return publishMode() === "live" && isChannelEnabled(channel) && status === "approved";
}
