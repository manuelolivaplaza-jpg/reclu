/**
 * Publica un borrador ya aprobado, o se niega.
 *
 * No llama a X, Telegram ni a un proveedor de correo. El `send` lo aporta
 * quien llama, y solo corre con modo live, flag del canal en "true" y
 * estado approved. El resultado queda en el retorno y en un registro
 * corto de este proceso (no escribe en Supabase).
 */

import { canSendLive, isChannelEnabled, publishMode } from "./flags";
import type { Draft, PublishRecord, PublishResult, Publisher } from "./types";

export { canSendLive, isChannelEnabled, publishMode };
export type { PublishMode } from "./flags";
export type {
  Channel,
  Draft,
  DraftStatus,
  PublishRecord,
  PublishResult,
  Publisher,
} from "./types";

const MAX_RECORDS = 50;
const records: PublishRecord[] = [];

export function recentPublishRecords(): readonly PublishRecord[] {
  return records;
}

export function clearPublishRecords(): void {
  records.length = 0;
}

function remember(draft: Draft, result: PublishResult): PublishResult {
  records.push({
    draftId: draft.id,
    channel: draft.channel,
    at: new Date().toISOString(),
    result,
  });
  if (records.length > MAX_RECORDS) records.shift();
  return result;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "No se pudo publicar el borrador.";
}

function blocked(draft: Draft): PublishResult | null {
  if (draft.status !== "approved") {
    return {
      skipped: false,
      rejected: true,
      reason: "El borrador no está aprobado.",
    };
  }
  if (!isChannelEnabled(draft.channel)) {
    return { skipped: true, reason: "El canal está apagado." };
  }
  const mode = publishMode();
  if (mode === "preview") {
    return { skipped: true, reason: "Modo preview: no se envía." };
  }
  if (mode !== "live") {
    return { skipped: true, reason: "Modo draft: no se publica en vivo." };
  }
  if (!canSendLive(draft.channel, draft.status)) {
    return { skipped: true, reason: "El envío en vivo no está autorizado." };
  }
  return null;
}

export async function publishDraft(
  draft: Draft,
  publishers: readonly Publisher[],
): Promise<PublishResult> {
  const refusal = blocked(draft);
  if (refusal) return remember(draft, refusal);

  const publisher = publishers.find((item) => item.channel === draft.channel);
  if (!publisher) {
    return remember(draft, {
      skipped: false,
      error: "No hay un publicador para este canal.",
    });
  }

  try {
    publisher.validate(draft.body);
  } catch (error) {
    return remember(draft, { skipped: false, error: messageFrom(error) });
  }

  if (!canSendLive(draft.channel, draft.status)) {
    return remember(draft, {
      skipped: true,
      reason: "El envío en vivo no está autorizado.",
    });
  }

  try {
    const sent = await publisher.send(draft);
    if (typeof sent?.externalId !== "string" || sent.externalId.length === 0) {
      return remember(draft, {
        skipped: false,
        error: "El publicador no devolvió externalId.",
      });
    }
    return remember(draft, { skipped: false, externalId: sent.externalId });
  } catch (error) {
    return remember(draft, { skipped: false, error: messageFrom(error) });
  }
}
