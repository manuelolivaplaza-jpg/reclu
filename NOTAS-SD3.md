# SD3 — Token de baja con expiración y rotación (M5)

Rama `v2/sd3-token-baja`, rebasada sobre `mejoras/integracion` (incluye SD2A/048).
Sin push. Sin Supabase real.

## Hecho

1. **`supabase/migrations/049_token_baja.sql`** (idempotente)
   - Agrega `profiles.unsubscribe_token_created_at timestamptz not null default now()`.
     Las filas existentes reciben la fecha de la migración (los enlaces viejos
     ganan una ventana de 180 días desde que se aplique; no se invalidan de golpe).
   - `create or replace public.unsubscribe_by_token(uuid)` con el mismo contrato:
     `security definer`, `set search_path = ''`, `set_config('reclu.trusted','on',true)`,
     `revoke` a `public/anon/authenticated` y `grant` a `service_role`.
   - Rechaza tokens con más de **180 días** y, al usarse, marca
     `email_unsubscribed = true`, **rota** `unsubscribe_token` con
     `gen_random_uuid()` y renueva `unsubscribe_token_created_at`.
   - Incluye bloque de rollback comentado.

2. **`src/app/api/unsubscribe/route.ts`**
   - `GET` sigue redirigiendo a `/baja?token=…` (página de confirmación) y **no**
     llama la RPC: inmune al prefetch de clientes de correo.
   - `POST` acepta el token en el **cuerpo del formulario** (campo `token`) y,
     por compatibilidad, en el query solo para `List-Unsubscribe-Post`
     (`List-Unsubscribe=One-Click`, que no admite cuerpo propio). Ese caso
     responde `200 {ok:true}`; el formulario humano recibe `303 /baja?ok=1`.
   - Token malformado, vencido o ya usado → mensaje **genérico**
     («No pudimos procesar la baja. Usa el enlace del último correo.»). El
     formulario vuelve a `/baja?error=1`; One-Click recibe `400` JSON.

3. **`src/app/baja/page.tsx`**
   - El form hace `POST /api/unsubscribe` con `token` y `confirm` ocultos
     (el token ya no va en el `action`).
   - Nuevo estado `?error=1` con el mensaje genérico.

4. **`tests/unsubscribe.test.ts`** (7 tests, sin tocar Supabase real)
   - GET válido/inválido: redirige y no llama la RPC.
   - POST de formulario: token en el cuerpo, `303 /baja?ok=1`, RPC con `p_token`.
   - POST One-Click: token en query, `200 {ok:true}`.
   - Token inválido: no llama la RPC y muestra mensaje genérico.
   - RPC `false` (vencido/rotado): mensaje genérico, tanto en form como One-Click.

## Verificación

```
npx vitest run --maxWorkers=1 tests/unsubscribe.test.ts   # 7/7
npx vitest run --maxWorkers=1                            # 54 archivos / 628 tests
npm run lint                                             # ok
npm run typecheck                                        # falla SOLO por LayoutProps
```

`npm run typecheck` falla con `src/app/layout.tsx(63,50): Cannot find name
'LayoutProps'`. Es el error preexistente documentado en `AGENTS.md`: ese tipo
lo genera el build de Next 16; `tsc` aislado no lo ve. No lo introduce este
frente y no se tocó `layout.tsx`.

## Pendiente / notas para integrar

- Aplicar `049_token_baja.sql` en la base real (lo hace el orquestador/Manu).
  Tras aplicarla, un enlace de un correo anterior sigue sirviendo una vez
  (180 días desde la migración); al confirmar se rota y el mismo enlace deja
  de funcionar.
- `supabase/functions/send-alerts` no requiere cambios: arma
  `…/api/unsubscribe?token=…`, que sigue siendo la URL del header One-Click.
  El enlace visible del correo también apunta ahí; al abrirlo se muestra la
  confirmación y solo el POST ejecuta la baja.
- No se agregó un job de limpieza de tokens vencidos: no hace falta, la
  función los rechaza por fecha.
- Fecha de expiración fija en 180 días (constante en la migración). Si se
  quiere configurable, habría que pasarla a una tabla de settings.
