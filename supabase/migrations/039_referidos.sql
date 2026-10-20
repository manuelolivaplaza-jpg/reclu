-- ============================================================
-- Migracion 039 (F51): referidos sobre el esquema de la 009.
--
-- La 009 (pagos y suscripciones) es la fuente de verdad del programa:
--   * referral_codes(user_id, code): un codigo corto por usuario, del
--     tipo `manuel-ab12`, generado por el trigger handle_referral_code
--     sobre auth.users.
--   * referrals(referrer_id, referred_id, referral_code, status,
--     reward_applied, reward_period_end, rewarded_at), con
--     unique (referrer_id, referred_id) y status pending|rewarded|canceled.
--   * El vinculo se crea al registrarse leyendo
--     raw_user_meta_data ->> 'referred_by' (mismo trigger de la 009).
--
-- Esta migracion NO duplica esas piezas: solo refuerza el invariante de
-- un invitado por fila, deja `referrals` en solo-lectura para el cliente
-- y define `reward_referral()` para el primer pago del invitado.
--
-- Requiere la 009 aplicada. 100% idempotente: segura de re-ejecutar.
--
-- ROLLBACK (manual, a conciencia):
--   alter table public.referrals
--     drop constraint if exists referrals_referred_id_key;
--   drop function if exists public.reward_referral(uuid);
-- ============================================================

-- ----------------------------------------------------------------------------
-- 1. Un invitado solo puede estar referido una vez.
--    La 009 ya tiene unique (referrer_id, referred_id); este constraint
--    refuerza el invariante por referred_id. Se agrega solo si no hay ya
--    un indice unico de una sola columna sobre referred_id.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.referrals') is not null and not exists (
    select 1
      from pg_index i
      join pg_attribute a
        on a.attrelid = i.indrelid
       and a.attnum = any (i.indkey)
     where i.indrelid = 'public.referrals'::regclass
       and i.indisunique
       and i.indnatts = 1
       and a.attname = 'referred_id'
  ) then
    alter table public.referrals
      add constraint referrals_referred_id_key unique (referred_id);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Sin escritura para anon/authenticated: solo service_role inserta y
--    reward_referral cambia el estado. La lectura conserva la policy
--    "own referrals read" creada por la 009.
-- ----------------------------------------------------------------------------
revoke all on table public.referrals from anon;
revoke insert, update, delete on table public.referrals from authenticated;
grant select on table public.referrals to authenticated;

-- ----------------------------------------------------------------------------
-- 3. reward_referral(): pending -> rewarded una sola vez + 1 mes de Pro.
--
--    El "mes de Pro" se expresa como ventana de trial (isTrialPro en
--    src/lib/plans.ts): a un usuario free se le extiende trial_ends_at
--    desde max(ahora, vencimiento actual). A un plan ya pagado no se le
--    toca la ventana, pero la fila queda marcada con el premio.
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
  v_period_end timestamptz;
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

  -- Ventana del mes gratis: un mes desde el vencimiento actual (o ahora).
  select greatest(coalesce(trial_ends_at, now()), now()) + interval '1 month'
    into v_period_end
    from public.profiles
   where id = v_referrer;

  update public.profiles
     set trial_ends_at = v_period_end,
         updated_at = now()
   where id = v_referrer
     and plan = 'free';

  update public.referrals
     set reward_applied = 'free_month',
         reward_period_end = v_period_end
   where referred_id = p_referred;

  return true;
end;
$$;

revoke execute on function public.reward_referral(uuid) from public, anon, authenticated;
grant execute on function public.reward_referral(uuid) to service_role;
