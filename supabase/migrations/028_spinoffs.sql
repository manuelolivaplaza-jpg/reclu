-- ============================================================================
-- Migración 028: Spin-offs (Form 10-12B) (F28)
--
-- Tabla public.spinoffs: una fila por CIK con el nombre del emisor, el ticker
-- (cuando aparece en los display_names de EDGAR), el primer y el último
-- filing 10-12B/10-12B/A del período y el estado (cotizando / en curso).
-- Solo datos públicos del filing: sin direcciones ni teléfonos (Ley 19.628
-- y 21.719: mínimo de datos personales).
--
-- Portafolio spinoffs-12m ("Spin-offs de los últimos 12 meses"): canasta
-- igual-pesada con una posición por spin-off con ticker que haya presentado
-- un 10-12B en los últimos 12 meses. No promete sobrerrendimiento: el
-- backtest solo se muestra cuando haya datos suficientes (HIPÓTESIS). Es
-- información educativa, no asesoría ni recomendación de inversión.
--
-- Idempotente: create if not exists, on conflict do nothing, drop policy
-- if exists + create. Se puede reejecutar sin error.
-- ============================================================================

create extension if not exists "uuid-ossp";

create table if not exists public.spinoffs (
  id uuid primary key default uuid_generate_v4(),
  cik text not null unique,
  name text not null,
  ticker text,
  first_filed_at date not null,
  last_filed_at date not null,
  status text not null default 'en curso',
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spinoffs_last_filed
  on public.spinoffs (last_filed_at desc);

create index if not exists idx_spinoffs_ticker
  on public.spinoffs (ticker);

comment on table public.spinoffs is
  'Form 10-12B/10-12B/A de la SEC agrupados por CIK: nombre, ticker, primer y último filing, estado. Sin direcciones.';

alter table public.spinoffs enable row level security;

drop policy if exists "spinoffs public read" on public.spinoffs;
create policy "spinoffs public read"
  on public.spinoffs
  for select
  using (true);
-- Sin políticas de insert/update/delete: solo el service role escribe.

grant select on table public.spinoffs to anon, authenticated;

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
)
values (
  'spinoffs-12m',
  'Spin-offs de los últimos 12 meses',
  'Empresas que registraron un Form 10-12B ante la SEC en los últimos 12 meses para escindirse y cotizar por separado. La canasta igual-pesada incluye solo las que ya muestran ticker; el resto queda en seguimiento como spin-offs en curso. Información pública con fines educativos, no es recomendación de inversión ni promesa de rendimiento.',
  'public_disclosure',
  'sec_form_10_12b',
  null,
  'US',
  0,
  null,
  false,
  array['spinoffs', '10-12b', 'sec', 'edgar', 'escisiones']
)
on conflict (slug) do nothing;
