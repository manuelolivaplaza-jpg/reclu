/**
 * Autorización de administradores.
 *
 * `ADMIN_EMAILS` es una lista separada por comas. Si no está definida (o está
 * vacía) nadie es admin: el control falla cerrado.
 *
 * Nota: este módulo se mantiene libre de `server-only` porque el paquete no
 * está instalado en el proyecto y porque los tests lo importan directamente.
 * Solo debe usarse desde código de servidor (proxy, server components y
 * server actions); nunca desde un componente cliente.
 */

/** Emails admin desde ADMIN_EMAILS (coma). Vacio o sin definir => nadie es admin (falla cerrado). */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}
