-- ============================================================================
-- Migración 027: Activistas (Schedule 13D) (F27)
--
-- Tabla public.activist_filings: un 13D o 13D/A por accession. Solo datos
-- públicos del filing: emisor, ticker, filer, porcentaje de la clase,
-- fechas y URL. Sin direcciones del emisor, del filer ni de las personas
-- autorizadas (Ley 19.628 y 21.719: mínimo de datos personales).
--
-- Portafolio activistas-13d ("Activistas: últimos 90 días"): canasta
-- igual-pesada con una posición por emisor que presentó un 13D en los
-- últimos 90 días. Es información pública, no asesoría ni recomendación.
--
-- Idempotente: create if not exists, on conflict do nothing, drop policy
-- if exists + create. Se puede reejecutar sin error.
-- ============================================================================

create extension if not exists "uuid-ossp" with schema extensions;

create table if not exists public.activist_filings (
  id uuid primary key default gen_random_uuid(),
  accession text not null unique,
  issuer_name text not null,
  issuer_cik text,
  symbol text,
  filer_name text not null,
  percent_of_class numeric,
  event_date date,
  filed_at date not null,
  form text not null default 'SCHEDULE 13D',
  is_amendment boolean not null default false,
  source_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_activist_filings_filed
  on public.activist_filings (filed_at desc);

create index if not exists idx_activist_filings_symbol
  on public.activist_filings (symbol);

comment on table public.activist_filings is
  'Schedule 13D/13D-A de la SEC: emisor, filer, % de clase y URL. Sin direcciones.';

alter table public.activist_filings enable row level security;

drop policy if exists "activist_filings public read" on public.activist_filings;
create policy "activist_filings public read"
  on public.activist_filings
  for select
  using (true);
-- Sin políticas de insert/update/delete: solo el service role escribe.

grant select on table public.activist_filings to anon, authenticated;

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
)
values (
  'activistas-13d',
  'Activistas: últimos 90 días',
  'Emisores que recibieron un Schedule 13D en los últimos 90 días: inversionistas con más de 5% de la clase y intención de influir en la empresa. Canasta igual-pesada, según filings públicos de la SEC. Información con fines educativos, no es recomendación de inversión.',
  'public_disclosure',
  'sec_schedule_13d',
  null,
  'US',
  0,
  null,
  false,
  array['activistas', '13d', 'sec', 'edgar', 'gobierno-corporativo']
)
on conflict (slug) do nothing;
