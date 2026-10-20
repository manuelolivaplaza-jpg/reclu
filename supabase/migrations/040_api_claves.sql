-- ============================================================
-- Migracion 040 (F53): claves de API y limite por plan.
--
-- 1) `api_keys`: una fila por clave emitida. NUNCA se guarda la clave en
--    claro: solo `key_hash` (sha256 hex, 64) y `prefix` (identificador
--    publico que se muestra en Ajustes, sin poder usarse como clave).
-- 2) `api_usage`: contador diario por clave (`day` + `count`). El servidor
--    lo incrementa con el service role; nadie mas lo toca.
--
-- El flag `API_PUBLIC_ENABLED` sigue apagado por defecto: la migracion
-- solo deja las tablas listas, no publica ningun endpoint.
--
-- Idempotente: `if not exists`, `create or replace`, `drop policy if exists`
-- y `drop constraint if exists` antes de recrear.
-- Aplicar despues de 039_referidos.sql (usa auth.users, profiles.plan).
--
-- ROLLBACK (manual, a conciencia):
--   drop table if exists public.api_usage;
--   drop table if exists public.api_keys;
-- ============================================================

-- ------------------------------------------------------------
-- api_keys
-- ------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  -- Dueno de la clave. Se borra en cascada con la cuenta (Ley 19.628:
  -- minimo de datos y sin restos al cerrar la cuenta).
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Etiqueta libre para que la persona reconozca la clave ("mi bot").
  name text not null default 'Clave sin nombre'
    check (char_length(name) between 1 and 60),
  -- Identificador publico: `rcl_` + 12 hex. Visible en la UI y en logs;
  -- por si solo no permite autenticarse.
  prefix text not null unique
    check (prefix ~ '^rcl_[a-f0-9]{12}$'),
  -- sha256 en hex de la clave completa. Jamas la clave en claro.
  key_hash text not null unique
    check (key_hash ~ '^[a-f0-9]{64}$'),
  -- Plan vigente al emitir. Se puede ajustar despues (p. ej. al cambiar
  -- de plan) sin reemitir la clave.
  plan text not null default 'free'
    check (plan in ('free', 'pro', 'elite')),
  revoked boolean not null default false,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Una clave revocada no puede "resucitar" sin dejar constancia: si se
-- des-revoca a mano, se limpia revoked_at en el mismo UPDATE.
alter table public.api_keys
  drop constraint if exists api_keys_revoked_at_ck;
alter table public.api_keys
  add constraint api_keys_revoked_at_ck
  check (revoked or revoked_at is null);

create index if not exists api_keys_user_idx
  on public.api_keys (user_id, created_at desc);

alter table public.api_keys enable row level security;

-- La persona ve solo sus claves (la UI nunca pide key_hash). Escritura:
-- exclusivamente service role desde el server action que valida la sesion.
drop policy if exists "own api keys read" on public.api_keys;
create policy "own api keys read"
  on public.api_keys for select
  using (auth.uid() = user_id);

revoke all on table public.api_keys from anon, authenticated;
grant select on table public.api_keys to authenticated;

-- ------------------------------------------------------------
-- api_usage
-- ------------------------------------------------------------
create table if not exists public.api_usage (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  -- Dia UTC (`YYYY-MM-DD`): mismo criterio que `apiDayKey()` en
  -- src/lib/api-keys.ts, para que TS y base no discrepen a medianoche.
  day date not null,
  count integer not null default 0
    check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_id, day)
);

create index if not exists api_usage_day_idx
  on public.api_usage (day);

alter table public.api_usage enable row level security;

-- Sin policies: solo el service role (bypassa RLS) lee y escribe.
revoke all on table public.api_usage from anon, authenticated;

-- ------------------------------------------------------------
-- Helper de consumo (opcional, para el endpoint que use la API).
-- Suma 1 al dia y devuelve el conteo resultante. security definer para
-- que el service role no dependa de RLS y para centralizar el UPSERT.
-- ------------------------------------------------------------
create or replace function public.consume_api_usage(p_key_id uuid, p_day date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.api_usage as u (key_id, day, count, updated_at)
  values (p_key_id, p_day, 1, now())
  on conflict (key_id, day) do update
    set count = u.count + 1,
        updated_at = now()
  returning u.count into v_count;

  return v_count;
end;
$$;

revoke execute on function public.consume_api_usage(uuid, date)
  from public, anon, authenticated;
grant execute on function public.consume_api_usage(uuid, date)
  to service_role;
