-- ============================================================
-- Migration 050: Mi portafolio (F58)
--
-- Base de datos para docs/mi-portafolio-ia.md:
--   1) user_holdings gana cantidad, costo promedio, moneda, mercado y
--      corredora, y el origen admite 'cartola'. El peso (weight) se mantiene
--      para no romper /compare y la alineación.
--   2) user_portfolio_settings: preferencias del usuario (alertas automáticas
--      APAGADAS por defecto, umbral de relevancia, canal y consentimiento
--      explícito).
--   3) delete_my_portfolio(): borra la cartera y los ajustes del usuario y
--      devuelve cuántas filas borró (derecho de supresión).
--
-- 100% idempotente (add column if not exists, create table if not exists,
-- create or replace, drop policy/trigger if exists). No hay vistas públicas:
-- los datos de cartera son personales y solo los ve su dueño.
-- Aplicar después de schema.sql (usa set_updated_at y auth.users).
-- Bloque -- rollback al final.
-- ============================================================

-- ------------------------------------------------------------
-- 1. user_holdings: cantidad, costo, moneda, mercado y corredora.
--    Los checks van inline: si la columna ya existe, el ADD COLUMN
--    IF NOT EXISTS se salta entero y no duplica constraints.
-- ------------------------------------------------------------
alter table public.user_holdings
  add column if not exists quantity numeric(20, 6)
    check (quantity is null or quantity >= 0),
  add column if not exists avg_cost numeric(20, 6)
    check (avg_cost is null or avg_cost >= 0),
  add column if not exists currency text not null default 'USD'
    check (currency in ('USD', 'CLP')),
  add column if not exists market text
    check (market is null or market in ('US', 'CL')),
  add column if not exists broker text
    check (broker is null or char_length(broker) <= 60);

-- Origen de la posición: la importación manual/CSV y la cartola de corredora.
-- El constraint inline del schema.sql se llama user_holdings_source_check
-- (Postgres lo nombra <tabla>_<columna>_check). Se recrea para mantener el
-- nombre estable y ampliar la lista.
alter table public.user_holdings
  drop constraint if exists user_holdings_source_check;
alter table public.user_holdings
  add constraint user_holdings_source_check
  check (source in ('csv', 'manual', 'cartola'));

-- La RLS existente se mantiene: cada usuario ve y edita solo lo suyo.
alter table public.user_holdings enable row level security;

drop policy if exists "own holdings all" on public.user_holdings;
create policy "own holdings all" on public.user_holdings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sin acceso anónimo ni lectura pública: la cartera es dato personal.
revoke all on table public.user_holdings from anon;
grant select, insert, update, delete on table public.user_holdings to authenticated;
grant all on table public.user_holdings to service_role;

-- ------------------------------------------------------------
-- 2. user_portfolio_settings: preferencias y consentimiento.
--    auto_alerts parte en false: las alertas automáticas son opt-in.
--    consent_at null = todavía no dio consentimiento explícito.
-- ------------------------------------------------------------
create table if not exists public.user_portfolio_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_alerts boolean not null default false,
  min_relevance numeric(4, 3) not null default 0.5
    check (min_relevance >= 0 and min_relevance <= 1),
  alert_channel text not null default 'email'
    check (alert_channel in ('email', 'telegram', 'both')),
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_portfolio_settings enable row level security;

drop policy if exists "own portfolio settings read" on public.user_portfolio_settings;
create policy "own portfolio settings read"
  on public.user_portfolio_settings for select
  using (auth.uid() = user_id);

drop policy if exists "own portfolio settings insert" on public.user_portfolio_settings;
create policy "own portfolio settings insert"
  on public.user_portfolio_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "own portfolio settings update" on public.user_portfolio_settings;
create policy "own portfolio settings update"
  on public.user_portfolio_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own portfolio settings delete" on public.user_portfolio_settings;
create policy "own portfolio settings delete"
  on public.user_portfolio_settings for delete
  using (auth.uid() = user_id);

revoke all on table public.user_portfolio_settings from public, anon;
grant select, insert, update, delete on table public.user_portfolio_settings to authenticated;
grant all on table public.user_portfolio_settings to service_role;

drop trigger if exists set_user_portfolio_settings_updated_at
  on public.user_portfolio_settings;
create trigger set_user_portfolio_settings_updated_at
  before update on public.user_portfolio_settings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. delete_my_portfolio(): derecho de supresión del usuario.
--    security invoker + search_path vacío: solo puede borrar lo que la RLS
--    le permite, es decir auth.uid(). No toca datos de terceros.
--    Devuelve el total de filas borradas (tenencias + ajustes).
-- ------------------------------------------------------------
create or replace function public.delete_my_portfolio()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_holdings integer := 0;
  v_settings integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  delete from public.user_holdings
   where user_id = auth.uid();
  get diagnostics v_holdings = row_count;

  delete from public.user_portfolio_settings
   where user_id = auth.uid();
  get diagnostics v_settings = row_count;

  return v_holdings + v_settings;
end;
$$;

revoke all on function public.delete_my_portfolio() from public;
revoke all on function public.delete_my_portfolio() from anon;
grant execute on function public.delete_my_portfolio() to authenticated;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop function if exists public.delete_my_portfolio();
-- drop trigger if exists set_user_portfolio_settings_updated_at
--   on public.user_portfolio_settings;
-- drop table if exists public.user_portfolio_settings;
-- alter table public.user_holdings
--   drop constraint if exists user_holdings_source_check;
-- alter table public.user_holdings
--   add constraint user_holdings_source_check
--   check (source in ('csv', 'manual'));
-- alter table public.user_holdings
--   drop column if exists broker,
--   drop column if exists market,
--   drop column if exists currency,
--   drop column if exists avg_cost,
--   drop column if exists quantity;
-- ============================================================
