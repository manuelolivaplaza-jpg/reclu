-- ============================================================
-- Migration 007: Seguridad RLS — F1
-- 1) Trigger que protege columnas sensibles de profiles (plan, cuotas).
--    Enfoque genérico: revierte todo lo que no esté en la lista blanca de
--    preferencias (no nombra columnas que quizá no existan).
--    Las funciones confiables (check_chat_quota, etc.) marcan la transacción
--    con set_config('reclu.trusted','on',true) y el trigger las deja pasar.
-- 2) Límite de follows en la base según plan (free 2 / pro 15 / elite ∞).
-- 3) Rate limit anónimo del chat: chat_rate_limits + check_anon_chat_quota().
-- 4) Re-crea check_chat_quota (006) con 'reclu.trusted' para que el trigger
--    de protección no revierta el incremento de cuota. F4 (008) la redefine.
-- Idempotente: seguro de re-ejecutar en el SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES: el usuario solo edita preferencias inofensivas.
--    Enfoque genérico: todo lo que NO esté en la lista de columnas
--    permitidas se revierte a su valor en OLD. Así no dependemos de nombrar
--    columnas que quizá no existan (stripe_customer_id, trial_ends_at,
--    telegram_chat_id, etc.): cualquier columna nueva sensible queda
--    protegida por defecto.
--    service_role y las funciones confiables del backend (que marcan
--    set_config('reclu.trusted','on',true) en la transacción) no están
--    afectados: facturación y cuotas las maneja el servidor.
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
  -- Funciones confiables del backend (check_chat_quota, link_telegram_chat,
  -- unsubscribe_by_token...): escriben cuotas/tokens legítimamente.
  if current_setting('reclu.trusted', true) = 'on' then
    return new;
  end if;
  -- Lista blanca de preferencias editables por el usuario. Todo lo demás
  -- (plan, cuotas, ids de facturación, fechas de prueba, tokens, chat_id...)
  -- se revierte al valor previo de la fila.
  new := jsonb_populate_record(
    new,
    to_jsonb(old)
      - array['full_name', 'alert_frequency', 'alert_channel', 'weekly_digest',
              'email_unsubscribed', 'updated_at']
  );
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
-- a_... para que corra ANTES que reset_chat_quota (orden alfabético de
-- triggers): la protección primero revierte, y el reinicio semanal de cuota
-- de la 006 se evalúa después sin ser anulado.
create trigger a_protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- INSERT: un usuario no puede crear su perfil con plan pagado ni datos
-- sensibles pre-cargados. Mismo enfoque genérico: solo se aceptan
-- id/email/full_name y preferencias; lo demás cae a los defaults de la tabla.
create or replace function public.protect_profile_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;
  if current_setting('reclu.trusted', true) = 'on' then
    return new;
  end if;
  -- Base = una fila con los DEFAULTS de la tabla (NO new): el usuario no
  -- puede fijar ninguna columna sensible al crear su perfil (plan, cuotas,
  -- tokens, ids de facturación...). Encima se copian solo las columnas de la
  -- lista blanca que trajo el INSERT (id, email, preferencias). El resto de
  -- columnas queda en su default de tabla; sin default => null.
  declare
    v_base public.profiles;
    v_whitelist constant text[] := array[
      'id', 'email', 'full_name',
      'alert_frequency', 'alert_channel', 'weekly_digest',
      'email_unsubscribed', 'created_at', 'updated_at'
    ];
    v_in jsonb := to_jsonb(new);
    v_out jsonb := '{}'::jsonb;
    r record;
    v_val text;
  begin
    -- Las columnas NOT NULL sin default ya quedan cubiertas por el input
    -- (email siempre viene; el resto usa default o llega en la whitelist).
    for r in
      select column_name, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
    loop
      if r.column_name = any (v_whitelist) then
        -- Whitelist: se respeta lo que envió el INSERT (si lo envió).
        v_val := v_in ->> r.column_name;
        if v_val is not null then
          v_out := jsonb_set(v_out, array[r.column_name],
            to_jsonb(v_val));
        end if;
      elsif r.column_default is not null then
        -- Columna sensible: su default de tabla, evaluado en el servidor.
        execute 'select (' || r.column_default || ')::text'
          into v_val;
        if v_val is not null then
          v_out := jsonb_set(v_out, array[r.column_name],
            to_jsonb(v_val));
        end if;
      end if;
      -- Sin default y fuera de la whitelist: queda null (no la fijó el usuario).
    end loop;

    new := jsonb_populate_record(v_base, v_out);
  end;
  new.plan := 'free';
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
  select plan into v_plan from public.profiles where id = auth.uid() for update;
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
-- 2b. CHECK_CHAT_QUOTA: re-creada desde 006 con el canal 'reclu.trusted'.
--     Sin esto, el trigger a_protect_profile_columns revertiría el
--     incremento de chat_quota_used (auth.role() sigue siendo
--     'authenticated' dentro de una security definer). NOTA: F4 la
--     redefinirá en la 008; debe conservar el set_config.
--     El servicio usa la service_role key, así que no pasa por aquí;
--     esto queda para llamadas RPC directas del cliente autenticado.
-- ------------------------------------------------------------
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
    when v_plan = 'elite' then 500
    when v_plan = 'pro' then 50
    else 5
  end;

  v_window := case
    when v_plan in ('pro', 'elite') then interval '7 days'
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

-- El incremento de cuota solo lo decide el backend: los clientes no pueden
-- llamar esta RPC directo (evita auto-consumo/reset desde el navegador).
revoke execute on function public.check_chat_quota(uuid) from anon, authenticated;

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
