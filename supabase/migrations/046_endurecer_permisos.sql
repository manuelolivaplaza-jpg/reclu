-- ============================================================
-- Migracion 046 (SB1): endurecer permisos.
--
-- Cierra tres hallazgos de docs/revision-seguridad-2026-10-20.md:
--   * B1: las tablas publicas nuevas (027-034, 042) exponen
--     INSERT/UPDATE/DELETE a anon/authenticated via default
--     privileges de Supabase. Solo el service_role debe escribir.
--   * Fila 037: `enforce_alert_rule_limits()` no revoca EXECUTE a
--     public/anon/authenticated (por defecto EXECUTE es para PUBLIC).
--   * M3: la 045 anonimiza con un UPDATE puntual; nada fuerza la
--     anonimizacion en inserciones/actualizaciones futuras.
--
-- Idempotente: revokes repetibles, `create or replace function`,
-- `drop trigger if exists` + create, y guardas `to_regclass` /
-- `to_regprocedure` por si alguna tabla o funcion no existe.
--
-- Aplicar despues de 045_accionistas_anonimizar.sql.
--
-- ROLLBACK (manual, a conciencia):
--   grant insert, update, delete on table public.activist_filings to anon, authenticated;
--   grant insert, update, delete on table public.spinoffs to anon, authenticated;
--   grant insert, update, delete on table public.buybacks to anon, authenticated;
--   grant insert, update, delete on table public.cl_dividends to anon, authenticated;
--   grant insert, update, delete on table public.cl_material_events to anon, authenticated;
--   grant insert, update, delete on table public.cl_top_shareholders to anon, authenticated;
--   grant insert, update, delete on table public.cl_mutual_funds to anon, authenticated;
--   grant insert, update, delete on table public.cl_mutual_fund_holdings to anon, authenticated;
--   grant insert, update, delete on table public.sponsorships to anon, authenticated;
--   grant execute on function public.enforce_alert_rule_limits() to public;
--   drop trigger if exists anonimizar_accionista on public.cl_top_shareholders;
--   drop function if exists public.anonimizar_accionista();
--
-- Nota: las migraciones 027-034 y 042 solo otorgaban `grant select`; no
-- existe un grant previo de escritura que "restaurar" mas alla de volver
-- al default de Supabase.
-- ============================================================

-- ----------------------------------------------------------------------------
-- B1: nadie escribe las tablas publicas nuevas salvo service_role.
-- Cada tabla con guarda to_regclass por si alguna no existe todavia.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.activist_filings') is not null then
    revoke insert, update, delete on table public.activist_filings from anon, authenticated;
  end if;
  if to_regclass('public.spinoffs') is not null then
    revoke insert, update, delete on table public.spinoffs from anon, authenticated;
  end if;
  if to_regclass('public.buybacks') is not null then
    revoke insert, update, delete on table public.buybacks from anon, authenticated;
  end if;
  if to_regclass('public.cl_dividends') is not null then
    revoke insert, update, delete on table public.cl_dividends from anon, authenticated;
  end if;
  if to_regclass('public.cl_material_events') is not null then
    revoke insert, update, delete on table public.cl_material_events from anon, authenticated;
  end if;
  if to_regclass('public.cl_top_shareholders') is not null then
    revoke insert, update, delete on table public.cl_top_shareholders from anon, authenticated;
  end if;
  if to_regclass('public.cl_mutual_funds') is not null then
    revoke insert, update, delete on table public.cl_mutual_funds from anon, authenticated;
  end if;
  if to_regclass('public.cl_mutual_fund_holdings') is not null then
    revoke insert, update, delete on table public.cl_mutual_fund_holdings from anon, authenticated;
  end if;
  if to_regclass('public.sponsorships') is not null then
    revoke insert, update, delete on table public.sponsorships from anon, authenticated;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Fila 037: quitar EXECUTE de la funcion de trigger de alert_rules.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.enforce_alert_rule_limits()') is not null then
    revoke execute on function public.enforce_alert_rule_limits() from public, anon, authenticated;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- M3: forzar la anonimizacion de personas naturales en cada INSERT/UPDATE
-- de cl_top_shareholders. Mismo criterio societario que 045 (regex copiado
-- exacto, con limites de palabra para que 'Inc' no calce con 'Vincent').
-- Ante la duda se oculta (falla cerrado, Leyes 19.628 y 21.719).
-- ----------------------------------------------------------------------------
create or replace function public.anonimizar_accionista()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ya anonimizado por una corrida anterior: no tocar (idempotente).
  if new.accionista like 'Persona natural (#%' then
    return new;
  end if;

  -- Sin marcador societario => persona natural: se guarda solo el ranking.
  if new.accionista !~* (
    '(^|[^[:alnum:]])(S\.A\.|S\.A\.C\.|SpA|Ltda|Limitada|Inversiones|Sociedad|Fondo|AFP|'
    || 'Banco|Corredores|Administradora|Holding|Trust|Inc|LLC|Ltd|Fund|'
    || 'Custodia|Compania|Compañia|Compañía|E\.I\.R\.L\.|Fundacion|'
    || 'Fundación|Corporacion|Corporación|Agencia)([^[:alnum:]]|$)'
  ) then
    new.accionista := 'Persona natural (#' || coalesce(new.ranking::text, '?') || ')';
    new.es_persona_natural := true;
  end if;

  return new;
end;
$$;

revoke execute on function public.anonimizar_accionista() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.cl_top_shareholders') is not null then
    drop trigger if exists anonimizar_accionista on public.cl_top_shareholders;
    create trigger anonimizar_accionista
      before insert or update on public.cl_top_shareholders
      for each row execute function public.anonimizar_accionista();
  end if;
end
$$;
