-- ============================================================================
-- Migración 030 — Grandes apuestas de Polymarket (F30)
--
-- Sigue apuestas de US$10.000 o más en mercados de política y economía, y el
-- leaderboard público de Polymarket. El feed se filtra por los tags del
-- evento en la Gamma API; los eventos con tag deportivo se descartan.
--
-- Privacidad (Leyes 19.628 y 21.719):
--   - Solo se guarda la billetera seudónima (proxyWallet) y el alias público
--     (userName/pseudonym).
--   - No hay columnas de bio, foto, email, redes sociales ni direcciones.
--   - No se intenta desanonimizar ni cruzar con otras fuentes.
--
-- Portafolio polymarket-ballenas (category model): holdings = mercados con
-- más monto apostado en los últimos 7 días, ponderados por monto.
--
-- Idempotente: create table/index if not exists, policies con drop + create,
-- portafolio con on conflict do update. Reejecutar no rompe.
-- ============================================================================

create extension if not exists "uuid-ossp" with schema extensions;

-- ----------------------------------------------------------------------------
-- Apuestas grandes individuales
-- ----------------------------------------------------------------------------
create table if not exists public.prediction_trades (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  alias text not null,
  side text not null check (side in ('BUY', 'SELL')),
  asset text not null default '',
  condition_id text not null default '',
  market_slug text not null,
  event_slug text not null default '',
  market_title text not null,
  outcome text not null default '',
  outcome_index integer,
  size numeric,
  price numeric,
  value_usd numeric not null check (value_usd >= 0),
  category text not null check (category in ('politics', 'economy')),
  traded_at timestamptz not null,
  tx_hash text not null default '',
  source_url text not null default '',
  profile_url text not null default '',
  created_at timestamptz not null default now(),
  constraint prediction_trades_event_key
    unique (tx_hash, wallet, asset, side)
);

create index if not exists idx_prediction_trades_traded_at
  on public.prediction_trades (traded_at desc);

create index if not exists idx_prediction_trades_category_value
  on public.prediction_trades (category, value_usd desc);

create index if not exists idx_prediction_trades_market
  on public.prediction_trades (market_slug, traded_at desc);

comment on table public.prediction_trades is
  'Apuestas >= US$10.000 en Polymarket (política/economía). Solo alias público y billetera seudónima; sin datos personales adicionales.';

alter table public.prediction_trades enable row level security;

drop policy if exists "prediction_trades public read" on public.prediction_trades;
create policy "prediction_trades public read"
  on public.prediction_trades
  for select
  using (true);
-- Sin policies de insert/update/delete: solo el service role escribe.

grant select on table public.prediction_trades to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Leaderboard público (último snapshot)
-- ----------------------------------------------------------------------------
create table if not exists public.prediction_leaderboard (
  wallet text primary key,
  alias text not null,
  rank integer not null default 0,
  volume_usd numeric not null default 0,
  pnl_usd numeric not null default 0,
  profile_url text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists idx_prediction_leaderboard_rank
  on public.prediction_leaderboard (rank asc);

comment on table public.prediction_leaderboard is
  'Leaderboard público de Polymarket (último snapshot). Solo alias y billetera seudónima.';

alter table public.prediction_leaderboard enable row level security;

drop policy if exists "prediction_leaderboard public read" on public.prediction_leaderboard;
create policy "prediction_leaderboard public read"
  on public.prediction_leaderboard
  for select
  using (true);

grant select on table public.prediction_leaderboard to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Portafolio seguible
-- ----------------------------------------------------------------------------
insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
)
values (
  'polymarket-ballenas',
  'Polymarket: grandes apuestas',
  'Apuestas de US$10.000 o más en mercados de política y economía de Polymarket, más el leaderboard público. Solo se publica el alias público y la billetera seudónima; no se intenta identificar personas. Dato informativo: no ejecuta órdenes ni es recomendación de inversión.',
  'model',
  'polymarket',
  null,
  'Global',
  0,
  null,
  false,
  array['polymarket', 'predicciones', 'politica', 'economia', 'ballenas']
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  source = excluded.source,
  manager = excluded.manager,
  country = excluded.country,
  premium = excluded.premium,
  tags = excluded.tags,
  updated_at = now();
