-- ============================================================
-- Migration 008: Planes y alertas — alinea base de datos con src/lib/plans.ts
-- Fuente de verdad de números: src/lib/plans.ts
--   Gratis  $0      — 5 consultas/día de chat, 2 portafolios, daily/weekly, email
--   Pro     $12.990 — 50 consultas/semana, 15 portafolios, realtime+daily/weekly, email+telegram
--   Elite   $16.990 — chat ilimitado, portafolios ilimitados, realtime, email+telegram, CSV
-- 100% idempotente: segura de re-ejecutar en el SQL Editor de Supabase.
-- Corre después de la 007: el trigger de profiles solo deja pasar a
-- service_role o a quien marque set_config('reclu.trusted','on',true).
-- Esta migración re-crea funciones que escriben cuotas, chat_id, baja y
-- trial_ends_at, así que vuelven a abrir ese canal. Las tres RPC quedan
-- solo para service_role (la app las llama con el cliente de servicio).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cuota de chat alineada con plans.ts (Gratis 5/día, Pro 50/sem, Elite ilimitado)
-- ------------------------------------------------------------
alter table public.profiles add column if not exists chat_quota_used integer not null default 0;
alter table public.profiles add column if not exists chat_reset_at timestamptz not null default now();
alter table public.profiles add column if not exists chat_quota_limit integer not null default 5;

-- Elite no tiene tope de chat: límite alto + ventana de 1 hora (se renueva sola).
-- chat_quota_limit guarda el valor "efectivo" que usa check_chat_quota.
update public.profiles
set chat_quota_limit = case
  when plan = 'elite' then 1000000
  when plan = 'pro' then 50
  else 5
end
where
  (plan = 'elite' and chat_quota_limit < 1000000)
  or (plan = 'pro' and chat_quota_limit not in (50))
  or (plan = 'free' and chat_quota_limit <> 5);

-- update utilitario de ventana de reset (sin columna nueva: se deriva del plan)
create or replace function public.reset_chat_quota_if_stale()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.plan is distinct from old.plan then
    new.chat_quota_limit := case
      when new.plan = 'elite' then 1000000
      when new.plan = 'pro' then 50
      else 5
    end;
  end if;

  if new.chat_reset_at < now() - interval '7 days' then
    new.chat_quota_used := 0;
    new.chat_reset_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists reset_chat_quota on public.profiles;
create trigger reset_chat_quota
  before insert or update on public.profiles
  for each row execute function public.reset_chat_quota_if_stale();

-- check_chat_quota: ventana por plan (elite se renueva cada hora = ilimitado en la práctica)
create or replace function public.check_chat_quota(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_plan text;
  v_used integer;
  v_reset_at timestamptz;
  v_limit integer;
  v_window interval;
begin
  perform set_config('reclu.trusted', 'on', true);

  select plan, chat_quota_used, chat_reset_at
    into v_plan, v_used, v_reset_at
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'profile_not_found');
  end if;

  v_limit := case
    when v_plan = 'elite' then 1000000
    when v_plan = 'pro' then 50
    else 5
  end;

  v_window := case
    when v_plan = 'elite' then interval '1 hour'
    when v_plan = 'pro' then interval '7 days'
    else interval '1 day'
  end;

  if v_reset_at is null or v_reset_at < now() - v_window then
    v_used := 0;
    v_reset_at := now();
  end if;

  if v_used >= v_limit then
    update public.profiles
       set chat_quota_used = v_used,
           chat_reset_at = v_reset_at,
           chat_quota_limit = v_limit
     where id = p_user_id;

    return jsonb_build_object(
      'allowed', false,
      'plan', v_plan,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'reset_at', v_reset_at
    );
  end if;

  v_used := v_used + 1;

  update public.profiles
     set chat_quota_used = v_used,
         chat_reset_at = v_reset_at,
         chat_quota_limit = v_limit
   where id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'plan', v_plan,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'reset_at', v_reset_at
  );
end;
$$;

revoke execute on function public.check_chat_quota(uuid) from public, anon, authenticated;
grant execute on function public.check_chat_quota(uuid) to service_role;

-- ------------------------------------------------------------
-- 2. Frecuencia de alertas: default 'daily' para usuarios NUEVOS.
--    Base vieja: gratis con 'realtime' → 'daily' (los pagados no se tocan).
-- ------------------------------------------------------------
alter table public.profiles alter column alert_frequency set default 'daily';

-- trial_ends_at se usa abajo: crearla antes (idempotente; se repite en la seccion 3).
alter table public.profiles add column if not exists trial_ends_at timestamptz;

update public.profiles
set alert_frequency = 'daily'
where plan = 'free'
  and alert_frequency = 'realtime'
  and (trial_ends_at is null or trial_ends_at < now());

-- ------------------------------------------------------------
-- 3. Telegram, baja de correo, digest semanal y prueba de Pro
--    (trial_ends_at, telegram_chat_id y unsubscribe_token son SOLO DE SERVIDOR:
--     el frente F1 agrega un trigger que impide al cliente cambiarlos).
-- ------------------------------------------------------------
alter table public.profiles add column if not exists telegram_chat_id text;
alter table public.profiles add column if not exists telegram_link_code text;
alter table public.profiles add column if not exists alert_channel text not null default 'email'
  check (alert_channel in ('email', 'telegram', 'both'));
alter table public.profiles add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
alter table public.profiles add column if not exists email_unsubscribed boolean not null default false;
alter table public.profiles add column if not exists weekly_digest boolean not null default true;
alter table public.profiles add column if not exists trial_ends_at timestamptz;

create unique index if not exists idx_profiles_telegram_chat on public.profiles(telegram_chat_id)
  where telegram_chat_id is not null;
create unique index if not exists idx_profiles_telegram_code on public.profiles(telegram_link_code)
  where telegram_link_code is not null;
create unique index if not exists idx_profiles_unsubscribe_token on public.profiles(unsubscribe_token);

-- ------------------------------------------------------------
-- 4. Prueba de Pro por 7 días para usuarios NUEVOS (los existentes no se tocan).
--    RLS: los clientes solo pueden leer su propio perfil, no escribir estas
--    columnas (ver notas: trigger de F1 las protege).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('reclu.trusted', 'on', true);

  insert into public.profiles (
    id, email, full_name, alert_frequency, trial_ends_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    'daily',
    now() + interval '7 days'
  );
  return new;
end;
$$;

-- Recrea el trigger del signup con la función nueva (idempotente).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RPC segura: pega telegram_chat_id desde el webhook (service role).
create or replace function public.link_telegram_chat(p_code text, p_chat_id text)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform set_config('reclu.trusted', 'on', true);

  if p_code is null or length(trim(p_code)) < 6 then
    return false;
  end if;

  select id into v_user
  from public.profiles
  where telegram_link_code = trim(p_code)
  limit 1;

  if v_user is null then
    return false;
  end if;

  update public.profiles
  set telegram_chat_id = p_chat_id
  where id = v_user;

  return true;
end;
$$;

revoke execute on function public.link_telegram_chat(text, text) from public, anon, authenticated;
grant execute on function public.link_telegram_chat(text, text) to service_role;

-- RPC segura: marca la baja de correo por token (service role).
create or replace function public.unsubscribe_by_token(p_token uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('reclu.trusted', 'on', true);

  update public.profiles
  set email_unsubscribed = true
  where unsubscribe_token = p_token;

  return found;
end;
$$;

revoke execute on function public.unsubscribe_by_token(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_by_token(uuid) to service_role;
