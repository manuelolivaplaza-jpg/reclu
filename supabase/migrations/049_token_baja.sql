-- ============================================================
-- Migration 049: token de baja con expiración y rotación (M5)
-- 1) profiles.unsubscribe_token_created_at: fecha de emisión del token.
-- 2) unsubscribe_by_token: rechaza tokens de más de 180 días y, al usarse,
--    marca la baja, rota el token y renueva la fecha.
-- Idempotente. No cambia grants: sigue siendo solo service_role.
-- ============================================================

alter table public.profiles
  add column if not exists unsubscribe_token_created_at timestamptz not null default now();

-- Si una corrida anterior dejó la columna nullable, normalizarla. El UPDATE
-- necesita 'reclu.trusted' para que protect_profile_columns (007) no lo revierta.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'unsubscribe_token_created_at'
      and is_nullable = 'YES'
  ) then
    perform set_config('reclu.trusted', 'on', true);

    update public.profiles
       set unsubscribe_token_created_at = now()
     where unsubscribe_token_created_at is null;

    alter table public.profiles
      alter column unsubscribe_token_created_at set default now();
    alter table public.profiles
      alter column unsubscribe_token_created_at set not null;
  end if;
end $$;

-- Un token sirve 180 días y un solo uso: al darse de baja se rota, así que
-- un enlace filtrado no permite bajas permanentes ni repetidas.
create or replace function public.unsubscribe_by_token(p_token uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_rotated uuid := gen_random_uuid();
begin
  perform set_config('reclu.trusted', 'on', true);

  update public.profiles
     set email_unsubscribed = true,
         unsubscribe_token = v_rotated,
         unsubscribe_token_created_at = now()
   where unsubscribe_token = p_token
     and unsubscribe_token_created_at > now() - interval '180 days';

  return found;
end;
$$;

revoke execute on function public.unsubscribe_by_token(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_by_token(uuid) to service_role;

-- ============================================================
-- ROLLBACK (solo si se quiere volver al comportamiento anterior):
--
-- create or replace function public.unsubscribe_by_token(p_token uuid)
-- returns boolean language plpgsql
-- security definer set search_path = ''
-- as $$
-- begin
--   perform set_config('reclu.trusted', 'on', true);
--   update public.profiles set email_unsubscribed = true
--    where unsubscribe_token = p_token;
--   return found;
-- end;
-- $$;
-- alter table public.profiles drop column if exists unsubscribe_token_created_at;
-- ============================================================
