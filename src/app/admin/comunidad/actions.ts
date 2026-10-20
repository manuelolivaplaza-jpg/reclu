"use server";

/**
 * Acciones del panel de moderación de la comunidad (F49-B).
 *
 * La comunidad entera está apagada salvo que `COMMUNITY_ENABLED === "true"`.
 * Cada acción exige primero `requireAdmin()` y solo después escribe con el
 * cliente de servicio (bypassa RLS). La moderación es la única vía para pasar
 * una cartera a `approved` o marcar un perfil como `verificado`.
 *
 * Sin asesoría: antes de aprobar hay que revisar el texto con
 * `containsAdviceImperative` (lo advierte la página). La revisión legal
 * (Ley Fintec 21.521) es requisito previo a encender el flag.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { communityEnabled } from "@/lib/community";
import type { FormState } from "@/lib/form-state";
import { createAdminClient } from "@/lib/supabase/admin";

const PATH = "/admin/comunidad";

const ID_SCHEMA = z.string().uuid("El id no es válido.");

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function parseId(formData: FormData): { id: string } | { error: string } {
  const parsed = ID_SCHEMA.safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Id inválido." };
  }
  return { id: parsed.data };
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

/** La comunidad apagada no se modera: la acción falla cerrada. */
function disabledError(): FormState | null {
  if (communityEnabled()) return null;
  return {
    error:
      "La comunidad está apagada. Activa COMMUNITY_ENABLED para moderar.",
  };
}

function done(message: string): FormState {
  revalidatePath(PATH);
  return { success: message };
}

/** Aprueba una cartera de creador: pasa a `approved` y queda pública. */
export async function approvePortfolio(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const parsedId = parseId(formData);
  if ("error" in parsedId) return { error: parsedId.error };

  const off = disabledError();
  if (off) return off;

  const client = adminClientOrError();
  if ("error" in client) return { error: client.error };

  const { error } = await client.supabase
    .from("creator_portfolios")
    .update({
      estado: "approved",
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    })
    .eq("id", parsedId.id);

  if (error) return { error: `No se pudo aprobar: ${error.message}` };
  return done("Cartera aprobada. Ya es visible en el catálogo público.");
}

/** Rechaza una cartera de creador: queda privada. */
export async function rejectPortfolio(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAdmin();

  const parsedId = parseId(formData);
  if ("error" in parsedId) return { error: parsedId.error };

  const off = disabledError();
  if (off) return off;

  const client = adminClientOrError();
  if ("error" in client) return { error: client.error };

  const { error } = await client.supabase
    .from("creator_portfolios")
    .update({
      estado: "rejected",
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    })
    .eq("id", parsedId.id);

  if (error) return { error: `No se pudo rechazar: ${error.message}` };
  return done("Cartera rechazada. No se publica.");
}

/**
 * Marca un perfil de creador como verificado. La verificación es la que
 * habilita el perfil público (migración 038): sin ella, aunque tenga carteras
 * aprobadas, el perfil no se expone.
 */
export async function verifyCreator(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsedId = parseId(formData);
  if ("error" in parsedId) return { error: parsedId.error };

  const off = disabledError();
  if (off) return off;

  const client = adminClientOrError();
  if ("error" in client) return { error: client.error };

  const { error } = await client.supabase
    .from("creator_profiles")
    .update({ verificado: true, updated_at: new Date().toISOString() })
    .eq("id", parsedId.id);

  if (error) return { error: `No se pudo verificar: ${error.message}` };
  return done("Creador verificado. Su perfil ya puede ser público.");
}
