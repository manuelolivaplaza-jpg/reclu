/**
 * Publicador del canal público de Telegram.
 *
 * No es el bot de avisos 1-a-1 (F4): acá se publica un borrador aprobado en
 * `TELEGRAM_CHANNEL_ID` usando `TELEGRAM_BOT_TOKEN`.
 *
 * El cuerpo llega como texto plano y se escapa antes de mandarlo con
 * `parse_mode: "HTML"`. Sin token o sin canal no se llama a la API. El flag
 * `PUBLISH_TELEGRAM_ENABLED` se vuelve a revisar acá para fallar cerrado
 * incluso si alguien invoca el adaptador sin pasar por `publishDraft`.
 */

import { isChannelEnabled } from "./flags";
import type { Draft, Publisher } from "./types";

const TELEGRAM_MAX_CHARS = 4096;

/** Escapa lo mínimo que interpreta el parser HTML de Telegram. */
export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TelegramFetch = typeof fetch;

interface TelegramResponse {
  ok?: boolean;
  result?: { message_id?: number };
  description?: string;
}

function assertConfigured(): { token: string; channelId: string } {
  if (!isChannelEnabled("telegram")) {
    throw new Error("El canal Telegram está apagado.");
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!token || !channelId) {
    throw new Error("Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHANNEL_ID.");
  }
  return { token, channelId };
}

/**
 * Crea el `Publisher`. `fetchImpl` existe para los tests; en producción se usa
 * el `fetch` global.
 */
export function telegramChannelPublisher(fetchImpl: TelegramFetch = fetch): Publisher {
  return {
    channel: "telegram",

    validate(body: string): void {
      const text = body.trim();
      if (text.length === 0) throw new Error("El texto está vacío.");
      if (text.length > TELEGRAM_MAX_CHARS) {
        throw new Error(`El texto supera los ${TELEGRAM_MAX_CHARS} caracteres de Telegram.`);
      }
    },

    async send(draft: Draft): Promise<{ externalId: string }> {
      const { token, channelId } = assertConfigured();
      const text = escapeTelegramHtml(draft.body.trim());

      const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as TelegramResponse | null;
      if (!response.ok || data?.ok !== true) {
        throw new Error(data?.description ?? "Telegram no confirmó el envío.");
      }

      const messageId = data.result?.message_id;
      if (typeof messageId !== "number") {
        throw new Error("Telegram no devolvió el identificador del mensaje.");
      }
      return { externalId: String(messageId) };
    },
  };
}

/** Instancia lista para registrar en `publishDraft`. */
export const telegramChannel = telegramChannelPublisher();
