/**
 * Exige una sesión admin. Sin usuario o sin email en ADMIN_EMAILS => 404.
 *
 * Nota: se omite `import "server-only"` para que Vitest resuelva el módulo sin
 * alias de Next; este archivo solo se importa desde servidor.
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) notFound();
  return user;
}
