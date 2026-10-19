-- ============================================================================
-- Migration 021: InfoProbidad agregado por empresa (F15)
-- Solo datos agregados: cuántas autoridades declaran acciones de cada
-- empresa, el valor total declarado y la fecha más reciente.
-- Sin columnas de personas, cargos, dirección, cónyuge ni familiares.
-- Idempotente. El slug infoProbidad-cl no se renombra.
-- Lectura pública. Escritura solo service role (sin policy de insert).
-- ============================================================================

create table if not exists public.infoprobidad_empresas (
  rut text primary key,
  nombre text not null,
  symbol text,
  autoridades integer not null check (autoridades >= 0),
  valor_declarado_clp numeric,
  ultima_declaracion date,
  updated_at timestamptz not null default now()
);

comment on table public.infoprobidad_empresas is
  'Agregado InfoProbidad por RUT de la sociedad. Sin datos personales. CC BY 4.0, Consejo para la Transparencia.';

alter table public.infoprobidad_empresas enable row level security;

drop policy if exists "infoprobidad_empresas public read" on public.infoprobidad_empresas;
create policy "infoprobidad_empresas public read"
  on public.infoprobidad_empresas
  for select
  using (true);

grant select on public.infoprobidad_empresas to anon, authenticated;

-- Aclara que no es una cartera para copiar. No toca el slug.
update public.portfolios
set
  description = 'Empresas en las que autoridades chilenas declaran acciones, agregado por RUT (InfoProbidad, CC BY 4.0). Sirve para ver posibles conflictos de interés. No es una cartera para copiar ni una recomendación de inversión.',
  return_ytd = null
where slug = 'infoProbidad-cl';
