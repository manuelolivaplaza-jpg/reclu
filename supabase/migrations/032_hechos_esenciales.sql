-- ============================================================
-- Migracion 032 (F32): hechos esenciales CMF (cl_material_events).
--
-- Hechos esenciales que la CMF (Comision para el Mercado Financiero)
-- publica en su portada de ultimos 7 dias: OPA, aumento de capital,
-- dividendo, compra/venta de acciones, cambio de control, colocacion,
-- fusion y juntas de accionistas. Lo llena la etapa
-- `scrapers/stages/cmf_hechos.py` desde
-- `institucional/hechos/hechos_portada.php` (sin captcha).
--
-- Datos: informacion publica y oficial de la CMF. Sin datos personales
-- (Leyes 19.628 y 21.719): solo emisor, materia y URL al documento.
-- Dato informativo: no ejecuta ordenes ni es recomendacion de inversion.
--
-- Idempotente: create table/index if not exists, policies con drop +
-- create, portafolio con on conflict do update. Reejecutar no rompe.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Tabla de hechos esenciales
-- ----------------------------------------------------------------------------
create table if not exists public.cl_material_events (
  id uuid primary key default uuid_generate_v4(),
  fecha date not null,
  numero_documento text not null,
  emisor text not null,
  rut_emisor text not null default '',
  materia text not null default '',
  categoria text not null default 'otro'
    check (categoria in (
      'opa', 'aumento_capital', 'dividendo', 'cambio_control',
      'compra_venta_acciones', 'colocacion', 'fusion',
      'junta_accionistas', 'otro'
    )),
  titulo text not null default '',
  url text not null default '',
  created_at timestamptz not null default now(),
  constraint cl_material_events_unique
    unique (numero_documento)
);

create index if not exists idx_cl_material_events_fecha
  on public.cl_material_events (fecha desc);

create index if not exists idx_cl_material_events_emisor
  on public.cl_material_events (emisor, fecha desc);

comment on table public.cl_material_events is
  'Hechos esenciales CMF. Un registro por numero de documento. Sin datos personales.';

alter table public.cl_material_events enable row level security;

drop policy if exists "cl_material_events public read" on public.cl_material_events;
create policy "cl_material_events public read"
  on public.cl_material_events
  for select
  using (true);
-- Sin policies de insert/update/delete: solo el service role escribe.

grant select on table public.cl_material_events to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Portafolio que hospeda las alertas mention y los scraper_error de la etapa
-- ----------------------------------------------------------------------------
insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags, is_active
)
values (
  'hechos-esenciales-cl',
  'Hechos esenciales CL',
  'Hechos esenciales de emisores chilenos a partir de la informacion publica de la CMF (Comision para el Mercado Financiero): OPA, aumentos de capital, dividendos, compra o venta de acciones, cambio de control, colocaciones, fusiones y juntas de accionistas. Dato informativo: no ejecuta ordenes ni es recomendacion de inversion.',
  'model',
  'cmf',
  'CMF (Comision para el Mercado Financiero)',
  'CL',
  0,
  null,
  false,
  array['chile', 'hechos-esenciales', 'cmf', 'acciones'],
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
