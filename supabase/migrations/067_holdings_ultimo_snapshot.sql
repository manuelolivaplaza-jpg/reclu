-- D39: get_portfolio_holdings devolvía TODOS los snapshots (as_of) del
-- portafolio, ordenados por peso, y recién ahí recortaba por plan. Con
-- varios as_of, un símbolo salía repetido (trump-dice: DELL 3 veces) y los
-- pesos sumaban más de 100%. Ahora: solo el as_of más reciente.
-- Misma firma, mismo muro de pago (019_trump_compra). Solo lectura.
create or replace function public.get_portfolio_holdings(p_slug text)
returns setof public.holdings
language sql stable
security definer set search_path = ''
as $$
  with pf as (
    select p.id, p.source
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
      when exists (select 1 from pf where pf.source in ('oge_278t', 'house_ptr', 'senate_ptr')) then null
      else public.holdings_limit_for_plan(public.current_user_plan())
    end
  );
$$;

grant execute on function public.get_portfolio_holdings(text) to anon, authenticated;

-- rollback: volver a correr la definición de 019_trump_compra.sql
