-- ============================================================
-- Migration 012: Muro de pago real en la base (frente F6)
-- Quita la lectura pública directa de holdings y portfolio_snapshots
-- para anon/authenticated y expone funciones security definer que
-- recortan según el plan de auth.uid().
-- prices sigue público (no es lo premium).
-- 100% idempotente. Bloque -- rollback al final.
-- ============================================================

-- 1. Helper: plan efectivo del usuario autenticado ('anon' si no hay sesión)
create or replace function public.current_user_plan()
returns text
language sql stable
security definer set search_path = ''
as $$
  select coalesce(
    (select p.plan::text from public.profiles p where p.id = auth.uid()),
    'anon'
  );
$$;

-- 2. Helper: límite de posiciones según plan (null = sin límite)
create or replace function public.holdings_limit_for_plan(plan text)
returns integer
language sql immutable
as $$
  select case
    when plan = 'pro' or plan = 'elite' then null
    when plan = 'free' then 10
    else 5  -- anon
  end;
$$;

-- 3. get_portfolio_holdings(p_slug): recorta según el plan.
--    Ordenado por peso descendente (igual que la app).
create or replace function public.get_portfolio_holdings(p_slug text)
returns setof public.holdings
language sql stable
security definer set search_path = ''
as $$
  select h.*
  from public.holdings h
  join public.portfolios p on p.id = h.portfolio_id
  where p.slug = p_slug
    and p.is_active = true
  order by h.weight desc
  limit public.holdings_limit_for_plan(public.current_user_plan());
$$;

-- 4. get_portfolio_snapshots(p_slug): historial completo solo pro/elite.
--    Anon/free no reciben snapshots (el fallback de la app es no dibujar).
create or replace function public.get_portfolio_snapshots(p_slug text)
returns setof public.portfolio_snapshots
language sql stable
security definer set search_path = ''
as $$
  select s.*
  from public.portfolio_snapshots s
  join public.portfolios p on p.id = s.portfolio_id
  where p.slug = p_slug
    and p.is_active = true
    and public.current_user_plan() in ('pro', 'elite')
  order by s.as_of asc;
$$;

-- 5. Quitar la lectura pública directa de holdings y snapshots.
--    (Los clientes con service role siguen pasando; la app usa las funciones
--    de arriba o el cliente de servicio para agregados del servidor.)
drop policy if exists "holdings public read" on public.holdings;

drop policy if exists "snapshots public read" on public.portfolio_snapshots;

-- grants mínimos para que anon/authenticated puedan LLAMAR a las funciones
grant execute on function public.get_portfolio_holdings(text) to anon, authenticated;
grant execute on function public.get_portfolio_snapshots(text) to anon, authenticated;
grant execute on function public.current_user_plan() to anon, authenticated;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop function if exists public.get_portfolio_holdings(text);
-- drop function if exists public.get_portfolio_snapshots(text);
-- drop function if exists public.current_user_plan();
-- drop function if exists public.holdings_limit_for_plan(text);
-- drop policy if exists "holdings public read" on public.holdings;
-- create policy "holdings public read" on public.holdings
--   for select using (true);
-- drop policy if exists "snapshots public read" on public.portfolio_snapshots;
-- create policy "snapshots public read" on public.portfolio_snapshots
--   for select using (true);
-- ============================================================
