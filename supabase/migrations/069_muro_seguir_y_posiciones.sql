-- D55 (decisión de Manu, 2026-10-28): muro de pago más estricto.
--   1. Seguir portafolios es solo para planes pagados (pro/elite).
--      Los follows que ya existen NO se borran: el trigger solo mira INSERT.
--   2. Las posiciones (holdings) son solo para planes pagados, EXCEPTO las
--      carteras recomendadas de corredoras (category = 'broker_cl': Renta 4,
--      LarrainVial, BTG, BICE, MBI, consenso corredoras_cl) y las
--      declaraciones oficiales de EE.UU. (oge_278t, house_ptr, senate_ptr),
--      que ya eran públicas por ley (ver src/lib/public-disclosure.ts).
--   3. El rendimiento (get_portfolio_performance) NO cambia.
-- Solo redefine funciones; no toca datos. NO APLICADA: la aplica Andamio
-- con el sí de Manu, junto con el deploy del código d55.

-- 1. Límite de posiciones: anon y free pasan a 0 (antes 5 y 10).
create or replace function public.holdings_limit_for_plan(plan text)
returns integer
language sql immutable
as $$
  select case
    when plan = 'pro' or plan = 'elite' then null
    else 0
  end;
$$;

-- 2. get_portfolio_holdings: misma firma y mismo último snapshot que la 067;
--    sin límite para corredoras (broker_cl) y declaraciones oficiales.
create or replace function public.get_portfolio_holdings(p_slug text)
returns setof public.holdings
language sql stable
security definer set search_path = ''
as $$
  with pf as (
    select p.id, p.source, p.category::text as category
    from public.portfolios p
    where p.slug = p_slug and p.is_active = true
  ),
  ultimo as (
    select max(h.as_of) as as_of
    from public.holdings h
    join pf on pf.id = h.portfolio_id
  )
  select h.*
  from public.holdings h
  join pf on pf.id = h.portfolio_id
  join ultimo u on h.as_of = u.as_of
  order by h.weight desc
  limit (
    select case
      when exists (
        select 1 from pf
        where pf.category = 'broker_cl'
           or pf.source in ('oge_278t', 'house_ptr', 'senate_ptr')
      ) then null
      else public.holdings_limit_for_plan(public.current_user_plan())
    end
  );
$$;

grant execute on function public.get_portfolio_holdings(text) to anon, authenticated;

-- 3. get_symbol_holders (/accion): misma definición que la 019, con la
--    excepción broker_cl.
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
      p.source in ('oge_278t', 'house_ptr', 'senate_ptr')
      or p.category::text = 'broker_cl'
      or public.holdings_limit_for_plan(public.current_user_plan()) is null
      or r.rank_in_day <= public.holdings_limit_for_plan(public.current_user_plan())
    )
    and (
      not p.premium
      or public.current_user_plan() in ('pro', 'elite')
    )
  order by r.weight desc, p.name asc;
$$;

grant execute on function public.get_symbol_holders(text) to anon, authenticated;

-- 4. Seguir: solo pro/elite. Mismos límites de cantidad que la 007
--    (pro 15, elite sin límite). Solo INSERT: los follows existentes quedan.
create or replace function public.enforce_follow_limits()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_plan text;
  v_count integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'Solo puedes seguir portafolios con tu propia cuenta.';
  end if;
  select plan into v_plan from public.profiles where id = auth.uid() for update;
  if coalesce(v_plan, 'free') not in ('pro', 'elite') then
    raise exception 'Seguir portafolios requiere un plan de pago (Pro o Elite).';
  end if;
  if v_plan <> 'elite' then
    select count(*) into v_count from public.follows where user_id = auth.uid();
    if v_count >= 15 then
      raise exception 'Alcanzaste el límite de portafolios de tu plan.';
    end if;
  end if;
  return new;
end;
$$;

-- ROLLBACK:
--   holdings_limit_for_plan: volver a correr el bloque 2 de 012_muro_pago.sql
--   get_portfolio_holdings: volver a correr 067_holdings_ultimo_snapshot.sql
--   get_symbol_holders: volver a correr el bloque de 019_trump_compra.sql
--   enforce_follow_limits: volver a correr el bloque 2 de 007_seguridad_rls.sql
