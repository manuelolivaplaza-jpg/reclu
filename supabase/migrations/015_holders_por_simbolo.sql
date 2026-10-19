-- ============================================================
-- Migration 015: Holders por símbolo respetando el muro de pago (F9)
--
-- La página /accion/[symbol] necesita saber qué carteras tienen un
-- símbolo, pero la 012 quitó la lectura pública directa de holdings.
-- Esta función security definer entrega las filas del símbolo ya
-- recortadas según el plan de auth.uid():
--   - solo carteras activas;
--   - el rank se calcula sobre TODAS las posiciones del as_of más
--     reciente de la cartera (weight desc, id) y recién después se
--     filtra por símbolo. Rankear solo las filas del símbolo deja el
--     rank en 1 y el anónimo ve posiciones fuera de su top N;
--   - la fila se entrega solo si ese rank cabe en
--     holdings_limit_for_plan(current_user_plan()) (null = sin límite);
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
  with latest as (
    -- as_of vigente de cada cartera activa, sobre todos sus holdings.
    select h.portfolio_id, max(h.as_of) as max_as_of
    from public.holdings h
    join public.portfolios p on p.id = h.portfolio_id
    where p.is_active = true
    group by h.portfolio_id
  ),
  ranked as (
    select
      h.portfolio_id,
      h.symbol,
      h.weight,
      h.previous_weight,
      h.as_of,
      h.name as holding_name,
      h.price_current,
      h.currency,
      h.return_pct,
      row_number() over (
        partition by h.portfolio_id
        order by h.weight desc, h.id
      ) as rank_in_day
    from public.holdings h
    join latest l
      on l.portfolio_id = h.portfolio_id
     and h.as_of = l.max_as_of
  ),
  firsts as (
    select h.portfolio_id, min(h.as_of) as first_seen
    from public.holdings h
    where upper(btrim(h.symbol)) = upper(btrim(p_symbol))
    group by h.portfolio_id
  )
  select
    r.portfolio_id,
    p.slug,
    p.name,
    p.category,
    p.premium,
    r.weight,
    r.as_of,
    r.previous_weight,
    f.first_seen,
    r.holding_name,
    r.price_current,
    r.currency,
    r.return_pct
  from ranked r
  join public.portfolios p on p.id = r.portfolio_id
  join firsts f on f.portfolio_id = r.portfolio_id
  where upper(btrim(r.symbol)) = upper(btrim(p_symbol))
    and p.is_active = true
    and (
      public.holdings_limit_for_plan(public.current_user_plan()) is null
      or r.rank_in_day <= public.holdings_limit_for_plan(public.current_user_plan())
    )
    and (
      not p.premium
      or public.current_user_plan() in ('pro', 'elite')
    )
  order by r.weight desc, p.name asc;
$$;

grant execute on function public.get_symbol_holders(text) to anon, authenticated;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop function if exists public.get_symbol_holders(text);
-- ============================================================
