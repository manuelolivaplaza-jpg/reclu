-- ============================================================
-- Migración 042 — Patrocinios rotulados (F56)
--
-- Espacios pagados, separados del contenido editorial. La UI debe
-- mostrar siempre la etiqueta "Patrocinado" y marcar el enlace con
-- rel="sponsored". SPONSORS_ENABLED=false por defecto: sin la flag,
-- ningún slot se renderiza.
--
-- Regla de producto: NO se puede patrocinar un portafolio ni una
-- alerta. Por eso `placement` no admite 'portfolio' ni 'alerts': un
-- patrocinio nunca aparece dentro de las tablas de posiciones, del
-- detalle de una cartera ni en el flujo de alertas. Solo ubicaciones
-- editoriales/genéricas.
--
-- Idempotente: create if not exists, índices if not exists,
-- drop policy if exists + create, sin seeds. Reejecutar no rompe.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.sponsorships (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (length(trim(name)) > 0),
  url text not null check (url ~ '^https://'),
  body text not null check (length(trim(body)) > 0),
  starts_on date not null,
  ends_on date not null,
  placement text not null check (
    placement in ('home', 'explore', 'dashboard', 'compare', 'aprende', 'herramientas')
  ),
  created_at timestamptz not null default now(),
  constraint sponsorships_dates_valid check (ends_on >= starts_on)
);

comment on table public.sponsorships is
  'Espacios pagados con etiqueta "Patrocinado". No puede patrocinar portafolios ni alertas (ver check de placement).';

comment on column public.sponsorships.placement is
  'Ubicación editorial del slot. No admite portfolio ni alerts a propósito.';

comment on column public.sponsorships.url is
  'Destino del patrocinador. Solo https; la UI agrega rel="sponsored nofollow noopener".';

create index if not exists idx_sponsorships_placement_dates
  on public.sponsorships (placement, starts_on, ends_on);

alter table public.sponsorships enable row level security;

-- Lectura pública solo de campañas vigentes. Escritura: service role
-- (sin policies de insert/update/delete).
drop policy if exists "sponsorships public read active" on public.sponsorships;
create policy "sponsorships public read active"
  on public.sponsorships
  for select
  using (starts_on <= current_date and ends_on >= current_date);

grant select on public.sponsorships to anon, authenticated;
