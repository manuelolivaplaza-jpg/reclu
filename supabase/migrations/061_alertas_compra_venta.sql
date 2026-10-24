-- ============================================================
-- Migration 061: alertas de compra y venta por email (D31)
-- 1) follow_alert_prefs: por usuario y portafolio seguido, si quiere email
--    de compras y/o ventas. Sin fila = ambos activados (default).
-- 2) trade_alert_events: compras (símbolo nuevo) y ventas (símbolo que sale)
--    detectadas comparando los dos últimos snapshots de holdings.
-- 3) trade_alert_deliveries: a quién se avisó (o se habría avisado en
--    dry-run) cada evento; evita duplicados.
-- Escritura de eventos/entregas solo service role (job trade_alerts.py).
-- El envío real está detrás de TRADE_ALERTS_SEND_ENABLED=true (apagado).
-- Idempotente; no borra datos.
-- ============================================================
create table if not exists public.follow_alert_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  email_buys boolean not null default true,
  email_sells boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, portfolio_id)
);

alter table public.follow_alert_prefs enable row level security;
drop policy if exists "own follow alert prefs read" on public.follow_alert_prefs;
create policy "own follow alert prefs read" on public.follow_alert_prefs
  for select using (auth.uid() = user_id);
drop policy if exists "own follow alert prefs insert" on public.follow_alert_prefs;
create policy "own follow alert prefs insert" on public.follow_alert_prefs
  for insert with check (auth.uid() = user_id);
drop policy if exists "own follow alert prefs update" on public.follow_alert_prefs;
create policy "own follow alert prefs update" on public.follow_alert_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.trade_alert_events (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol text not null,
  action text not null check (action in ('buy', 'sell')),
  as_of date not null,
  prev_as_of date,
  weight_before numeric(8, 4),
  weight_after numeric(8, 4),
  detected_at timestamptz not null default now(),
  unique (portfolio_id, symbol, action, as_of)
);
create index if not exists idx_trade_alert_events_portfolio on public.trade_alert_events(portfolio_id, as_of desc);
alter table public.trade_alert_events enable row level security;
-- Sin políticas: solo service role.

create table if not exists public.trade_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.trade_alert_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('sent', 'dry_run', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table public.trade_alert_deliveries enable row level security;
-- Sin políticas: solo service role.
