-- ============================================================================
-- Migration 011: Rendimiento auditable (F5)
-- Benchmarks (S&P 500, IPSA), métricas por periodo con benchmark y
-- configuración de alertas de alineación de carteras.
-- Idempotente: safe to re-run. Escritura solo service role, lectura pública.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) benchmark_prices: series históricas de índices de referencia.
--    S&P 500 (^GSPC) e IPSA (^IPSA) vía Yahoo Finance (scrapers/benchmarks.py).
-- ----------------------------------------------------------------------------
create table if not exists public.benchmark_prices (
  symbol text not null,            -- ^GSPC, ^IPSA, SPY...
  date date not null,
  close numeric(14, 4) not null check (close > 0),
  source text not null default 'yahoo',
  created_at timestamptz not null default now(),
  primary key (symbol, date)
);

create index if not exists idx_benchmark_prices_symbol_date
  on public.benchmark_prices(symbol, date desc);

alter table public.benchmark_prices enable row level security;

drop policy if exists "benchmark_prices public read" on public.benchmark_prices;
create policy "benchmark_prices public read" on public.benchmark_prices
  for select using (true);
-- Sin política de insert/update/delete: solo el service role escribe.

-- ----------------------------------------------------------------------------
-- 2) portfolio_metrics: métricas de rendimiento por portafolio + periodo,
--    calculadas contra un benchmark. El nombre "portfolio_performance" ya
--    existe en el schema (serie diaria de retornos acumulados), por eso la
--    tabla de métricas se llama portfolio_metrics.
--    Una fila por (portfolio_id, period, benchmark_symbol): los periodos son
--    TOTAL, 1M, 3M, YTD, 1A.
-- ----------------------------------------------------------------------------
create table if not exists public.portfolio_metrics (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  as_of date not null default current_date,
  period text not null check (period in ('TOTAL', '1M', '3M', 'YTD', '1A')),
  return_pct numeric(12, 4),
  benchmark_symbol text not null,
  benchmark_return_pct numeric(12, 4),
  sharpe numeric(10, 4),
  max_drawdown numeric(12, 4),
  volatility numeric(12, 4),
  alpha_pct numeric(12, 4),
  win_rate numeric(6, 2),
  method text not null default 'cierre-diario, pesos-actualizados',
  data_points integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, period, benchmark_symbol)
);

create index if not exists idx_portfolio_metrics_portfolio
  on public.portfolio_metrics(portfolio_id, as_of desc);

alter table public.portfolio_metrics enable row level security;

drop policy if exists "portfolio_metrics public read" on public.portfolio_metrics;
create policy "portfolio_metrics public read" on public.portfolio_metrics
  for select using (true);
-- Sin política de escritura: solo service role (scrapers / edge functions).

-- updated_at automático en cada update.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_portfolio_metrics_updated_at on public.portfolio_metrics;
create trigger touch_portfolio_metrics_updated_at
  before update on public.portfolio_metrics
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3) Alertas de alineación: umbral por follow (NULL = usa el default 60%).
--    La edge function de alertas (send-alerts, frente F4) puede:
--      1. Calcular computeAlignment(user_holdings, holdings_objetivo).
--      2. Comparar similarityPct con alignment_alert_threshold del follow.
--      3. Si shouldAlertAlignment => insertar alerta tipo 'threshold' o una
--         fila propia en alerts con payload {similarity_pct, threshold}.
--    No se crea tabla alignment_alerts separada: el umbral vive en follows y
--    el evento reusa la tabla alerts existente.
-- ----------------------------------------------------------------------------
alter table public.follows
  add column if not exists alignment_alert_threshold numeric(5, 2)
  default 60 check (alignment_alert_threshold between 0 and 100);

-- ----------------------------------------------------------------------------
-- 4) Vista pública de ranking "Le ganan al mercado": exceso de retorno vs el
--    benchmark por portafolio (periodo TOTAL, último as_of).
-- ----------------------------------------------------------------------------
create or replace view public.v_beat_the_market as
select
  m.portfolio_id,
  p.slug,
  p.name,
  m.period,
  m.benchmark_symbol,
  m.return_pct,
  m.benchmark_return_pct,
  round(m.return_pct - m.benchmark_return_pct, 4) as excess_return_pct,
  m.sharpe,
  m.max_drawdown,
  m.volatility,
  m.alpha_pct,
  m.win_rate,
  m.data_points,
  m.as_of
from public.portfolio_metrics m
join public.portfolios p on p.id = m.portfolio_id
where m.return_pct is not null
  and m.benchmark_return_pct is not null
  and p.is_active = true;

grant select on public.v_beat_the_market to anon, authenticated;
