-- ============================================================
-- Migration 037: Reglas de alerta a medida (F39)
-- El usuario define criterios ("NVDA en cualquier fuente", "Pelosi",
-- "compras de más de US$1.000.000") y el canal por el que quiere el aviso.
-- Límites (igual que src/lib/alert-rules.ts):
--   Gratis  3 reglas
--   Pro     50 reglas
--   Elite   50 reglas (mismo tope de pago; la prueba vigente cuenta como Pro)
-- Idempotente: create table/index if not exists, create or replace,
-- drop policy/trigger if exists. Dos ejecuciones seguidas no fallan.
-- No corre sola: aplicarla en el SQL Editor. No toca datos de otras tablas.
-- ============================================================

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ticker', 'portfolio', 'source', 'min_amount')),
  value text not null check (char_length(btrim(value)) between 1 and 120),
  channel text not null default 'email' check (channel in ('email', 'telegram', 'both')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alert_rules_user
  on public.alert_rules (user_id, created_at desc);

-- Una regla por criterio. El canal se cambia borrando y creando de nuevo.
create unique index if not exists idx_alert_rules_user_kind_value
  on public.alert_rules (user_id, kind, lower(value));

alter table public.alert_rules enable row level security;

drop policy if exists "own alert rules read" on public.alert_rules;
create policy "own alert rules read"
  on public.alert_rules for select
  using (auth.uid() = user_id);

drop policy if exists "own alert rules insert" on public.alert_rules;
create policy "own alert rules insert"
  on public.alert_rules for insert
  with check (auth.uid() = user_id);

drop policy if exists "own alert rules update" on public.alert_rules;
create policy "own alert rules update"
  on public.alert_rules for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own alert rules delete" on public.alert_rules;
create policy "own alert rules delete"
  on public.alert_rules for delete
  using (auth.uid() = user_id);

revoke all on table public.alert_rules from public, anon;
grant select, insert, update, delete on table public.alert_rules to authenticated;
grant all on table public.alert_rules to service_role;

-- ------------------------------------------------------------
-- Tope por plan y validación del valor. Corre también por la API REST.
-- service_role normaliza y no cuenta el tope (mismo criterio que follows).
-- ------------------------------------------------------------
create or replace function public.enforce_alert_rule_limits()
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
  new.value := btrim(new.value);
  if new.value is null or char_length(new.value) = 0 or char_length(new.value) > 120 then
    raise exception 'Valor de regla inválido.';
  end if;

  if new.channel is null or new.channel not in ('email', 'telegram', 'both') then
    raise exception 'Valor de regla inválido.';
  end if;

  if new.kind = 'ticker' then
    new.value := upper(new.value);
    if new.value !~ '^[A-Z0-9.\-]{1,20}$' then
      raise exception 'Valor de regla inválido.';
    end if;
  elsif new.kind = 'portfolio' then
    if char_length(new.value) < 2
       or char_length(new.value) > 80
       or new.value ~ '[[:cntrl:]<>]' then
      raise exception 'Valor de regla inválido.';
    end if;
  elsif new.kind = 'source' then
    new.value := lower(new.value);
    if new.value !~ '^[a-z0-9_\-]{2,40}$' then
      raise exception 'Valor de regla inválido.';
    end if;
  elsif new.kind = 'min_amount' then
    if new.value !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' or new.value::numeric <= 0 then
      raise exception 'Valor de regla inválido.';
    end if;
  else
    raise exception 'Valor de regla inválido.';
  end if;

  new.updated_at := now();

  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'Solo puedes crear reglas con tu propia cuenta.';
  end if;

  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Solo puedes crear reglas con tu propia cuenta.';
  end if;

  select plan, trial_ends_at
    into v_plan, v_trial
  from public.profiles
  where id = new.user_id
  for update;

  if not found then
    raise exception 'No encontramos tu perfil.';
  end if;

  -- Prueba vigente = Pro para el tope y para Telegram (igual que plans.ts).
  v_paid := coalesce(v_plan, 'free') in ('pro', 'elite')
    or (v_trial is not null and v_trial > now());
  v_limit := case when v_paid then 50 else 3 end;

  if new.channel in ('telegram', 'both') and not v_paid then
    raise exception 'Telegram está disponible en Pro, Elite y durante la prueba.';
  end if;

  if tg_op = 'INSERT' then
    select count(*)::integer into v_count
    from public.alert_rules
    where user_id = new.user_id;

    if v_count >= v_limit then
      raise exception 'Alcanzaste el límite de reglas de alerta de tu plan.';
    end if;
  end if;

  return new;
end;
$$;

-- No se revoca EXECUTE: es una función de trigger (igual que enforce_follow_limits).
-- Llamarla por SQL falla con "trigger functions can only be called as triggers".

drop trigger if exists enforce_alert_rule_limits on public.alert_rules;
create trigger enforce_alert_rule_limits
  before insert or update on public.alert_rules
  for each row execute function public.enforce_alert_rule_limits();
