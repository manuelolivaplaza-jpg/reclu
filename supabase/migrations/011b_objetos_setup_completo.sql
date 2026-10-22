-- ============================================================
-- Migration 011b: objetos que solo existían en SETUP-COMPLETO.sql
--
-- Una base creada con schema.sql + migraciones no tenía estos objetos
-- (solo los traía SETUP-COMPLETO.sql) y la 048 fallaba con
-- `relation "public.portfolio_performance" does not exist`.
-- Objetos (copiados tal cual de SETUP-COMPLETO.sql):
--   - tabla public.portfolio_performance
--   - índice idx_portfolio_performance_portfolio_date
--   - RLS + política "performance public read" (la 048 la reemplaza)
-- Grants: SETUP-COMPLETO no los declara (dependía de los privilegios por
-- defecto de Supabase); aquí se dejan explícitos: lectura para anon y
-- authenticated, escritura solo service_role (la llenan los scrapers).
-- Depende solo de public.portfolios (schema.sql). Va después de la 011 y
-- antes de la 012. Idempotente: seguro de re-ejecutar; en una base que ya
-- vino de SETUP-COMPLETO no cambia nada (la política solo se recrea si
-- todavía no corrió la 048).
-- ============================================================

create table if not exists public.portfolio_performance (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  date date not null,
  value_pct numeric(12, 4) not null,
  created_at timestamptz not null default now(),
  unique (portfolio_id, date)
);
create index if not exists idx_portfolio_performance_portfolio_date on public.portfolio_performance(portfolio_id, date);
alter table public.portfolio_performance enable row level security;

-- Política original de SETUP-COMPLETO. Si la 048 ya corrió (existe
-- "performance non premium read"), no se reabre la lectura pública.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'portfolio_performance'
      and policyname = 'performance non premium read'
  ) then
    execute 'drop policy if exists "performance public read" on public.portfolio_performance';
    execute 'create policy "performance public read" on public.portfolio_performance for select using (true)';
  end if;
end $$;

revoke insert, update, delete, truncate on table public.portfolio_performance from anon, authenticated;
grant select on table public.portfolio_performance to anon, authenticated;
grant all on table public.portfolio_performance to service_role;

-- rollback (manual):
-- drop table if exists public.portfolio_performance;
