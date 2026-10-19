-- ============================================================
-- Migration 019 (F13): Trump compra — declaraciones OGE 278-T
-- Idempotente. No toca trump-trades ni trump-truth-signals.
-- Legal: 5 U.S.C. 13107. El portafolio queda premium=false y la
-- lectura de holdings no se recorta para source oge_278t
-- (tambien house_ptr y senate_ptr, a confirmar con abogado).
-- ============================================================

create table if not exists public.disclosure_trades (
  id uuid primary key default gen_random_uuid(),
  filer text not null,
  report_url text not null,
  report_signed date,
  report_published date,
  line_no int,
  description text not null,
  symbol text,
  side text check (side in ('purchase', 'sale', 'exchange')),
  trans_date date,
  trans_date_uncertain boolean not null default false,
  amount_min numeric,
  amount_max numeric,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'verificada', 'descartada')),
  created_at timestamptz not null default now()
);

create unique index if not exists disclosure_trades_report_line_uidx
  on public.disclosure_trades (report_url, line_no);

create index if not exists disclosure_trades_status_idx
  on public.disclosure_trades (status);

alter table public.disclosure_trades enable row level security;

drop policy if exists "disclosure_trades public read verified"
  on public.disclosure_trades;
create policy "disclosure_trades public read verified"
  on public.disclosure_trades
  for select
  using (status = 'verificada');

grant select on public.disclosure_trades to anon, authenticated;

-- Lectura publica completa solo para declaraciones oficiales.
-- LIMIT NULL = sin recorte (Postgres).
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
  limit (
    select case
      when exists (
        select 1
        from public.portfolios p2
        where p2.slug = p_slug
          and p2.source in ('oge_278t', 'house_ptr', 'senate_ptr')
      ) then null
      else public.holdings_limit_for_plan(public.current_user_plan())
    end
  );
$$;

grant execute on function public.get_portfolio_holdings(text) to anon, authenticated;

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags, is_active
)
values (
  'trump-compra',
  'Trump compra (OGE)',
  'Compras de acciones y ETF de US$1 millón o más declaradas por Donald Trump en el formulario OGE 278-T. Los montos son tramos oficiales, no cifras exactas. La OGE publica con hasta 45 días de atraso; el rendimiento se mide desde la publicación. Simulación histórica con fines informativos. No es recomendación de inversión. PDF: https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/0BDCCCE7DE13AEFA85258E8A002DE2B5/$FILE/Donald-J-Trump.09.17.2026-278T.pdf',
  'political_us',
  'oge_278t',
  'Donald Trump',
  'US',
  0,
  null,
  false,
  '{trump,oge,declaraciones}',
  true
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  source = excluded.source,
  manager = excluded.manager,
  country = excluded.country,
  premium = false,
  tags = excluded.tags,
  is_active = true,
  updated_at = now();

-- /accion: misma definicion que la 015. El rank sigue sobre toda la
-- cartera vigente y el filtro premium no cambia. Sin limite solo si
-- source es una declaracion oficial.
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
      p.source in ('oge_278t', 'house_ptr', 'senate_ptr')
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

-- ============================================================
-- ROLLBACK:
-- drop policy if exists "disclosure_trades public read verified" on public.disclosure_trades;
-- drop table if exists public.disclosure_trades;
-- delete from public.portfolios where slug = 'trump-compra';
-- (get_portfolio_holdings: volver a correr 012_muro_pago.sql)
-- (get_symbol_holders: volver a correr 015)
-- ============================================================
