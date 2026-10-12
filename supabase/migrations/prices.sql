create table if not exists public.prices (
  symbol text not null,
  date date not null,
  close numeric(14, 4) not null check (close > 0),
  currency text not null default 'USD',
  source text not null default 'yahoo',
  created_at timestamptz not null default now(),
  primary key (symbol, date)
);

create index if not exists idx_prices_symbol_date on public.prices(symbol, date desc);

alter table public.prices enable row level security;

drop policy if exists "prices public read" on public.prices;
create policy "prices public read" on public.prices for select using (true);
