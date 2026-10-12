-- Migration 003: portfolio snapshots for historical charts
-- Daily snapshot of (portfolio, symbol, weight) so charts can show how
-- a portfolio evolved over time. Idempotent: safe to re-run.

create table if not exists public.portfolio_snapshots (
  id uuid primary key default uuid_generate_v4(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol text not null,
  weight numeric(6, 2) not null,
  as_of date not null default current_date,
  created_at timestamptz not null default now(),
  unique (portfolio_id, symbol, as_of)
);

create index if not exists idx_snapshots_portfolio_date on public.portfolio_snapshots(portfolio_id, as_of);

alter table public.portfolio_snapshots enable row level security;

drop policy if exists "snapshots public read" on public.portfolio_snapshots;
create policy "snapshots public read" on public.portfolio_snapshots for select using (true);
