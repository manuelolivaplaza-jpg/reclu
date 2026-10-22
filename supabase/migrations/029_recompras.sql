-- ============================================================================
-- Migración 029: Recompras de acciones (XBRL frames de la SEC) (F29)
--
-- Tabla public.buybacks: una fila por empresa y trimestre calendario con el
-- monto pagado para recomprar acciones comunes (tag us-gaap
-- PaymentsForRepurchaseOfCommonStock), el ticker, las acciones en
-- circulación, el precio de cierre, el market cap y el % de capitalización.
-- Los datos vienen de los XBRL frames públicos de la SEC y de Yahoo Finance;
-- no hay datos personales (Ley 19.628 y 21.719).
--
-- Portafolio recompras-top20 ("Top 20 recompras"): canasta igual-pesada con
-- las 20 empresas de mayor monto de recompra del trimestre que tengan ticker
-- identificable. No promete sobrerrendimiento; es información educativa, no
-- asesoría ni recomendación de inversión.
--
-- Idempotente: create if not exists, on conflict do nothing, drop policy
-- if exists + create. Se puede reejecutar sin error.
-- ============================================================================

create extension if not exists "uuid-ossp" with schema extensions;

create table if not exists public.buybacks (
  id uuid primary key default gen_random_uuid(),
  cik text not null,
  ticker text,
  name text not null,
  period text not null,
  period_start date,
  period_end date,
  amount_usd numeric(20, 2) not null default 0,
  shares_outstanding numeric(24, 0),
  price_usd numeric(12, 4),
  market_cap_usd numeric(24, 2),
  pct_capitalization numeric(10, 4),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cik, period)
);

create index if not exists idx_buybacks_period_amount
  on public.buybacks (period, amount_usd desc);

create index if not exists idx_buybacks_ticker
  on public.buybacks (ticker);

comment on table public.buybacks is
  'Recompras trimestrales de acciones comunes según XBRL frames de la SEC: monto USD, ticker, acciones, precio, market cap y % de capitalización. Sin datos personales.';

comment on column public.buybacks.amount_usd is
  'Monto pagado para recomprar acciones comunes en el trimestre (us-gaap:PaymentsForRepurchaseOfCommonStock).';

comment on column public.buybacks.pct_capitalization is
  'Monto recomprado / (acciones en circulación × precio de cierre) × 100. Aproximación educativa, no buyback yield exacto.';

alter table public.buybacks enable row level security;

drop policy if exists "buybacks public read" on public.buybacks;
create policy "buybacks public read"
  on public.buybacks
  for select
  using (true);
-- Sin políticas de insert/update/delete: solo el service role escribe.

grant select on table public.buybacks to anon, authenticated;

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
)
values (
  'recompras-top20',
  'Top 20 recompras',
  'Las 20 empresas de mayor monto de recompra de acciones propias en el trimestre, según los XBRL frames públicos de la SEC. La canasta es igual-pesada y solo incluye empresas con ticker identificable. Información educativa: no es recomendación de inversión ni promesa de rendimiento.',
  'public_disclosure',
  'sec_xbrl_frames',
  null,
  'US',
  0,
  null,
  false,
  array['recompras', 'buybacks', 'sec', 'xbrl', 'top20']
)
on conflict (slug) do nothing;
