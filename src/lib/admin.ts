import "server-only";
/** Emails admin desde ADMIN_EMAILS (coma). Vacio o sin definir => nadie es admin (falla cerrado). */
export function adminEmails(): Set<string> {
  return new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}
