# NOTAS F21-B — Panel /admin/publicaciones

Rama: `v2/f21b-admin-panel` (desde `mejoras/integracion`). Sin push.

## Hecho

1. **Contrato admin**
   - `src/lib/admin.ts`: `adminEmails()` e `isAdmin()` con `ADMIN_EMAILS`
     (coma, minúsculas, falla cerrado si está vacío).
   - `src/lib/admin-guard.ts`: `requireAdmin()` con `createClient()` +
     `auth.getUser()`; sin usuario o email fuera de la lista => `notFound()`.

2. **Acciones** (`src/app/admin/publicaciones/actions.ts`, `"use server"`)
   - `approveDraft`, `rejectDraft`, `editDraft`, `sendDraft` con firma
     `(prev: FormState, formData: FormData) => Promise<FormState>`.
   - Cada una llama **primero** `await requireAdmin()`.
   - Id validado con Zod (`uuid`) y cuerpo con Zod y máximo por canal:
     X 280, Telegram 4096, newsletter 20.000.
   - Escrituras solo con `createAdminClient()` después del guard.
   - Editar devuelve el borrador a `draft` y limpia la aprobación anterior.
   - `sendDraft` exige `status === "approved"` y llama a `publishDraft`.
     Canal apagado / modo preview => `skipped` sin llamar a `fetch`.
     Resultado live => `sent` + `external_id`; error => `failed` + mensaje.
   - El newsletter todavía no tiene publicador (lista de F22): si se intenta
     enviar con el canal encendido, `publishDraft` devuelve el error de
     publicador ausente.

3. **Página** (`src/app/admin/publicaciones/page.tsx`)
   - `await connection()`, `await requireAdmin()`, `instant = false`.
   - `metadata.robots = { index: false, follow: false }`.
   - Lista por estado (pendientes, aprobados, rechazados, con error, enviados)
     y vista previa por canal: tarjeta X, mensaje Telegram, correo newsletter.
   - Aviso por canal (`X: APAGADO`) y modo de publicación actual.
   - Sin enlace en la navegación pública.

4. **UI cliente** (`src/app/admin/publicaciones/draft-forms.tsx`)
   - `"use client"` + `useActionState` para aprobar, rechazar, editar y enviar.
   - Solo recibe `id`, `channel`, `body` y `status`: sin secretos ni env.

5. **Tests** (`tests/admin-panel.test.ts`, 7 casos)
   - No admin (y sin sesión) => `notFound` en las cuatro acciones.
   - Id no uuid rechazado sin tocar la base.
   - Enviar con canal apagado => omitido y `fetch` no llamado.
   - Enviar un borrador no aprobado => error y `fetch` no llamado.
   - Aprobar registra `approved_by`; editar un aprobado lo vuelve a `draft`.
   - Supabase y `fetch` mockeados; sin red ni base real.

## Notas de implementación

- Se omitió `import "server-only"` en `admin.ts` y `admin-guard.ts`: el paquete
  no está instalado en `node_modules` y Vitest no resuelve el alias interno de
  Next. Ambos archivos se importan solo desde servidor (lo permite la tarea).
- No se ejecutó `npx next build`: el orquestador lo corre aparte. Verificado
  con `npm run lint`, `npm test` y `npm run typecheck`.

## Verificación

```bash
npm run lint       # OK
npm test           # 43 archivos, 506 tests OK
npm run typecheck  # OK
```

## Pendiente / siguiente

- Publicador real de newsletter cuando F22 entregue la lista de suscriptores.
- F21-A puede sobrescribir `admin.ts` / `admin-guard.ts` con su versión si
  mantiene el mismo contrato; conviene resolver el solape al integrar.
- Probar en navegador con Supabase real y `ADMIN_EMAILS` configurado (no se
  hizo aquí a propósito: sin Supabase real).
