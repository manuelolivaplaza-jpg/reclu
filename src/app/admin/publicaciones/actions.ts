"use server";

/**
 * Acciones del panel de publicaciones.
 *
 * Toda acción exige primero `requireAdmin()` y solo después toca Supabase con
 * el cliente de servicio. Los cuerpos se validan por canal y nunca se envía
 * nada sin aprobación explícita y sin el flag del canal encendido.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import type { FormState } from "@/lib/form-state";
import { publishDraft } from "@/lib/publish";
import { telegramChannel } from "@/lib/publish/telegram-channel";
import type { Channel, Draft, Publisher } from "@/lib/publish/types";
import { xPublisher } from "@/lib/publish/x";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/admin/publicaciones";

const ID_SCHEMA = z.string().uuid("El id del borrador no es válido.");

/** Largo máximo de cuerpo por canal. */
const MAX_BODY: Record<Channel, number> = {
  x: 280,
  telegram: 4096,
  newsletter: 20_000,
};

const REASON_SCHEMA = z
  .string()
  .trim()
  .max(500, "El motivo no puede superar los 500 caracteres.");

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type DraftRow = Draft;

function parseId(formData: FormData): { id: string } | { error: string } {
  const parsed = ID_SCHEMA.safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Id inválido." };
  }
  return { id: parsed.data };
}

async function loadDraft(supabase: AdminClient, id: string) {
  const { data, error } = await supabase
    .from("publish_drafts")
    .select(
      "id, channel, body, payload, source_alert_id, status, preview_url, created_at, approved_by, approved_at, sent_at, external_id, error",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: `No se pudo leer el borrador: ${error.message}` } as const;
  if (!data) return { error: "El borrador no existe." } as const;
  return { draft: data as DraftRow } as const;
}

function adminClientOrError(): { supabase: AdminClient } | { error: string } {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      error:
        "Supabase no está configurado. Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
    };
  }
  return { supabase };
}

function done(message: string): FormState {
  revalidatePath(PATH);
  return { success: message };
}

export async function approveDraft(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const parsedId = parseId(formData);
  if ("error" in parsedId) return { error: parsedId.error };

  const client = adminClientOrError();
  if ("error" in client) return { error: client.error };

  const loaded = await loadDraft(client.supabase, parsedId.id);
  if ("error" in loaded) return { error: loaded.error };

  if (loaded.draft.status === "sent") {
    return { error: "Un borrador ya enviado no se puede aprobar de nuevo." };
  }

  const { error } = await client.supabase
    .from("publish_drafts")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", parsedId.id);

  if (error) return { error: `No se pudo aprobar: ${error.message}` };
  return done("Borrador aprobado. Ya se puede enviar si el canal está encendido.");
}

export async function rejectDraft(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsedId = parseId(formData);
  if ("error" in parsedId) return { error: parsedId.error };

  const reason = REASON_SCHEMA.safeParse(String(formData.get("reason") ?? ""));
  if (!reason.success) {
    return { error: reason.error.issues[0]?.message ?? "Motivo inválido." };
  }

  const client = adminClientOrError();
  if ("error" in client) return { error: client.error };

  const loaded = await loadDraft(client.supabase, parsedId.id);
  if ("error" in loaded) return { error: loaded.error };
  if (loaded.draft.status === "sent") {
    return { error: "Un borrador ya enviado no se puede rechazar." };
  }

  const { error } = await client.supabase
    .from("publish_drafts")
    .update({
      status: "rejected",
      approved_by: null,
      approved_at: null,
      error: reason.data.length > 0 ? reason.data : null,
    })
    .eq("id", parsedId.id);

  if (error) return { error: `No se pudo rechazar: ${error.message}` };
  return done("Borrador rechazado.");
}

export async function editDraft(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsedId = parseId(formData);
  if ("error" in parsedId) return { error: parsedId.error };

  const client = adminClientOrError();
  if ("error" in client) return { error: client.error };

  const loaded = await loadDraft(client.supabase, parsedId.id);
  if ("error" in loaded) return { error: loaded.error };
  if (loaded.draft.status === "sent") {
    return { error: "Un borrador ya enviado no se puede editar." };
  }

  const body = z
    .string()
    .trim()
    .min(1, "El texto no puede estar vacío.")
    .max(
      MAX_BODY[loaded.draft.channel],
      `El texto supera el máximo de ${MAX_BODY[loaded.draft.channel]} caracteres para ${loaded.draft.channel}.`,
    )
    .safeParse(String(formData.get("body") ?? ""));

  if (!body.success) {
    return { error: body.error.issues[0]?.message ?? "Texto inválido." };
  }

  // Editar invalida la aprobación anterior: debe volver a pasar por revisión.
  const { error } = await client.supabase
    .from("publish_drafts")
    .update({
      body: body.data,
      status: "draft",
      approved_by: null,
      approved_at: null,
      error: null,
    })
    .eq("id", parsedId.id);

  if (error) return { error: `No se pudo editar: ${error.message}` };
  return done("Borrador actualizado. Queda pendiente de aprobación.");
}

function publishers(): Publisher[] {
  // El newsletter todavía no tiene lista de suscriptores (F22). Si se intenta
  // enviar ese canal, `publishDraft` devuelve el error de publicador ausente.
  return [xPublisher(), telegramChannel];
}

export async function sendDraft(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsedId = parseId(formData);
  if ("error" in parsedId) return { error: parsedId.error };

  const client = adminClientOrError();
  if ("error" in client) return { error: client.error };

  const loaded = await loadDraft(client.supabase, parsedId.id);
  if ("error" in loaded) return { error: loaded.error };

  if (loaded.draft.status !== "approved") {
    return { error: "Solo se pueden enviar borradores aprobados." };
  }

  const result = await publishDraft(loaded.draft, publishers());

  if (result.skipped) {
    return {
      success: `Envío omitido: ${result.reason}`,
    };
  }

  if ("rejected" in result) {
    return { error: result.reason };
  }

  if ("error" in result) {
    const { error } = await client.supabase
      .from("publish_drafts")
      .update({ status: "failed", error: result.error })
      .eq("id", parsedId.id);
    if (error) {
      return {
        error: `${result.error} (además falló el registro del error: ${error.message})`,
      };
    }
    revalidatePath(PATH);
    return { error: result.error };
  }

  const { error } = await client.supabase
    .from("publish_drafts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      external_id: result.externalId,
      error: null,
    })
    .eq("id", parsedId.id);

  if (error) return { error: `Se envió, pero no se pudo guardar: ${error.message}` };
  return done(`Enviado. Identificador externo: ${result.externalId}`);
}
