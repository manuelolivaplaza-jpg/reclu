-- ============================================================
-- Migración 041 — Socios con marca blanca (F55)
--
-- Un socio (corredora o medio) recibe una URL /p/[socio]/[tipo]
-- con su logo, su color de acento y una lista de portafolios
-- permitidos. Los widgets son los de F52 (/embed/widget/[tipo]).
--
-- Reglas:
--  - Minimalismo de datos personales (Leyes 19.628 y 21.719): aquí
--    solo hay datos de la empresa del socio (nombre, logo, slug).
--    No se guarda ningún dato de personas naturales.
--  - El socio NUNCA puede cambiar el contenido del widget: los
--    portafolios permitidos son slugs de un catálogo ya público.
--  - El acento es un color de marca, no un color de cifras: verde
--    y rojo quedan reservados para el rendimiento (ver
--    docs/hermes-diseno.md). El código valida contraste antes de
--    usarlo; si no cumple, cae al negro del sistema.
--  - Sin órdenes ni asesoría: los widgets son información pública
--    (Ley Fintec 21.521). El aviso legal va siempre visible.
--
-- Idempotente: create table if not exists, create index if not
-- exists, drop policy if exists + create policy, seed con on
-- conflict do nothing. Ejecutar dos veces seguidas no da error.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.partners (
  id uuid primary key default uuid_generate_v4(),
  -- Slug de la URL pública: /p/[socio]/[tipo]
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Nombre comercial del socio (empresa, no persona natural).
  nombre text not null check (length(trim(nombre)) > 0),
  -- Logo del socio. Solo https y opcional.
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  -- Color de acento del socio. Hex; la app valida contraste y
  -- cae a #0a0a0a si no cumple (reglas de diseño).
  accent text not null default '#0a0a0a' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  -- Slugs de portafolios que este socio puede mostrar.
  portafolios text[] not null default '{}',
  -- Un socio inactivo no se sirve (404 en /p/[socio]/...).
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.partners is
  'Socios con marca blanca (F55). Datos de la empresa: nombre, logo, acento y lista de portafolios permitidos.';

comment on column public.partners.portafolios is
  'Slugs de portafolios públicos que el socio puede mostrar en sus widgets. No habilita datos privados ni cambia el contenido.';

comment on column public.partners.accent is
  'Color de acento del socio (hex). Solo decorativo: nunca se usa en cifras de rendimiento, donde verde y rojo están reservados.';

comment on column public.partners.activo is
  'false = el socio no se sirve. Las políticas de lectura pública solo ven socios activos.';

-- Lectura rápida de socios activos.
create index if not exists idx_partners_activo
  on public.partners (activo)
  where activo = true;

alter table public.partners enable row level security;

-- Lectura pública solo de socios activos. Escritura: service role
-- (sin policies de insert/update/delete).
drop policy if exists "partners public read active" on public.partners;
create policy "partners public read active"
  on public.partners
  for select
  using (activo = true);

grant select on public.partners to anon, authenticated;

-- Socio de ejemplo para desarrollo. No es un cliente real.
insert into public.partners (slug, nombre, accent, portafolios)
values (
  'demo',
  'Socio de ejemplo',
  '#0a0a0a',
  array['renta4-moderada', 'btg-insights']
)
on conflict (slug) do nothing;
