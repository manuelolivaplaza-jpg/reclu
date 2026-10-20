-- ============================================================
-- Migración 038 — Comunidad de creadores (F49-A)
--
-- Modelo:
--   * creator_profiles: un perfil por usuario (auth.users). Alias público
--     único, bio, conflicto de interés y declaración de no asesoría.
--   * creator_portfolios: carteras propuestas por el creador. Nacen en
--     `pending`; solo el service_role las aprueba o rechaza.
--
-- Reglas de privacidad / legales:
--   * Lectura pública SOLO de carteras `approved` y del perfil cuando está
--     `verificado` y tiene al menos una cartera aprobada.
--   * El dueño ve y edita lo suyo, pero solo mientras esté `pending`. No
--     puede cambiar `estado`, `verificado`, `moderated_at` ni
--     `moderated_by` (trigger + canal `reclu.trusted`, mismo patrón que 007).
--   * Moderación: únicamente service_role (sin políticas de escritura para
--     anon/authenticated más allá de lo propio).
--
-- La funcionalidad queda APAGADA por defecto en la app (COMMUNITY_ENABLED).
-- Antes de encenderla hace falta revisión legal (Ley Fintec 21.521): no se
-- puede publicar asesoría de inversión ni recomendaciones personalizadas.
--
-- Idempotente: create table/index if not exists, drop policy if exists +
-- create policy, create or replace function, drop trigger if exists.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------
create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  -- Alias público: minúsculas, 3–30, empieza por letra o dígito.
  alias text not null unique
    check (alias ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  bio text not null default ''
    check (char_length(bio) <= 600),
  -- Solo el service_role puede marcarlo tras la revisión.
  verificado boolean not null default false,
  conflicto_interes text
    check (conflicto_interes is null or char_length(conflicto_interes) <= 1000),
  declara_no_asesoria boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.creator_profiles is
  'Perfiles públicos de creadores (F49-A). Un perfil por usuario; verificado solo por moderación.';
comment on column public.creator_profiles.alias is
  'Alias público único. Regex ^[a-z0-9][a-z0-9_-]{2,29}$ (minúsculas, sin espacios).';
comment on column public.creator_profiles.verificado is
  'Solo el service_role lo cambia. La lectura pública exige verificado = true.';
comment on column public.creator_profiles.declara_no_asesoria is
  'El creador declara que su contenido es informativo y no asesoría de inversión.';

create table if not exists public.creator_portfolios (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null
    references public.creator_profiles(id) on delete cascade,
  titulo text not null
    check (char_length(trim(titulo)) between 3 and 120),
  descripcion text not null default ''
    check (char_length(descripcion) <= 2000),
  -- [{ "symbol": "AAPL", "name": "Apple", "weight": 12.5 }, ...]
  holdings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(holdings) = 'array'),
  estado text not null default 'pending'
    check (estado in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null
);

comment on table public.creator_portfolios is
  'Carteras propuestas por creadores (F49-A). Públicas solo en estado approved.';
comment on column public.creator_portfolios.estado is
  'pending | approved | rejected. El dueño no puede cambiarlo: solo service_role modera.';
comment on column public.creator_portfolios.holdings is
  'Array JSON de posiciones {symbol, name?, weight}. Se valida en la app (Zod) antes de insertar.';

create index if not exists idx_creator_portfolios_creator
  on public.creator_portfolios (creator_id);

-- Catálogo público: solo aprobadas y recientes.
create index if not exists idx_creator_portfolios_approved
  on public.creator_portfolios (estado, created_at desc)
  where estado = 'approved';

-- ------------------------------------------------------------
-- 2. Helpers SECURITY DEFINER (evitan recursión de RLS)
--    Las políticas se evalúan con los privilegios del rol que consulta,
--    así que anon/authenticated necesitan EXECUTE en estos dos helpers
--    de solo lectura. No escriben nada.
-- ------------------------------------------------------------
create or replace function public.current_creator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.creator_profiles where user_id = auth.uid();
$$;

create or replace function public.creator_has_approved(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.creator_portfolios
    where creator_id = p_creator_id
      and estado = 'approved'
  );
$$;

revoke execute on function public.current_creator_id() from public;
revoke execute on function public.creator_has_approved(uuid) from public;
grant execute on function public.current_creator_id() to anon, authenticated;
grant execute on function public.creator_has_approved(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Triggers de protección de columnas sensibles
--    service_role, Postgres (auth.role() null) y las funciones que marcan
--    set_config('reclu.trusted','on',true) pasan sin cambios.
-- ------------------------------------------------------------
create or replace function public.protect_creator_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if current_setting('reclu.trusted', true) = 'on' then
    return new;
  end if;
  -- El dueño puede editar alias/bio/conflicto, nunca la verificación.
  new.user_id := old.user_id;
  new.verificado := old.verificado;
  new.created_at := old.created_at;
  return new;
end;
$$;

create or replace function public.protect_creator_portfolio_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if current_setting('reclu.trusted', true) = 'on' then
    return new;
  end if;
  -- El dueño no modera ni mueve la cartera de dueño.
  new.creator_id := old.creator_id;
  new.estado := old.estado;
  new.moderated_at := old.moderated_at;
  new.moderated_by := old.moderated_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Al crear, toda cartera nace pending y sin datos de moderación.
create or replace function public.force_creator_portfolio_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if current_setting('reclu.trusted', true) = 'on' then
    return new;
  end if;
  new.estado := 'pending';
  new.moderated_at := null;
  new.moderated_by := null;
  return new;
end;
$$;

revoke execute on function public.protect_creator_profile_columns() from public, anon, authenticated;
revoke execute on function public.protect_creator_portfolio_columns() from public, anon, authenticated;
revoke execute on function public.force_creator_portfolio_pending() from public, anon, authenticated;

drop trigger if exists protect_creator_profile_columns on public.creator_profiles;
create trigger protect_creator_profile_columns
  before update on public.creator_profiles
  for each row execute function public.protect_creator_profile_columns();

drop trigger if exists force_creator_portfolio_pending on public.creator_portfolios;
create trigger force_creator_portfolio_pending
  before insert on public.creator_portfolios
  for each row execute function public.force_creator_portfolio_pending();

drop trigger if exists protect_creator_portfolio_columns on public.creator_portfolios;
create trigger protect_creator_portfolio_columns
  before update on public.creator_portfolios
  for each row execute function public.protect_creator_portfolio_columns();

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
alter table public.creator_profiles enable row level security;
alter table public.creator_portfolios enable row level security;

-- Perfiles: lectura pública solo si está verificado y tiene una cartera
-- aprobada. El helper es SECURITY DEFINER para no recursar en RLS.
drop policy if exists "creator_profiles public read approved" on public.creator_profiles;
create policy "creator_profiles public read approved"
  on public.creator_profiles
  for select
  using (
    verificado = true
    and public.creator_has_approved(id)
  );

drop policy if exists "creator_profiles owner read" on public.creator_profiles;
create policy "creator_profiles owner read"
  on public.creator_profiles
  for select
  using (auth.uid() = user_id);

drop policy if exists "creator_profiles owner insert" on public.creator_profiles;
create policy "creator_profiles owner insert"
  on public.creator_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "creator_profiles owner update" on public.creator_profiles;
create policy "creator_profiles owner update"
  on public.creator_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Carteras: lectura pública SOLO de aprobadas.
drop policy if exists "creator_portfolios public read approved" on public.creator_portfolios;
create policy "creator_portfolios public read approved"
  on public.creator_portfolios
  for select
  using (estado = 'approved');

-- El dueño ve todas las suyas (pending/approved/rejected).
drop policy if exists "creator_portfolios owner read" on public.creator_portfolios;
create policy "creator_portfolios owner read"
  on public.creator_portfolios
  for select
  using (creator_id = public.current_creator_id());

drop policy if exists "creator_portfolios owner insert" on public.creator_portfolios;
create policy "creator_portfolios owner insert"
  on public.creator_portfolios
  for insert
  to authenticated
  with check (creator_id = public.current_creator_id());

-- Solo se edita mientras está pending (el trigger congela estado/moderación).
drop policy if exists "creator_portfolios owner update" on public.creator_portfolios;
create policy "creator_portfolios owner update"
  on public.creator_portfolios
  for update
  to authenticated
  using (
    creator_id = public.current_creator_id()
    and estado = 'pending'
  )
  with check (creator_id = public.current_creator_id());

-- Se puede retirar una propuesta propia mientras siga pendiente.
drop policy if exists "creator_portfolios owner delete pending" on public.creator_portfolios;
create policy "creator_portfolios owner delete pending"
  on public.creator_portfolios
  for delete
  to authenticated
  using (
    creator_id = public.current_creator_id()
    and estado = 'pending'
  );

-- ------------------------------------------------------------
-- 5. Grants
--    Lectura pública de las columnas publicables. La escritura del dueño
--    pasa por RLS; la moderación queda solo para service_role (que omite
--    RLS y cuyos grants no se tocan).
-- ------------------------------------------------------------
grant select on public.creator_profiles to anon, authenticated;
grant insert, update on public.creator_profiles to authenticated;

grant select on public.creator_portfolios to anon, authenticated;
grant insert, update, delete on public.creator_portfolios to authenticated;

-- Nadie más escribe perfiles/carteras: sin policies de moderación para
-- anon/authenticated, RLS ya lo impide, y no se otorgan grants extra.
