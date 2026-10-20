import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Exige que el usuario de la sesión sea admin.
 *
 * Se usa al inicio de cada página/layout de /admin. Devuelve 404 (en vez de
 * 403) cuando no hay sesión o el email no está en ADMIN_EMAILS, para no
 * revelar que la ruta existe.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    notFound();
  }

  return user;
}
