-- ============================================================
-- Migration 007: Seguridad RLS — F1
-- 1) Trigger que protege columnas sensibles de profiles (plan, cuotas).
-- 2) Límite de follows en la base según plan (free 2 / pro 15 / elite ∞).
-- 3) Rate limit anónimo del chat: chat_rate_limits + check_anon_chat_quota().
-- Idempotente: seguro de re-ejecutar en el SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES: el usuario solo edita preferencias inofensivas.
--    Con anon key no puede cambiarse plan, cuotas de chat ni ids de
--    facturación. service_role NO está afectado (facturación/admin).
-- ------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new; -- service_role y el propio Postgres/admin pueden todo
  end if;
  -- Columnas sensibles: se revierte cualquier cambio del usuario.
  new.plan := old.plan;
  new.stripe_customer_id := old.stripe_customer_id;
  new.chat_quota_used := old.chat_quota_used;
  new.chat_reset_at := old.chat_reset_at;
  new.chat_quota_limit := old.chat_quota_limit;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- INSERT: un usuario no puede crear su perfil con plan pagado.
create or replace function public.protect_profile_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if new.plan is distinct from 'free' then
    raise exception 'No puedes asignarte un plan por tu cuenta.'
      with hint = 'El plan se cambia desde facturación.';
  end if;
  new.stripe_customer_id := null;
  return new;
end;
$$;

drop trigger if exists protect_profile_insert on public.profiles;
create trigger protect_profile_insert
  before insert on public.profiles
  for each row execute function public.protect_profile_insert();

-- ------------------------------------------------------------
-- 2. FOLLOWS: límite por plan y bloqueo de portafolios premium.
--    Aplica incluso insertando directo vía API REST.
-- ------------------------------------------------------------
create or replace function public.enforce_follow_limits()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_plan text;
  v_count integer;
  v_premium boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'Solo puedes seguir portafolios con tu propia cuenta.';
  end if;
  select premium into v_premium from public.portfolios where id = new.portfolio_id;
  if v_premium then
    select plan into v_plan from public.profiles where id = auth.uid();
    if coalesce(v_plan, 'free') = 'free' then
      raise exception 'Este portafolio requiere un plan de pago (Pro o Elite).';
    end if;
  end if;
  select plan into v_plan from public.profiles where id = auth.uid();
  if coalesce(v_plan, 'free') <> 'elite' then
    select count(*) into v_count from public.follows where user_id = auth.uid();
    if v_count >= (case when v_plan = 'pro' then 15 else 2 end) then
      raise exception 'Alcanzaste el límite de portafolios de tu plan.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_follow_limits on public.follows;
create trigger enforce_follow_limits
  before insert on public.follows
  for each row execute function public.enforce_follow_limits();

-- ------------------------------------------------------------
-- 3. RATE LIMIT ANÓNIMO DEL CHAT (2 preguntas/día por IP hasheada).
--    Sin acceso directo para anon/authenticated: solo vía RPC.
-- ------------------------------------------------------------
create table if not exists public.chat_rate_limits (
  key text primary key,
  day date not null default current_date,
  count integer not null default 0
);

alter table public.chat_rate_limits enable row level security;
-- Sin políticas: ninguna consulta directa de anon/authenticated pasa RLS.

create or replace function public.check_anon_chat_quota(p_key text, p_limit integer)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_row public.chat_rate_limits;
  v_allowed boolean;
  v_count integer;
begin
  if p_limit is null or p_limit < 0 then
    p_limit := 2;
  end if;
  -- Fila de hoy (si es de otro día, se reinicia).
  insert into public.chat_rate_limits (key, day, count)
  values (p_key, current_date, 0)
  on conflict (key) do update
    set day = current_date,
        count = case when public.chat_rate_limits.day = current_date
                     then public.chat_rate_limits.count else 0 end
    where public.chat_rate_limits.key = p_key;

  select * into v_row from public.chat_rate_limits where key = p_key for update;

  if v_row.day is distinct from current_date then
    v_row.day := current_date;
    v_row.count := 0;
  end if;

  v_count := v_row.count;
  v_allowed := v_count < p_limit;

  if v_allowed then
    v_count := v_count + 1;
    update public.chat_rate_limits
      set count = v_count, day = current_date
      where key = p_key;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'count', v_count,
    'limit', p_limit,
    'reset_at', (current_date + 1)::timestamptz
  );
end;
$$;

grant execute on function public.check_anon_chat_quota(text, integer) to service_role;
revoke execute on function public.check_anon_chat_quota(text, integer) from anon, authenticated;

-- Limpieza diaria de llaves viejas (solo si pg_cron está disponible).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge-chat-rate-limits') where exists (
      select 1 from cron.job where jobname = 'purge-chat-rate-limits');
    perform cron.schedule('purge-chat-rate-limits', '0 5 * * *',
      'delete from public.chat_rate_limits where day < current_date');
  end if;
exception when others then
  null; -- sin permisos para cron: no bloquea la migración
end $$;
