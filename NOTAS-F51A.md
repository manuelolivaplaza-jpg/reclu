# F51-A — Referidos: base de datos y lógica pura

Rama: `v2/f51a-referidos-base` (desde `mejoras/integracion`). Sin push.
Todo el flujo queda **apagado por defecto**: sólo `REFERRALS_ENABLED=true`
lo enciende.

## Hecho

### 1. `supabase/migrations/039_referidos.sql` (idempotente)

- `public.profiles.referral_code text` (`add column if not exists`) con índice
  único parcial `idx_profiles_referral_code` (ignora `NULL`).
- Backfill determinista de perfiles viejos: 8 hex de `md5(id)` en mayúsculas.
- `public.generate_referral_code()`: 8 caracteres `[A-Z0-9]` desde
  `gen_random_uuid()`, reintenta si colisiona (fallback de 12 hex).
- `public.set_referral_code()` + trigger `z_set_referral_code`
  (`before insert on public.profiles`): rellena el código si falta. Se llama
  `z_...` para correr **después** de `protect_profile_insert` (007), que
  revierte columnas no whitelisteadas a `NULL`.
- Tabla `public.referrals`:
  - `id uuid pk`, `referrer_id → profiles(id)`, `referred_id → auth.users(id)`
    **unique**, `status pending|rewarded`, `created_at`, `rewarded_at`.
  - RLS activa. Única policy: `referrals_select_own` (`select` para
    `authenticated` con `referrer_id = (select auth.uid())`).
  - `revoke all ... from anon` y `revoke insert, update, delete ... from
    authenticated`; `grant select ... to authenticated`. Nadie escribe desde
    el cliente: sólo `service_role` (que salta RLS) y la RPC.
- `public.reward_referral(p_referred uuid)`:
  - `security definer`, `set search_path = ''`.
  - `perform set_config('reclu.trusted','on',true)` (mismo patrón que 008)
    para que `protect_profile_columns` (007) permita tocar `trial_ends_at`.
  - Idempotente: el `update` filtra `status = 'pending'`, así que una segunda
    llamada devuelve `false` y no vuelve a premiar.
  - Rechaza autorreferidos (`referrer_id <> referred_id`) y `p_referred null`.
  - Premia al referrer con **1 mes de Pro** vía `trial_ends_at` (extiende desde
    `max(ahora, vencimiento actual)`) sólo si su plan es `free`; a un plan
    pagado (Pro/Elite) no se le toca la ventana.
  - `revoke execute ... from public, anon, authenticated` y
    `grant execute ... to service_role`.

> Nota: el "unique" de `referral_code` se implementa como índice único parcial
> (mismo efecto que `unique`, admite `NULL` y es idempotente de re-ejecutar).

### 2. `src/lib/referrals.ts`

- `REFERRAL_COOKIE = "reclu_ref"`.
- `REFERRAL_COOKIE_MAX_AGE = 60*60*24*30` (30 días).
- `referralsEnabled()`: `process.env.REFERRALS_ENABLED === "true"` (cualquier
  otro valor, incluido `"TRUE"` o `" true"`, apaga).
- `isValidReferralCode(code)`: regex estricta `/^[A-Za-z0-9]{6,16}$/`.
- `canRefer(referrerId, referredId)`: exige ambos ids y rechaza
  autorreferidos.

### 3. `tests/referrals.test.ts` (17 tests)

- Flag apagado sin variable y sólo `"true"` exacto lo enciende.
- Códigos válidos (6/8/16) e inválidos (largo, guiones, espacios, `Ñ`, no
  strings).
- Autorreferido rechazado; ids faltantes rechazados.
- Cookie: nombre y 30 días.
- Texto de la migración 039: idempotencia (`add column if not exists`,
  `create table if not exists`), RLS/policy/revokes, `security definer` +
  `search_path = ''`, grants de `reward_referral`, premio único
  (`status = 'pending'`, `interval '1 month'`, `reclu.trusted`) y trigger de
  generación de códigos.

## Verificación

Ejecutado en `C:\reclu-work\f14`:

```bash
npm run lint        # OK
npm run typecheck   # OK
npx vitest run --maxWorkers=1   # 50 suites, 598 tests OK
npx vitest run tests/referrals.test.ts --maxWorkers=1  # 17 tests OK
```

No se corrió `next build` (lo hace el orquestador). No se aplicó la migración
a Supabase real ni se levantó el servidor.

## Pendiente / siguiente frente

- Cablear el flujo de producto cuando se active el flag: capturar
  `?ref=CÓDIGO` en una ruta, guardar `REFERRAL_COOKIE`, insertar la fila
  `referrals` (service_role) al crear la cuenta y llamar `reward_referral`
  cuando el referido cumpla la condición de premio.
- UI de invitación (mostrar `referral_code`, copiar link) y listado de
  referidos para el usuario.
- Añadir `REFERRALS_ENABLED` a `.env.example` cuando el frente de producto lo
  active (en esta tarea no se tocaron archivos `.env*`).
- Probar la migración en un proyecto Supabase de staging (re-ejecutarla dos
  veces para confirmar idempotencia real).
