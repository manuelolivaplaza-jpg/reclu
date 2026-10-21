-- ============================================================
-- Migration 052: Límites de Mi portafolio por plan (F74)
--
-- Espejo en la base de `src/lib/plans.ts`:
--   Gratis  10 posiciones
--   Pro     50 posiciones
--   Elite  200 posiciones
-- La prueba vigente de un plan Gratis cuenta como Pro (trial_ends_at),
-- igual que `isTrialPro()` y que el trigger `enforce_alert_rule_limits`
-- de la migración 037.
--
-- Depende de la 050 (F58): agrega quantity/avg_cost/currency/market/broker
-- y amplía el check de `source` con 'cartola'. Este trigger no toca esas
-- columnas: solo cuenta filas por `user_id`, así que también es seguro si
-- la 050 todavía no se aplicó.
--
-- No baja a nadie que ya tenga más posiciones: solo rechaza inserts nuevos
-- que superen el tope. service_role (jobs internos) no cuenta el tope,
-- mismo criterio que follows y alert_rules.
--
-- 100% idempotente: create or replace + drop trigger if exists.
-- No corre sola: aplicarla en el SQL Editor. No modifica datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- Tope por plan. Corre también por la API REST (no solo por la app).
-- ------------------------------------------------------------
create or replace function public.enforce_user_holdings_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_trial timestamptz;
  v_count integer;
  v_limit integer;
  v_paid boolean;
begin
  -- Jobs internos y service role no cuentan el tope.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'Solo puedes guardar posiciones en tu propia cuenta.';
  end if;

  select plan, trial_ends_at
    into v_plan, v_trial
  from public.profiles
  where id = new.user_id
  for update;

  if not found then
    raise exception 'No encontramos tu perfil.';
  end if;

  -- Prueba vigente = Pro para el tope (igual que plans.ts).
  v_paid := coalesce(v_plan, 'free') in ('pro', 'elite')
    or (v_trial is not null and v_trial > now());

  v_limit := case
    when coalesce(v_plan, 'free') = 'elite' then 200
    when v_paid then 50
    else 10
  end;

  select count(*)::integer into v_count
  from public.user_holdings
  where user_id = new.user_id;

  -- Un upsert de un simbolo que ya existe no suma posiciones: on conflict
  -- dispara este trigger BEFORE INSERT igual, asi que no se cuenta.
  if exists (
    select 1 from public.user_holdings
    where user_id = new.user_id and symbol = new.symbol
  ) then
    return new;
  end if;

  if v_count >= v_limit then
    raise exception 'Alcanzaste el límite de posiciones de tu plan (% posiciones).', v_limit;
  end if;

  return new;
end;
$$;

-- No se revoca EXECUTE: es una función de trigger (igual que
-- enforce_alert_rule_limits y enforce_follow_limits). Llamarla por SQL
-- falla con "trigger functions can only be called as triggers".

-- Una posicion por simbolo y usuario: base del upsert de F60
-- (on conflict (user_id, symbol)). Falla si ya hay duplicados: limpiarlos antes.
create unique index if not exists user_holdings_user_symbol_key
  on public.user_holdings (user_id, symbol);

drop trigger if exists enforce_user_holdings_limit on public.user_holdings;
create trigger enforce_user_holdings_limit
  before insert on public.user_holdings
  for each row execute function public.enforce_user_holdings_limit();

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop trigger if exists enforce_user_holdings_limit on public.user_holdings;
-- drop function if exists public.enforce_user_holdings_limit();
-- ============================================================
