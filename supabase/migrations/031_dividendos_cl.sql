-- ============================================================
-- Migracion 031 (F31): dividendos de emisores chilenos (CMF).
--
-- Calendario de dividendos de la CMF (Comision para el Mercado
-- Financiero): un registro por emisor + numero de dividendo + serie +
-- fecha de pago. Lo llena la etapa `scrapers/stages/cmf_dividendos.py`
-- desde `institucional/estadisticas/acc_dividendos1grid.php`.
--
-- Datos: informacion publica y oficial de la CMF. Sin datos personales
-- (Leyes 19.628 y 21.719): solo emisor, nemotecnico y montos por accion.
-- Dato informativo: no ejecuta ordenes ni es recomendacion de inversion.
--
-- Idempotente: create table/index if not exists, policies con drop +
-- create, portafolio con on conflict do update. Reejecutar no rompe.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Tabla del calendario
-- ----------------------------------------------------------------------------
create table if not exists public.cl_dividends (
  id uuid primary key default uuid_generate_v4(),
  nemo text not null,
  razon_social text not null default '',
  rut_emisor text not null default '',
  fecha_pago date not null,
  fecha_limite date,
  fecha_acuerdo date,
  fecha_cierre date,
  numero_dividendo text not null default '',
  serie text not null default '',
  tipo text not null default 'desconocido'
    check (tipo in ('provisorio', 'definitivo', 'adicional', 'desconocido')),
  tipo_codigo text not null default '',
  moneda text not null default '',
  monto numeric,
  fuente text not null default 'cmf',
  source_url text not null default '',
  created_at timestamptz not null default now(),
  constraint cl_dividends_unique
    unique (nemo, fecha_pago, numero_dividendo, serie)
);

create index if not exists idx_cl_dividends_fecha_pago
  on public.cl_dividends (fecha_pago desc);

create index if not exists idx_cl_dividends_nemo
  on public.cl_dividends (nemo, fecha_pago desc);

comment on table public.cl_dividends is
  'Dividendos de emisores chilenos (CMF). Un registro por emisor + numero de dividendo + serie + fecha de pago. Sin datos personales.';

alter table public.cl_dividends enable row level security;

drop policy if exists "cl_dividends public read" on public.cl_dividends;
create policy "cl_dividends public read"
  on public.cl_dividends
  for select
  using (true);
-- Sin policies de insert/update/delete: solo el service role escribe.

grant select on table public.cl_dividends to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Portafolio que hospeda el calendario (y los scraper_error de la etapa)
-- ----------------------------------------------------------------------------
insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags, is_active
)
values (
  'dividendos-cl',
  'Calendario de dividendos CL',
  'Calendario de dividendos pagados y anunciados por emisores chilenos, a partir de la informacion publica de la CMF (Comision para el Mercado Financiero). Se registran nemotecnico, numero de dividendo, serie, fechas (acuerdo, limite y pago), moneda, tipo y monto por accion. Dato informativo: no ejecuta ordenes ni es recomendacion de inversion.',
  'model',
  'cmf',
  'CMF (Comision para el Mercado Financiero)',
  'CL',
  0,
  null,
  false,
  array['chile', 'dividendos', 'cmf', 'acciones'],
  true
)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  source      = excluded.source,
  manager     = excluded.manager,
  country     = excluded.country,
  tags        = excluded.tags;
