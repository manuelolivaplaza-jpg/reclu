-- ============================================================
-- reclu.cl — Database schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Idempotent: safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS).
-- ============================================================

-- ---- Extensions ----
create extension if not exists "uuid-ossp";
create extension if not exists pg_cron;      -- for scheduled scraper/alert jobs
create extension if not exists pg_net;       -- for calling edge functions from triggers

-- ============================================================
-- 1. PROFILES — extends Supabase auth.users
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  alert_frequency text not null default 'realtime' check (alert_frequency in ('realtime', 'daily', 'weekly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. PORTFOLIOS — trackable portfolios
-- ============================================================
create table if not exists public.portfolios (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  category text not null check (category in ('political_us', 'thematic', 'broker_cl', 'public_disclosure', 'hedge_fund', 'model')),
  source text not null,                       -- 'capitol_trades', 'renta4', 'infoprobidad', etc.
  manager text,
  country text not null default 'US' check (country in ('US', 'CL', 'Global')),
  followers integer not null default 0,
  return_ytd numeric(8, 2),                   -- percentage, e.g. 12.34
  premium boolean not null default false,     -- Pro-only portfolios
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portfolios_category on public.portfolios(category);
create index if not exists idx_portfolios_active on public.portfolios(is_active) where is_active = true;

-- ============================================================
-- 3. HOLDINGS — current + historical positions within a portfolio
-- ============================================================
create table if not exists public.holdings (
  id uuid primary key default uuid_generate_v4(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol text not null,
  name text not null,
  weight numeric(6, 2) not null check (weight >= 0 and weight <= 100),
  previous_weight numeric(6, 2),
  asset_class text not null default 'equity' check (asset_class in ('equity', 'fund', 'etf', 'cash', 'bond', 'other')),
  exchange text,                              -- 'BCS', 'NYSE', 'NASDAQ', etc.
  currency text not null default 'USD' check (currency in ('USD', 'CLP', 'EUR')),
  as_of date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_holdings_portfolio on public.holdings(portfolio_id);
create index if not exists idx_holdings_symbol on public.holdings(symbol);
-- Unique per portfolio+symbol+date so re-scrapes upsert cleanly
create unique index if not exists idx_holdings_unique on public.holdings(portfolio_id, symbol, as_of);

-- ============================================================
-- 4. ALERTS — generated when holdings change
-- ============================================================
create table if not exists public.alerts (
  id uuid primary key default uuid_generate_v4(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  type text not null check (type in ('new_trade', 'sold_trade', 'weight_change', 'mention', 'threshold')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  title text not null,
  summary text,                               -- AI-generated via OpenRouter
  payload jsonb not null default '{}',        -- raw change data
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_portfolio on public.alerts(portfolio_id);
create index if not exists idx_alerts_created on public.alerts(created_at desc);

-- ============================================================
-- 5. FOLLOWS — user → portfolio subscriptions
-- ============================================================
create table if not exists public.follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, portfolio_id)
);

create index if not exists idx_follows_user on public.follows(user_id);
create index if not exists idx_follows_portfolio on public.follows(portfolio_id);

-- Trigger: keep portfolios.followers count in sync
create or replace function public.update_follower_count()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.portfolios set followers = followers + 1, updated_at = now() where id = new.portfolio_id;
  elsif tg_op = 'DELETE' then
    update public.portfolios set followers = greatest(followers - 1, 0), updated_at = now() where id = old.portfolio_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_follow_change on public.follows;
create trigger on_follow_change
  after insert or delete on public.follows
  for each row execute function public.update_follower_count();

-- ============================================================
-- 6. USER_HOLDINGS — user's own portfolio for comparison
-- ============================================================
create table if not exists public.user_holdings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null default '',
  weight numeric(6, 2) not null check (weight >= 0 and weight <= 100),
  source text not null default 'manual' check (source in ('csv', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_holdings_user on public.user_holdings(user_id);
create unique index if not exists idx_user_holdings_unique on public.user_holdings(user_id, symbol);

-- ============================================================
-- 7. ALERT_DELIVERIES — track which alerts were emailed to whom
-- ============================================================
create table if not exists public.alert_deliveries (
  id uuid primary key default uuid_generate_v4(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (alert_id, user_id)
);

-- ============================================================
-- 8. UPDATED_AT trigger for all tables that have it
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_portfolios_updated_at on public.portfolios;
create trigger set_portfolios_updated_at before update on public.portfolios
  for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;
alter table public.alerts enable row level security;
alter table public.follows enable row level security;
alter table public.user_holdings enable row level security;
alter table public.alert_deliveries enable row level security;

-- Profiles: users see/edit only their own
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- Portfolios: publicly readable, admin-writable (service role bypasses RLS)
drop policy if exists "portfolios public read" on public.portfolios;
create policy "portfolios public read" on public.portfolios for select using (is_active = true);

-- Holdings: publicly readable
drop policy if exists "holdings public read" on public.holdings;
create policy "holdings public read" on public.holdings for select using (true);

-- Alerts: publicly readable when published
drop policy if exists "alerts public read" on public.alerts;
create policy "alerts public read" on public.alerts for select using (is_published = true);

-- Follows: users manage their own follows
drop policy if exists "own follows read" on public.follows;
create policy "own follows read" on public.follows for select using (auth.uid() = user_id);
drop policy if exists "own follows insert" on public.follows;
create policy "own follows insert" on public.follows for insert with check (auth.uid() = user_id);
drop policy if exists "own follows delete" on public.follows;
create policy "own follows delete" on public.follows for delete using (auth.uid() = user_id);

-- User holdings: users manage their own
drop policy if exists "own holdings all" on public.user_holdings;
create policy "own holdings all" on public.user_holdings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Alert deliveries: users see their own
drop policy if exists "own deliveries read" on public.alert_deliveries;
create policy "own deliveries read" on public.alert_deliveries for select using (auth.uid() = user_id);

-- ============================================================
-- 10. VIEW: portfolio detail with holding count
-- ============================================================
create or replace view public.portfolios_with_stats as
select
  p.*,
  count(h.id) as holding_count,
  max(h.as_of) as latest_as_of
from public.portfolios p
left join public.holdings h on h.portfolio_id = p.id
group by p.id;

-- ============================================================
-- 11. SEED DATA — initial portfolios to follow
-- ============================================================
insert into public.portfolios (slug, name, description, category, source, manager, country, premium, tags) values
  ('pelosi-tracker', 'Pelosi Tracker', 'Sigue las operaciones bursátiles declaradas por Nancy Pelosi, ex presidenta de la Cámara de Representantes de EE.UU.', 'political_us', 'capitol_trades', 'Nancy Pelosi', 'US', false, '{pelosi, congreso, tech}'),
  ('trump-trades', 'Trump Trades', 'Operaciones bursátiles y menciones públicas de Donald Trump y su círculo cercano.', 'political_us', 'capitol_trades', 'Donald Trump', 'US', false, '{trump, menciones}'),
  ('renta4-moderada', 'Renta 4 — Cartera Moderada', 'Cartera moderada recomendada por Renta 4 Corredores de Bolsa (Chile).', 'broker_cl', 'renta4', 'Renta 4', 'CL', false, '{chile, renta4, moderada}'),
  ('renta4-moderada-ampliada', 'Renta 4 — Cartera Moderada Ampliada', 'Versión ampliada de la cartera moderada de Renta 4, con mayor diversificación.', 'broker_cl', 'renta4', 'Renta 4', 'CL', false, '{chile, renta4, ampliada}'),
  ('larrainvial-top-picks', 'LarrainVial Top Picks', 'Selección de acciones destacadas del equipo de research de LarrainVial.', 'broker_cl', 'larrainvial', 'LarrainVial', 'CL', false, '{chile, larrainvial}'),
  ('btg-insights', 'BTG Pactual Insights', 'Carteras y recomendaciones de BTG Pactual Chile.', 'broker_cl', 'btg', 'BTG Pactual', 'CL', false, '{chile, btg}'),
  ('ai-world-war', 'AI World War III', 'Tesis temática: empresas clave en la carrera global de inteligencia artificial.', 'thematic', 'model', null, 'Global', false, '{ia, tech, tematica}'),
  ('claude-portfolio', 'Claude Portfolio', 'Portafolio modelo enfocado en empresas del ecosistema Anthropic y AI.', 'thematic', 'model', null, 'Global', true, '{ia, anthropic, tematica}'),
  ('inverse-cramer', 'Inverse Cramer', 'Estrategia contrarian basada en las recomendaciones de Jim Cramer.', 'thematic', 'model', null, 'US', false, '{contrarian, media}'),
  ('infoProbidad-cl', 'Declaraciones InfoProbidad', 'Seguimiento de declaraciones de patrimonio de autoridades chilenas (InfoProbidad).', 'public_disclosure', 'infoprobidad', null, 'CL', false, '{chile, infoprobidad}')
on conflict (slug) do nothing;
