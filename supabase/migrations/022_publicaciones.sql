-- ============================================================
-- Migración 022 — Borradores de publicación (F17)
--
-- Núcleo común para X, Telegram y el newsletter. Nada sale solo:
-- cada salida es un borrador que hay que aprobar, y el envío real
-- lo decide la app (flags apagados y PUBLISH_MODE=preview).
--
-- Sin datos de contacto. approved_by es el uuid de quien aprueba.
-- source_alert_id apunta a la alerta pública que originó el texto.
--
-- RLS sin policies: anon y authenticated no leen ni escriben.
-- Solo el service role (bypassa RLS y tiene GRANT).
--
-- Idempotente: IF NOT EXISTS, DROP POLICY IF EXISTS, REVOKE/GRANT
-- repetibles. No inserta filas.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.publish_drafts (
  id uuid primary key default uuid_generate_v4(),
  channel text not null
    constraint publish_drafts_channel_check
    check (channel in ('x', 'telegram', 'newsletter')),
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  source_alert_id uuid references public.alerts(id) on delete set null,
  status text not null default 'draft'
    constraint publish_drafts_status_check
    check (status in ('draft', 'approved', 'rejected', 'sent', 'failed')),
  preview_url text,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  external_id text,
  error text
);

create index if not exists idx_publish_drafts_status_created
  on public.publish_drafts (status, created_at desc);

create index if not exists idx_publish_drafts_source_alert
  on public.publish_drafts (source_alert_id);

comment on table public.publish_drafts is
  'Borradores de publicación (X, Telegram, newsletter). Sin lectura pública. No es una orden ni una recomendación.';

comment on column public.publish_drafts.approved_by is
  'Usuario que aprobó el borrador. Solo el uuid, sin nombre ni correo.';

comment on column public.publish_drafts.payload is
  'Metadatos del canal (hilo, chat, asunto). Sin datos de contacto de terceros.';

alter table public.publish_drafts enable row level security;

-- Por diseño no hay policy de select/insert/update/delete.
-- Se dropean por si una ejecución anterior dejó una policy pública.
drop policy if exists "publish_drafts public read" on public.publish_drafts;
drop policy if exists "publish_drafts own read" on public.publish_drafts;
drop policy if exists "publish_drafts insert" on public.publish_drafts;
drop policy if exists "publish_drafts update" on public.publish_drafts;
drop policy if exists "publish_drafts delete" on public.publish_drafts;

revoke all on table public.publish_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.publish_drafts to service_role;
