-- ============================================================
-- Migracion 039 (F51-A): referidos.
--
-- Base del programa de referidos:
--   * profiles.referral_code: codigo publico unico por usuario.
--   * referrals: una fila por invitado (referred_id unico) con estado
--     pending -> rewarded.
--   * reward_referral(): RPC de service_role que premia UNA sola vez
--     al referrer (1 mes de Pro via trial_ends_at).
--
-- Reglas:
--   * RLS: el usuario solo lee las filas donde es referrer. Nadie
--     escribe referrals desde el cliente (solo service_role).
--   * Sin autorreferidos: reward_referral ignora referrer_id =
--     referred_id y el chequeo tambien vive en src/lib/referrals.ts.
--   * Todo el flujo de producto queda apagado por defecto con
--     REFERRALS_ENABLED (ver src/lib/referrals.ts).
--
-- 100% idempotente: segura de re-ejecutar en el SQL Editor de Supabase.
-- Aplicar despues de 037_reglas_alerta.sql.
--
-- ROLLBACK (manual, a conciencia):
--   drop trigger if exists z_set_referral_code on public.profiles;
--   drop function if exists public.set_referral_code();
--   drop function if exists public.generate_referral_code();
--   drop function if exists public.reward_referral(uuid);
--   drop table if exists public.referrals;
--   drop index if exists public.idx_profiles_referral_code;
--   alter table public.profiles drop column if exists referral_code;
-- ============================================================

-- ----------------------------------------------------------------------------
-- 1. Codigo de referido en profiles.
--    Null permitido: los perfiles viejos se rellenan mas abajo y el
--    trigger cubre los nuevos.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists referral_code text;

create unique index if not exists idx_profiles_referral_code
  on public.profiles(referral_code)
  where referral_code is not null;

-- Backfill determinista e idempotente: 8 hex del id. No colisiona en la
-- practica y evita depender de la visibilidad de una funcion volatil dentro
-- del mismo UPDATE.
update public.profiles
set referral_code = upper(substr(md5(id::text), 1, 8))
where referral_code is null;

-- ----------------------------------------------------------------------------
-- 2. Generacion de codigos.
--    8 caracteres [A-Z0-9] derivados de gen_random_uuid(); se reintenta si
--    choca con uno existente. Solo la usan el trigger y el service_role.
-- ----------------------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_attempts integer := 0;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from public.profiles where referral_code = v_code
    );
    v_attempts := v_attempts + 1;
    if v_attempts >= 20 then
      -- Fallback practicamente inalcanzable: 12 hex.
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      exit;
    end if;
  end loop;

  return v_code;
end;
$$;

-- Trigger de relleno. Se llama z_... para correr DESPUES de
-- protect_profile_insert (007): si un cliente intenta fijar su propio
-- codigo, la proteccion lo revierte a NULL y recien ahi generamos uno.
create or replace function public.set_referral_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.referral_code is null or new.referral_code = '' then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

revoke execute on function public.generate_referral_code() from public, anon, authenticated;
revoke execute on function public.set_referral_code() from public, anon, authenticated;

drop trigger if exists z_set_referral_code on public.profiles;
create trigger z_set_referral_code
  before insert on public.profiles
  for each row execute function public.set_referral_code();

-- ----------------------------------------------------------------------------
-- 3. Tabla referrals.
-- ----------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'rewarded')),
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);

alter table public.referrals enable row level security;

-- El usuario ve solo sus referidos (los que el invito).
drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own
  on public.referrals
  for select
  to authenticated
  using (referrer_id = (select auth.uid()));

-- Sin escritura para anon/authenticated: solo service_role inserta y
-- reward_referral cambia el estado.
revoke all on table public.referrals from anon;
revoke insert, update, delete on table public.referrals from authenticated;
grant select on table public.referrals to authenticated;

-- ----------------------------------------------------------------------------
-- 4. reward_referral(): pending -> rewarded una sola vez + 1 mes de Pro.
--
--    El "mes de Pro" se expresa como ventana de trial (isTrialPro en
--    src/lib/plans.ts): a un usuario free se le extiende trial_ends_at
--    desde max(ahora, vencimiento actual). A un plan ya pagado no se le
--    toca la ventana (ya tiene Pro/Elite).
--
--    Idempotente por construccion: el UPDATE filtra status = 'pending';
--    una segunda llamada no encuentra fila y devuelve false.
-- ----------------------------------------------------------------------------
create or replace function public.reward_referral(p_referred uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
begin
  perform set_config('reclu.trusted', 'on', true);

  if p_referred is null then
    return false;
  end if;

  update public.referrals
     set status = 'rewarded',
         rewarded_at = now()
   where referred_id = p_referred
     and status = 'pending'
     and referrer_id <> referred_id
  returning referrer_id into v_referrer;

  if v_referrer is null then
    return false;
  end if;

  update public.profiles
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now())
                        + interval '1 month',
         updated_at = now()
   where id = v_referrer
     and plan = 'free';

  return true;
end;
$$;

revoke execute on function public.reward_referral(uuid) from public, anon, authenticated;
grant execute on function public.reward_referral(uuid) to service_role;
