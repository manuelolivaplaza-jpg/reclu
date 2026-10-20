# F51-B — Referidos: cookie, signup, recompensa y tarjeta

Rama: `v2/f51b-referidos-flujo` (desde `mejoras/integracion`, con F51-A ya
integrada). Sin push, sin Supabase real, sin servidores. Todo el flujo queda
apagado por defecto: sólo `REFERRALS_ENABLED=true` (exacto) lo enciende.

## Hecho

### 1. Cookie de referido en el proxy

`src/lib/supabase/middleware.ts` (el entry es `src/proxy.ts`):

- `withReferralCookie(request, response)` corre **sólo** si
  `referralsEnabled()`.
- Lee `?ref=` y exige `isValidReferralCode()` (6-16 alfanuméricos). Códigos
  inválidos o ausentes no escriben nada.
- Cookie `reclu_ref` (`REFERRAL_COOKIE`): `httpOnly`, `sameSite=lax`,
  `path=/`, `maxAge=30 días`, `secure` automático en https.
- Se aplica también a las respuestas de redirect (login de rutas protegidas y
  rebote de `/login`/`/signup` con sesión) para no perder la atribución.
- Se eliminó el bloque viejo que guardaba una cookie `ref` sin flag ni
  validación (M3).

### 2. Alta del vínculo en el signup

`src/app/actions/auth.ts`:

- Tras `supabase.auth.signUp` exitoso y con `data.user`, si hay cookie válida y
  el flag está encendido, `recordReferral(user.id, code)` con
  `getServiceClient()` (service role, `src/lib/supabase/service.ts`).
- Resuelve el patrocinador por `profiles.referral_code` (normaliza a
  mayúsculas), inserta `{ referrer_id, referred_id }` en `referrals`.
- Rechaza autorreferidos con `canRefer()` y traga duplicados (`23505`).
- Cualquier fallo (sin service role, código inexistente, error de insert) se
  loguea y **no** altera la respuesta: el mensaje genérico de M9 sigue igual.
- Se dejó de enviar `referred_by` en la metadata del signUp: el vínculo ahora
  lo crea explícitamente este código (así el trigger legado de la migración
  009, si estuviera aplicado, no duplica filas).

### 3. Recompensa en el primer pago

`src/lib/billing/completer.ts`:

- `rewardReferralOnFirstPayment(referredId)`: con el flag apagado retorna sin
  tocar Supabase. Con flag, busca la fila `referrals` del invitado en estado
  `pending`; si existe, llama
  `rpc("reward_referral", { p_referred })` con el cliente de servicio.
  Cualquier error se loguea y no se propaga.

`src/lib/billing/process.ts`:

- En el camino normal de pago, cuando el estado verificado queda `active`, se
  llama `rewardReferralOnFirstPayment(sub.user_id)`.
- Se reemplazó el `applyReferralReward` legado (que hacía un `update` a columnas
  inexistentes en la 039: `reward_applied`, `reward_period_end`) por la RPC.
  La idempotencia la da la base (`status = 'pending'`), por lo que el segundo
  pago no vuelve a premiar. El resto de la lógica de pago no cambió.
- `src/lib/billing/supabase-admin.ts` exporta `BillingServiceClient` (alias de
  `SupabaseClient`) para firmas/tests.

### 4. Tarjeta de invitación en Ajustes

- `src/components/referral-card.tsx` (client): código, enlace
  `<siteUrl>/?ref=<code>` en input de sólo lectura y botón "Copiar enlace".
  Estética Autopilot: `Card` con filete 1px, sin sombras, píldora outline,
  tipografía como diseño.
- `src/app/(dashboard)/settings/page.tsx`: renderiza la tarjeta **sólo** si
  `referralsEnabled()` y `profile.referral_code` existe. Texto: un mes de Pro
  para el patrocinador cuando el invitado activa su primer pago.
- `src/lib/types.ts`: `Profile.referral_code?: string | null` (columna 039;
  `getProfile` usa `select("*")`, no hizo falta tocar queries).

### 5. Tests

`tests/referrals-flow.test.ts` (12 tests, nuevo):

- Cookie: flag apagado → sin cookie; flag on + `?ref=ABC123` → cookie 30 días,
  `httpOnly`, `lax`, `path=/`; código inválido → sin cookie.
- Recompensa: flag apagado → ni lookup ni RPC; primer pago → `reward_referral`
  una vez con `{ p_referred }`; segundo pago → sigue en una; RPC con error →
  no lanza.
- Signup: flag apagado → sin insert; flag on + cookie → insert con
  `referrer_id`/`referred_id`; autorreferido → sin insert; error de insert →
  signup exitoso y mensaje intacto; error de Supabase → mensaje genérico y sin
  insert.

## Verificación (en `C:\reclu-work\f14`)

```bash
npm run lint                    # OK
npm run typecheck               # OK
npx vitest run --maxWorkers=1   # 53 archivos, 617 tests OK
```

No se corrió `next build` (lo hace el orquestador), no se aplicó la migración a
Supabase real y no se levantó el servidor.

## Pendiente / notas para el orquestador

- Probar el flujo completo en staging con la 039 aplicada: `?ref=CODIGO` →
  signup → primer pago (`reward_referral`) → `trial_ends_at` del patrocinador.
- `REFERRALS_ENABLED` no se agregó a `.env.example` (la tarea prohíbe tocar
  `.env*`). Hay que documentarla al activar el flag.
- El alta con Google OAuth (`signInWithGoogle` + `/auth/callback`) no pasa por
  `signUp`, así que hoy no registra referidos. Si se quiere cubrir, el insert
  debe moverse/duplicarse en el callback, después de crear la sesión.
- La cookie no se borra tras registrar el referido; el `unique` de
  `referred_id` y el chequeo de `pending` evitan duplicados.
- La migración 009 define un trigger legado (`handle_referral_code`) que
  insertaba en `referrals` con metadata `referred_by`; dejamos de enviar esa
  metadata, pero conviene confirmar en staging que la tabla `referrals` real es
  la de la 039 (mismas columnas) antes de encender el flag.

---

# F51-C — Reconciliación de referidos con el esquema de la 009

Rama: `v2/f51c-referidos-reconciliar` (worktree `C:\reclu-work\f14`). Sin push,
sin Supabase real, sin servidores.

**La 009 es la fuente de verdad.** Todo lo de F51-A/B que duplicaba su esquema
quedó eliminado. La sección F51-B de arriba se conserva como historial; donde
menciona `profiles.referral_code` o `recordReferral`, ya no aplica.

## Hecho

### 1. `supabase/migrations/039_referidos.sql` (reescrita)

- Eliminado: `profiles.referral_code`, su índice/backfill,
  `generate_referral_code()`, `set_referral_code()` y el trigger
  `z_set_referral_code`.
- Eliminado el `create table if not exists public.referrals` y su policy
  duplicada: la tabla, `referral_codes`, el trigger `handle_referral_code` y la
  policy "own referrals read" viven en la 009.
- Conserva/añade:
  - Bloque `do $$` que agrega `unique (referred_id)` (constraint
    `referrals_referred_id_key`) sólo si no existe ya un índice único de una
    columna sobre `referred_id`. Usa `to_regclass` para no fallar sin la 009.
  - `revoke all ... from anon`, `revoke insert, update, delete ... from
    authenticated`, `grant select ... to authenticated`.
  - `reward_referral(p_referred uuid)` igual que antes: `security definer`,
    `search_path = ''`, `set_config('reclu.trusted','on',true)`, idempotente por
    `status = 'pending'`, rechaza autorreferidos y extiende `trial_ends_at` un
    mes sólo si el patrocinador sigue en `free`.
  - **Nuevo:** además de `status/rewarded_at`, marca
    `reward_applied = 'free_month'` y `reward_period_end` (un mes desde el
    vencimiento actual o ahora).
  - `revoke execute ... from public, anon, authenticated` y
    `grant execute ... to service_role`.

### 2. `src/lib/referrals.ts`

- `REFERRAL_CODE_RE = /^[a-z0-9]{3,6}-[a-f0-9]{4}$/`, el formato de la 009
  (`manuel-ab12`).
- `normalizeReferralCode(code)`: `trim` + `toLowerCase`; null si no cumple.
- `isValidReferralCode(code)`: usa la normalización, así acepta
  `" Manuel-AB12 "`.

### 3. `src/lib/supabase/middleware.ts`

- La cookie `reclu_ref` guarda el código **normalizado** (minúsculas), para que
  el trigger de la 009 lo resuelva en `referral_codes`.

### 4. `src/app/actions/auth.ts`

- Eliminado `recordReferral()` y el uso de `getServiceClient()`: ya no hay
  insert desde el server action.
- Si hay cookie válida y `referralsEnabled()`, el signup manda
  `referred_by: <codigo>` dentro de `options.data`. El trigger
  `handle_referral_code` de la 009 crea la fila `referrals` (con
  `referral_code` no nulo) y el código del usuario nuevo.
- El mensaje genérico de M9 no cambió.

### 5. Ajustes y tarjeta

- `src/app/(dashboard)/settings/page.tsx` lee el código propio de
  `referral_codes` con el cliente del usuario (`select code where user_id`),
  amparado por la RLS "own referral code read". Sólo consulta con el flag
  encendido.
- `src/components/referral-card.tsx`: sólo se actualizó el comentario; el
  componente ya recibía el código por props.
- `src/lib/types.ts`: eliminado `Profile.referral_code` (la columna ya no
  existe).

### 6. Tests

- `tests/referrals.test.ts` (19 tests): formato/longitudes de la 009,
  normalización, y texto de la 039 (sin duplicados de la 009, `do $$` con
  unique, revokes, RPC con `free_month`/`reward_period_end`).
- `tests/referrals-flow.test.ts`: cookie con formato nuevo y normalización;
  signup verifica `referred_by` en metadata (flag apagado, cookie inválida,
  error genérico); se eliminaron los tests del insert/service role.
- `tests/billing.test.ts` sigue verde sin cambios.

## Verificación (en `C:\reclu-work\f14`)

```bash
npm run lint                    # OK
npm run typecheck               # OK
npx vitest run --maxWorkers=1   # 53 archivos, 618 tests OK
npx vitest run tests/referrals.test.ts tests/referrals-flow.test.ts tests/billing.test.ts --maxWorkers=1  # 46 OK
```

No se corrió `next build` (lo hace el orquestador), no se aplicó ninguna
migración a Supabase real y no se levantó el servidor.

## Pendiente / notas

- Probar en staging con 009 + 039 aplicadas: `?ref=manuel-ab12` → cookie →
  signup (`referred_by`) → trigger crea `referral_codes` + `referrals` →
  primer pago (`reward_referral`) → `trial_ends_at`, `reward_applied` y
  `reward_period_end`.
- Google OAuth (`signInWithGoogle` + `/auth/callback`) no pasa por `signUp`, así
  que hoy no manda `referred_by`. Cubrirlo requeriría mover la metadata al
  callback (fuera de alcance).
- `REFERRALS_ENABLED` sigue sin documentarse en `.env.example` (prohibido tocar
  `.env*` en esta tarea).
- La cookie no se borra tras el signup. El trigger de la 009 usa
  `unique (referrer_id, referred_id)`; el nuevo unique por `referred_id` impide
  además que un invitado quede atribuido a dos patrocinadores.
