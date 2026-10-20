# F49-B — Página de moderación /admin/comunidad

Rama: `v2/f49b-comunidad-moderacion` (desde `mejoras/integracion`). Sin push,
sin tocar Supabase real, sin `next build` ni `npm run dev`.

## Hecho

1. **`src/app/admin/comunidad/page.tsx`** (server component)
   - `await connection()` + `export const instant = false` + `metadata.robots =
     { index: false, follow: false }` (mismo patrón que `/admin/publicaciones`).
   - `await requireAdmin()` (F21) primero; si el email no está en
     `ADMIN_EMAILS` devuelve 404.
   - **Apagado por defecto**: si `communityEnabled()` es false (no hay
     `COMMUNITY_ENABLED="true"`) la ruta responde `notFound()`.
   - Lista de `creator_portfolios` con `estado = "pending"` (join a
     `creator_profiles`) mostrando: título, alias del creador, si está
     verificado, posiciones (símbolo + peso), fecha/id y el **conflicto de
     interés declarado**.
   - **Aviso de asesoría**: si `containsAdviceImperative()` (F49-A) detecta
     lenguaje imperativo en título, descripción o símbolos, la tarjeta muestra
     un recuadro de alerta y el encabezado lleva el contador "Posible asesoría".
   - Sección extra "Perfiles sin verificar" (`creator_profiles.verificado =
     false`) con botón Verificar, para poder ejecutar `verifyCreator`.

2. **`src/app/admin/comunidad/actions.ts`** (`"use server"`) — tres acciones
   con `FormState` (`useActionState`):
   - `approvePortfolio`: `estado = "approved"`, `moderated_at`, `moderated_by`.
   - `rejectPortfolio`: `estado = "rejected"`, `moderated_at`, `moderated_by`.
   - `verifyCreator`: `creator_profiles.verificado = true`, `updated_at`.
   - Orden de guardas en las tres: **1)** `await requireAdmin()` (404 si no es
     admin), **2)** validación del id con Zod (`z.string().uuid()`), **3)** si
     la comunidad está apagada devuelven error y **no escriben**, **4)**
     `createAdminClient()` (service_role) y escritura. `revalidatePath` tras
     cada éxito.
   - `src/app/admin/comunidad/moderacion-forms.tsx` (client): formularios
     `PortfolioModerationForms` y `VerifyCreatorForm`; solo reciben `id`/`alias`
     — ningún secreto llega al navegador.

3. **`tests/community-admin.test.ts`** — 7 tests (doble en memoria del cliente
   admin, sin red): no admin ⇒ `NEXT_NOT_FOUND` en las tres acciones; sin
   sesión ⇒ `notFound`; id inválido rechazado sin escribir; comunidad apagada ⇒
   error y cero escrituras; aprobar/rechazar cambian `estado` y registran al
   moderador; `verifyCreator` escribe en `creator_profiles`.

## Verificación

```bash
npx vitest run tests/community-admin.test.ts --maxWorkers=1   # 7 OK
npx vitest run --maxWorkers=1                                 # 54 archivos / 628 tests OK
npm run lint                                                  # limpio
npm run typecheck                                             # limpio
```

No se ejecutó `next build` ni `npm run dev` (los corre el orquestador).

## Pendiente / notas

- **Revisión legal obligatoria antes de encender el flag (Ley Fintec 21.521)**:
  la comunidad debe ser informativa. La detección de lenguaje imperativo es una
  ayuda, no un filtro suficiente: revisar caso a caso conflicto de interés,
  disclaimers visibles, tratamiento de datos personales (Leyes 19.628 y 21.719)
  y proceso de retiro de contenido.
- **`COMMUNITY_ENABLED` no está en `.env.example`** (la tarea prohíbe tocar
  `.env*`). Añadirla (documentada como apagada) cuando se conecte el flujo
  público de creadores.
- `rejectPortfolio` **no guarda motivo**: la tabla `creator_portfolios` (038) no
  tiene columna de motivo de rechazo. Si se quiere trazabilidad, requiere una
  migración nueva (fuera del alcance de F49-B).
- La UI de alta de perfil/cartera del creador y la vista pública del catálogo
  de comunidad **no existen todavía** (F49-A dejó solo modelo + validación).
  Sin ellas no hay forma de generar propuestas `pending` desde la web.
- No hay enlace a `/admin/comunidad` desde ningún menú; se accede por URL
  directa. Valorar añadirlo al índice de administración cuando exista.

## Cómo probar

```bash
npx vitest run tests/community-admin.test.ts --maxWorkers=1
```

Manual (con Supabase de desarrollo y `COMMUNITY_ENABLED=true`): entrar como
email en `ADMIN_EMAILS` a `/admin/comunidad`; debe listar las propuestas
`pending` y los perfiles sin verificar. Sin el flag, la ruta debe dar 404.
Un usuario que no sea admin también recibe 404 (no 403, para no revelar la
ruta).
