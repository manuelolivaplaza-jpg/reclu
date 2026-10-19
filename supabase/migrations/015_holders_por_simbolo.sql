-- ============================================================
-- Migration 015: Holders por símbolo respetando el muro de pago (F9)
--
-- La página /accion/[symbol] necesita saber qué carteras tienen un
-- símbolo, pero la 012 quitó la lectura pública directa de holdings.
-- Esta función security definer entrega las filas del símbolo ya
-- recortadas según el plan de auth.uid():
--   - solo carteras activas;
--   - solo si la posición está en el top N visible del plan
--     (rank por weight desc dentro del as_of más reciente de la cartera);
--   - carteras premium solo para planes pagados (pro/elite).
-- 100% idempotente. Bloque -- rollback al final.
-- ============================================================

create or replace function public.get_symbol_holders(p_symbol text)
returns table (
  portfolio_id uuid,
  slug text,
  name text,
  category text,
  premium boolean,
  weight numeric,
  as_of date,
  previous_weight numeric,
  first_seen date,
  holding_name text,
  price_current numeric,
  currency text,
  return_pct numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with visibles as (
    select
      h.portfolio_id,
      h.weight,
      h.previous_weight,
      h.as_of,
      h.name as holding_name,
      h.price_current,
      h.currency,
      h.return_pct,
      row_number() over (
        partition by h.portfolio_id, h.as_of
        order by h.weight desc, h.id
      ) as rank_in_day,
      min(h.as_of) over (partition by h.portfolio_id) as first_seen
    from public.holdings h
    where upper(btrim(h.symbol)) = upper(btrim(p_symbol))
  ),
  vigentes as (
    select
      v.*,
      max(v.as_of) over (partition by v.portfolio_id) as max_as_of
    from visibles v
  )
  select
    g.portfolio_id,
    p.slug,
    p.name,
    p.category,
    p.premium,
    g.weight,
    g.as_of,
    g.previous_weight,
    g.first_seen,
    g.holding_name,
    g.price_current,
    g.currency,
    g.return_pct
  from vigentes g
  join public.portfolios p on p.id = g.portfolio_id
  where g.as_of = g.max_as_of
    and p.is_active = true
    and (
      public.holdings_limit_for_plan(public.current_user_plan()) is null
      or g.rank_in_day <= public.holdings_limit_for_plan(public.current_user_plan())
    )
    and (
      not p.premium
      or public.current_user_plan() in ('pro', 'elite')
    )
  order by g.weight desc, p.name asc;
$$;

grant execute on function public.get_symbol_holders(text) to anon, authenticated;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop function if exists public.get_symbol_holders(text);
-- ============================================================
