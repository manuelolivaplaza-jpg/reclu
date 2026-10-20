-- ============================================================
-- Migración 023 — Newsletter semanal (F22)
--
-- Lista propia de suscriptores, separada de `profiles`: el newsletter
-- no exige cuenta. Doble opt-in (`pending` → `confirmed`) y baja en un
-- clic (`unsubscribed`) con tokens independientes.
--
-- El correo es el único dato personal. `consent_text` guarda el texto
-- exacto que la persona aceptó y `consent_at` cuándo lo hizo (Leyes
-- 19.628 y 21.719: finalidad explícita y mínimo de datos).
--
-- RLS sin policies: anon y authenticated no leen ni escriben. La única
-- vía de alta es `newsletter_subscribe`, `security definer` y con
-- límite por hora. Confirmar y dar de baja también pasan por funciones
-- que reciben un token; nunca se expone la tabla.
--
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS,
-- REVOKE/GRANT repetibles. No inserta filas.
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.newsletter_subscribers (
  id uuid primary key default uuid_generate_v4(),
  email text not null
    constraint newsletter_subscribers_email_key unique,
  status text not null default 'pending'
    constraint newsletter_subscribers_status_check
    check (status in ('pending', 'confirmed', 'unsubscribed')),
  confirm_token uuid not null default uuid_generate_v4()
    constraint newsletter_subscribers_confirm_token_key unique,
  unsub_token uuid not null default uuid_generate_v4()
    constraint newsletter_subscribers_unsub_token_key unique,
  consent_text text not null,
  consent_at timestamptz not null default now(),
  source text not null default 'footer',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);

-- Por si una ejecución previa creó la tabla a medias.
alter table public.newsletter_subscribers
  add column if not exists status text not null default 'pending',
  add column if not exists confirm_token uuid not null default uuid_generate_v4(),
  add column if not exists unsub_token uuid not null default uuid_generate_v4(),
  add column if not exists consent_text text,
  add column if not exists consent_at timestamptz not null default now(),
  add column if not exists source text not null default 'footer',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists confirmed_at timestamptz,
  add column if not exists unsubscribed_at timestamptz;

create unique index if not exists idx_newsletter_subscribers_email
  on public.newsletter_subscribers (lower(email));

create index if not exists idx_newsletter_subscribers_status
  on public.newsletter_subscribers (status, created_at desc);

create index if not exists idx_newsletter_subscribers_confirm_token
  on public.newsletter_subscribers (confirm_token);

create index if not exists idx_newsletter_subscribers_unsub_token
  on public.newsletter_subscribers (unsub_token);

comment on table public.newsletter_subscribers is
  'Suscriptores del newsletter semanal con doble opt-in. Solo el correo como dato personal; sin lectura pública.';

comment on column public.newsletter_subscribers.consent_text is
  'Texto de consentimiento aceptado, para acreditar la finalidad del tratamiento (Ley 19.628).';

comment on column public.newsletter_subscribers.source is
  'Dónde se suscribió: footer, articulo, campana... Sin datos de navegación.';

alter table public.newsletter_subscribers enable row level security;

-- Por diseño no hay policy de select/insert/update/delete.
-- Se dropean por si una ejecución anterior dejó una policy pública.
drop policy if exists "newsletter_subscribers public read" on public.newsletter_subscribers;
drop policy if exists "newsletter_subscribers insert" on public.newsletter_subscribers;
drop policy if exists "newsletter_subscribers update" on public.newsletter_subscribers;
drop policy if exists "newsletter_subscribers delete" on public.newsletter_subscribers;

revoke all on table public.newsletter_subscribers from public, anon, authenticated;
grant select, insert, update, delete on table public.newsletter_subscribers to service_role;

-- ------------------------------------------------------------
-- Alta: única puerta. Normaliza el correo, exige consentimiento y
-- limita las altas por hora para frenar abuso desde el formulario.
-- Devuelve true siempre para no revelar si el correo ya existía.
-- ------------------------------------------------------------
create or replace function public.newsletter_subscribe(
  p_email text,
  p_consent_text text,
  p_source text default 'footer'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_source text := lower(trim(coalesce(p_source, 'footer')));
  v_recent integer;
  v_max_per_hour constant integer := 60;
begin
  if v_email = '' or length(v_email) > 320 then
    return false;
  end if;

  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;

  if length(trim(coalesce(p_consent_text, ''))) < 20 then
    return false;
  end if;

  if v_source = '' or length(v_source) > 40 then
    v_source := 'footer';
  end if;

  select count(*) into v_recent
    from public.newsletter_subscribers
   where created_at > now() - interval '1 hour';

  if v_recent >= v_max_per_hour then
    raise exception 'newsletter rate limit'
      using errcode = 'P0001',
            hint = 'Demasiadas suscripciones en la última hora.';
  end if;

  insert into public.newsletter_subscribers (
    email, status, consent_text, consent_at, source
  )
  values (
    v_email, 'pending', trim(p_consent_text), now(), v_source
  )
  on conflict (email) do update
    set status = case
          when public.newsletter_subscribers.status = 'confirmed' then 'confirmed'
          else 'pending'
        end,
        consent_text = excluded.consent_text,
        consent_at = excluded.consent_at,
        source = excluded.source,
        confirm_token = case
          when public.newsletter_subscribers.status = 'confirmed'
            then public.newsletter_subscribers.confirm_token
          else uuid_generate_v4()
        end,
        unsubscribed_at = case
          when public.newsletter_subscribers.status = 'unsubscribed' then null
          else public.newsletter_subscribers.unsubscribed_at
        end;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- Confirmación del doble opt-in.
-- ------------------------------------------------------------
create or replace function public.newsletter_confirm(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.newsletter_subscribers
     set status = 'confirmed',
         confirmed_at = coalesce(confirmed_at, now()),
         unsubscribed_at = null
   where confirm_token = p_token
     and status in ('pending', 'confirmed');

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ------------------------------------------------------------
-- Baja en un clic. Idempotente: repetir el clic devuelve true.
-- ------------------------------------------------------------
create or replace function public.newsletter_unsubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.newsletter_subscribers
     set status = 'unsubscribed',
         unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsub_token = p_token;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.newsletter_subscribe(text, text, text)
  from public, anon, authenticated;
revoke all on function public.newsletter_confirm(uuid)
  from public, anon, authenticated;
revoke all on function public.newsletter_unsubscribe(uuid)
  from public, anon, authenticated;

grant execute on function public.newsletter_subscribe(text, text, text) to service_role;
grant execute on function public.newsletter_confirm(uuid) to service_role;
grant execute on function public.newsletter_unsubscribe(uuid) to service_role;
