-- ============================================================
-- Migration 048: Muro de series, metricas y alertas (M6/M7)
--
-- Cierra los hallazgos M6 y M7 de docs/revision-seguridad-2026-10-20.md
-- replicando el patron de 012_muro_pago.sql:
--   - portfolio_performance y portfolio_metrics dejan de ser de lectura
--     publica para portafolios premium. Por REST anon/authenticated solo
--     ven filas de portafolios NO premium y activos.
--   - Lo premium se sirve por RPC security definer que recorta segun el
--     plan efectivo de auth.uid() (public.current_user_plan(), de la 012):
--       * get_portfolio_performance(p_portfolio): premium y no pago => vacio;
--         anon/free => ultimos 90 dias; pro/elite => serie completa.
--       * get_portfolio_metrics(p_portfolio): premium y no pago => vacio.
--       * get_alerts(p_portfolio, p_limit): solo publicadas; premium y no
--         pago => ninguna; summary solo pro/elite; tope 3 (anon) / 10 (free)
--         / p_limit (pago, max 100).
--   - alerts: la lectura publica queda solo para alertas publicadas de
--     portafolios NO premium, y la columna summary se quita del privilegio
--     de lectura directa (solo la RPC la devuelve, y solo a pago). Se agrega
--     la vista public.alerts_public (security_invoker) sin summary.
--
-- 100% idempotente. Bloque -- rollback al final.
-- Aplicar despues de 012 (usa current_user_plan) y de 011 (portfolio_metrics).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Series y metricas: lectura directa solo para portafolios NO premium.
--    (La app con service role sigue pasando; anon/authenticated pasan por
--    RLS y, para lo premium, por las RPC de abajo.)
-- ------------------------------------------------------------

-- portfolio_performance (creada en SETUP-COMPLETO/schema.sql)
drop policy if exists "performance public read" on public.portfolio_performance;
drop policy if exists "performance non premium read" on public.portfolio_performance;
create policy "performance non premium read" on public.portfolio_performance
  for select using (
    exists (
      select 1
      from public.portfolios p
      where p.id = portfolio_performance.portfolio_id
        and p.is_active = true
        and not p.premium
    )
  );

-- portfolio_metrics (creada en 011_rendimiento.sql)
drop policy if exists "portfolio_metrics public read" on public.portfolio_metrics;
drop policy if exists "portfolio_metrics non premium read" on public.portfolio_metrics;
create policy "portfolio_metrics non premium read" on public.portfolio_metrics
  for select using (
    exists (
      select 1
      from public.portfolios p
      where p.id = portfolio_metrics.portfolio_id
        and p.is_active = true
        and not p.premium
    )
  );

-- ------------------------------------------------------------
-- 2. RPC de series con recorte por plan (patron 012).
-- ------------------------------------------------------------

-- 2.1 Serie de rendimiento (portfolio_performance).
--     - premium + plan no pago => sin filas.
--     - anon/free => solo los ultimos 90 dias de la serie (contados desde su
--       ultimo punto, igual que trimSeriesToWindow en src/lib/backtest-window.ts).
--     - excepcion legal: las declaraciones publicas (oge_278t, house_ptr,
--       senate_ptr) no son premium y se entregan completas.
--     - pro/elite => serie completa.
create or replace function public.get_portfolio_performance(p_portfolio uuid)
returns setof public.portfolio_performance
language sql stable
security definer set search_path = ''
as $$
  with corte as (
    select max(x.date) as ultimo
    from public.portfolio_performance x
    where x.portfolio_id = p_portfolio
  )
  select perf.*
  from public.portfolio_performance perf
  join public.portfolios p on p.id = perf.portfolio_id
  cross join corte
  where perf.portfolio_id = p_portfolio
    and p.is_active = true
    and (
      public.current_user_plan() in ('pro', 'elite')
      or (
        not p.premium
        and (
          p.source in ('oge_278t', 'house_ptr', 'senate_ptr')
          or perf.date >= (corte.ultimo - 90)
        )
      )
    )
  order by perf.date asc;
$$;

-- 2.2 Metricas de rendimiento (portfolio_metrics).
--     - premium + plan no pago => sin filas.
--     - resto (incluido gratis sobre portafolios no premium) => todo.
create or replace function public.get_portfolio_metrics(p_portfolio uuid)
returns setof public.portfolio_metrics
language sql stable
security definer set search_path = ''
as $$
  select m.*
  from public.portfolio_metrics m
  join public.portfolios p on p.id = m.portfolio_id
  where m.portfolio_id = p_portfolio
    and p.is_active = true
    and (
      not p.premium
      or public.current_user_plan() in ('pro', 'elite')
    )
  order by m.as_of desc, m.period asc;
$$;

-- 2.3 Alertas publicadas segun plan.
--     - premium + plan no pago => ninguna.
--     - summary solo pro/elite (null para anon/free).
--     - tope: anon 3, free 10, pago p_limit (max 100).
create or replace function public.get_alerts(
  p_portfolio uuid default null,
  p_limit integer default 20
)
returns setof public.alerts
language sql stable
security definer set search_path = ''
as $$
  select
    a.id,
    a.portfolio_id,
    a.type,
    a.severity,
    a.title,
    case
      when public.current_user_plan() in ('pro', 'elite') then a.summary
      else null
    end as summary,
    a.payload,
    a.is_published,
    a.created_at
  from public.alerts a
  join public.portfolios p on p.id = a.portfolio_id
  where a.is_published = true
    and p.is_active = true
    and (
      not p.premium
      or public.current_user_plan() in ('pro', 'elite')
    )
    and (p_portfolio is null or a.portfolio_id = p_portfolio)
  order by a.created_at desc
  limit case
    when public.current_user_plan() in ('pro', 'elite')
      then least(coalesce(p_limit, 20), 100)
    when public.current_user_plan() = 'free' then 10
    else 3
  end;
$$;

-- 2.4 Grants: solo llamables, nunca desde public.
revoke all on function public.get_portfolio_performance(uuid) from public;
revoke all on function public.get_portfolio_metrics(uuid) from public;
revoke all on function public.get_alerts(uuid, integer) from public;

grant execute on function public.get_portfolio_performance(uuid) to anon, authenticated;
grant execute on function public.get_portfolio_metrics(uuid) to anon, authenticated;
grant execute on function public.get_alerts(uuid, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Alertas: lectura publica sin premium y sin resumen AI.
-- ------------------------------------------------------------

-- 3.1 RLS: solo publicadas de portafolios NO premium y activos.
drop policy if exists "alerts public read" on public.alerts;
drop policy if exists "alerts non premium read" on public.alerts;
create policy "alerts non premium read" on public.alerts
  for select using (
    is_published = true
    and exists (
      select 1
      from public.portfolios p
      where p.id = alerts.portfolio_id
        and p.is_active = true
        and not p.premium
    )
  );

-- 3.2 Vista publica sin la columna summary. security_invoker = true para
--     que herede la RLS de alerts (no la del dueno de la vista).
create or replace view public.alerts_public
with (security_invoker = true) as
select
  a.id,
  a.portfolio_id,
  a.type,
  a.severity,
  a.title,
  a.payload,
  a.is_published,
  a.created_at
from public.alerts a;

revoke all on public.alerts_public from public;
grant select on public.alerts_public to anon, authenticated;

-- 3.3 summary fuera del privilegio de lectura directa:
--     solo get_alerts() lo entrega, y solo a pro/elite.
revoke select (summary) on table public.alerts from anon, authenticated;

-- OJO: en Postgres un grant a nivel de tabla tapa al grant de columna.
-- Para que el revoke de arriba tenga efecto hay que quitar el select de
-- tabla y re-otorgar solo las columnas publicas.
revoke select on table public.alerts from anon, authenticated;
grant select (
  id, portfolio_id, type, severity, title, payload, is_published, created_at
) on table public.alerts to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Cerrar el bypass de la vista 011 (v_beat_the_market lee
--    portfolio_metrics y, sin security_invoker, saltaba la RLS).
--    Guardado por si la vista no existe todavia.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.v_beat_the_market') is not null then
    execute 'alter view public.v_beat_the_market set (security_invoker = true)';
  end if;
end $$;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop function if exists public.get_alerts(uuid, integer);
-- drop function if exists public.get_portfolio_metrics(uuid);
-- drop function if exists public.get_portfolio_performance(uuid);
-- drop view if exists public.alerts_public;
-- grant select on table public.alerts to anon, authenticated;
-- drop policy if exists "alerts non premium read" on public.alerts;
-- create policy "alerts public read" on public.alerts
--   for select using (is_published = true);
-- drop policy if exists "portfolio_metrics non premium read" on public.portfolio_metrics;
-- create policy "portfolio_metrics public read" on public.portfolio_metrics
--   for select using (true);
-- drop policy if exists "performance non premium read" on public.portfolio_performance;
-- create policy "performance public read" on public.portfolio_performance
--   for select using (true);
-- alter view public.v_beat_the_market reset (security_invoker);
-- ============================================================
