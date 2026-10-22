-- ============================================================
-- Migration 009: Pagos y suscripciones (Frente F2)
-- Proveedores: Flow.cl / Mercado Pago / mock (desarrollo).
-- Idempotente: seguro reejecutar (if not exists / or replace / drop policy if exists).
-- ============================================================

-- ---- Columnas de facturación en profiles ----
-- billing_customer_id: id del cliente en el proveedor (customerId Flow / collector MP).
-- NOTA (F1): agregar estas columnas al trigger que protege columnas de
-- facturación para que el usuario NO pueda editarlas vía update propio.
alter table public.profiles
  add column if not exists billing_customer_id text;

alter table public.profiles
  add column if not exists trial_ends_at timestamptz;

-- ============================================================
-- subscriptions: una fila por suscripción (intento de checkout o activa)
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('flow', 'mercadopago', 'mock')),
  provider_customer_id text,
  provider_subscription_id text,
  plan text not null check (plan in ('pro', 'elite')),
  period text not null default 'mensual' check (period in ('mensual', 'anual')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'past_due', 'canceled', 'expired')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists subscriptions_provider_sub_idx
  on public.subscriptions (provider_subscription_id);

alter table public.subscriptions enable row level security;

-- El usuario solo LEE lo suyo. Escritura: exclusivamente service role
-- (el service role bypassa RLS; no hay policies de insert/update/delete).
drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ============================================================
-- payment_events: webhook crudo, idempotencia por event_id
-- ============================================================
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

-- Idempotencia: un evento del proveedor se procesa una sola vez.
create unique index if not exists payment_events_provider_event_idx
  on public.payment_events (provider, event_id);

-- Sin policies de lectura: solo service role (el usuario no necesita ver
-- los payloads crudos de los webhooks).
alter table public.payment_events enable row level security;

-- ============================================================
-- referrals: programa de referidos (M3)
-- ============================================================
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending'
    check (status in ('pending', 'rewarded', 'canceled')),
  reward_applied text check (reward_applied in ('free_month')),
  reward_period_end timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (referrer_id, referred_id)
);

create index if not exists referrals_referred_idx on public.referrals (referred_id);
create index if not exists referrals_code_idx on public.referrals (referral_code);

alter table public.referrals enable row level security;

-- El usuario ve los referidos donde participa (como patrocinador).
drop policy if exists "own referrals read" on public.referrals;
create policy "own referrals read"
  on public.referrals for select
  using (auth.uid() = referrer_id);

-- ============================================================
-- Referral codes: un código corto por usuario, generado al registrarse.
-- Tabla aparte para que el código exista antes de cualquier referido.
-- ============================================================
create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

drop policy if exists "own referral code read" on public.referral_codes;
create policy "own referral code read"
  on public.referral_codes for select
  using (auth.uid() = user_id);

-- Generación automática del código + captura del referido al crear usuario.
-- La cookie ?ref= la captura el server action de signup (options.data.referred_by).
create or replace function public.handle_referral_code()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  referred_by text;
  referrer_id uuid;
  base text;
  candidate text;
  suffix text;
begin
  -- 1. Código corto único para el usuario nuevo.
  base := coalesce(
    regexp_replace(lower(new.raw_user_meta_data ->> 'full_name'), '[^a-z0-9]', '', 'g'),
    ''
  );
  if char_length(base) < 3 then
    base := 'reclu';
  end if;
  base := left(base, 6);
  loop
    suffix := substr(md5(random()::text), 1, 4);
    candidate := base || '-' || suffix;
    exit when not exists (select 1 from public.referral_codes where code = candidate);
  end loop;
  insert into public.referral_codes (user_id, code) values (new.id, candidate);

  -- 2. Si vino con ?ref=CODIGO, registrar el vínculo (pending).
  referred_by := new.raw_user_meta_data ->> 'referred_by';
  if referred_by is not null and char_length(referred_by) > 0 then
    select user_id into referrer_id from public.referral_codes
      where code = referred_by limit 1;
    if referrer_id is not null and referrer_id <> new.id then
      insert into public.referrals (referrer_id, referred_id, referral_code, status)
      values (referrer_id, new.id, referred_by, 'pending')
      on conflict (referrer_id, referred_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_referral_code_created on auth.users;
create trigger on_referral_code_created
  after insert on auth.users
  for each row execute function public.handle_referral_code();
