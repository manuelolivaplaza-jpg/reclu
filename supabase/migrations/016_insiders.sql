-- ============================================================
-- Migración 016 — Compras de ejecutivos (SEC Form 4) (F10)
--
-- Tabla public.insider_trades: compras y ventas declaradas en el
-- Formulario 4. Solo datos de mercado (nombre, cargo, emisor, ticker,
-- fecha, código, acciones, precio, monto). Sin columnas de dirección:
-- rptOwnerStreet1 / city / state / zip no se modelan.
--
-- Portafolio insiders-compras-1m: canasta igual-pesada de compras
-- P (mercado abierto) de officers y directores por >= US$1M.
-- Señal informativa. En el 1S-2026 no le ganó al SPY.
--
-- Numeración: 014 es F8 (trump-dice) y 015 queda reservada para F9.
-- Idempotente: create if not exists, policies con drop+create,
-- portafolio on conflict (slug) do nothing. Reejecutar no rompe.
-- ============================================================

create extension if not exists "uuid-ossp" with schema extensions;

create table if not exists public.insider_trades (
  id uuid primary key default gen_random_uuid(),
  accession text not null,
  issuer_cik text,
  symbol text not null,
  owner_name text not null,
  owner_title text,
  is_director boolean,
  is_officer boolean,
  trans_date date not null,
  filed_at date not null,
  code text not null check (code in ('P', 'S')),
  shares numeric,
  price numeric,
  value_usd numeric,
  shares_after numeric,
  source_url text not null,
  created_at timestamptz not null default now(),
  constraint insider_trades_event_key
    unique (accession, symbol, owner_name, trans_date, code)
);

create index if not exists idx_insider_trades_symbol_filed
  on public.insider_trades (symbol, filed_at desc);

create index if not exists idx_insider_trades_filed
  on public.insider_trades (filed_at desc);

comment on table public.insider_trades is
  'Form 4 SEC (compras/ventas). Sin direcciones del insider.';

alter table public.insider_trades enable row level security;

drop policy if exists "insider_trades public read" on public.insider_trades;
create policy "insider_trades public read"
  on public.insider_trades
  for select
  using (true);
-- Sin políticas de insert/update/delete: solo el service role escribe.

grant select on table public.insider_trades to anon, authenticated;

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
)
values (
  'insiders-compras-1m',
  'Compras de ejecutivos',
  'Compras en mercado abierto (código P) de officers y directores por US$1 millón o más, según el Formulario 4 de la SEC. En el primer semestre de 2026 esta señal no le ganó al SPY (promedio -1,80% contra +8,11%). Simulación histórica con fines informativos. No es recomendación de inversión.',
  'public_disclosure',
  'sec_form4',
  null,
  'US',
  0,
  null,
  false,
  array['insiders', 'form4', 'sec', 'ejecutivos']
)
on conflict (slug) do nothing;
