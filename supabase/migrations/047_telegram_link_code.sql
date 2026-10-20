-- ============================================================
-- Migración 047 — Código de vinculación de Telegram (M10)
--
-- `prepareTelegramLink` escribía `profiles.telegram_link_code` desde el
-- cliente autenticado, pero el trigger `a_protect_profile_columns` de la
-- 007 revierte toda columna fuera de su lista blanca: el código nunca
-- persistía. Abrir esa columna a escritura directa tampoco sirve: el
-- navegador podría tocarla a voluntad.
--
-- La vía correcta es esta RPC `security definer`:
--   * solo para `authenticated` (revoke a public/anon);
--   * usa `auth.uid()`, no parámetros, así que solo cambia el perfil propio;
--   * genera el código aleatorio en el servidor;
--   * marca `reclu.trusted` antes del UPDATE para que el trigger de la 007
--     permita escribir la columna sensible.
--
-- Idempotente: `create or replace`, revoke/grant repetibles.
-- Aplicar después de la 008 (columna `telegram_link_code`).
--
-- ROLLBACK (manual, a conciencia):
--   drop function if exists public.create_telegram_link_code();
-- ============================================================

create or replace function public.create_telegram_link_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'No autenticado.'
      using errcode = '28000';
  end if;

  -- 128 bits en hex, sin guiones (32 caracteres).
  v_code := replace(pg_catalog.gen_random_uuid()::text, '-', '');

  -- Canal de confianza de la 007: sin esto el trigger revierte el cambio.
  perform set_config('reclu.trusted', 'on', true);

  update public.profiles
     set telegram_link_code = v_code,
         updated_at = now()
   where id = v_user;

  if not found then
    raise exception 'Perfil no encontrado.'
      using errcode = 'P0002';
  end if;

  return v_code;
end;
$$;

revoke execute on function public.create_telegram_link_code() from public, anon;
grant execute on function public.create_telegram_link_code() to authenticated;
