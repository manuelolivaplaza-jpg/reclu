-- ============================================================
-- Migración 064 — Archivo de holdings fusionadas (D34)
--
-- resolve_tickers genera un SQL revisable que, cuando una fila con nombre de
-- emisor choca con la fila del ticker (mismo portafolio y as_of), suma el
-- peso en la fila del ticker y mueve la fila con nombre aquí (copia completa
-- en row_data) antes de sacarla de holdings. Permite restaurar.
-- Esta migración solo crea la tabla: no toca filas existentes.
-- ============================================================

create table if not exists public.holdings_merged (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null,
  merged_into uuid not null,
  ticker text not null,
  row_data jsonb not null,
  merged_at timestamptz not null default now()
);

create index if not exists idx_holdings_merged_into on public.holdings_merged (merged_into);
create unique index if not exists idx_holdings_merged_holding on public.holdings_merged (holding_id);

-- Solo service role (sin políticas: nadie más lee ni escribe).
alter table public.holdings_merged enable row level security;
