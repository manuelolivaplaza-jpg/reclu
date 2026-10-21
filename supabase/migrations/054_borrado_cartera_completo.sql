-- ============================================================
-- Migration 054: borrado de cartera completo y endurecimientos (F77)
--
-- Corrige hallazgos de docs/revision-seguridad-portafolio-2026-10.md:
--   A1: delete_my_portfolio() (053) es security invoker y authenticated no
--       tenia DELETE ni policy de delete sobre user_portfolio_alerts: el
--       borrado abortaba y hacia rollback de todo (ni tenencias ni ajustes).
--   A2: el borrado no incluia user_impact_requests (auditoria de consultas).
--   B1: user_holdings no revocaba privilegios al rol PUBLIC.
--   B2: news_items.title sin tope de largo en la base.
--   B3: enforce_user_holdings_limit() sin revoke de EXECUTE.
--
-- Se mantiene security invoker (minimo privilegio): en vez de saltarse la
-- RLS, el dueno recibe DELETE acotado por policy a auth.uid() = user_id.
-- 100% idempotente. No borra datos por si sola. Bloque -- rollback al final.
-- Depende de 050, 051, 052 y 053.
-- ============================================================

-- 1. El dueno puede borrar sus propias alertas personales y su auditoria.
drop policy if exists "own portfolio alerts delete" on public.user_portfolio_alerts;
create policy "own portfolio alerts delete"
  on public.user_portfolio_alerts
  for delete
  using (auth.uid() = user_id);
grant delete on table public.user_portfolio_alerts to authenticated;

drop policy if exists "user_impact_requests own delete" on public.user_impact_requests;
create policy "user_impact_requests own delete"
  on public.user_impact_requests
  for delete
  using (auth.uid() = user_id);
grant delete on table public.user_impact_requests to authenticated;

-- 2. Borrado completo: tenencias, ajustes, alertas y auditoria.
create or replace function public.delete_my_portfolio()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_holdings integer := 0;
  v_settings integer := 0;
  v_alerts integer := 0;
  v_requests integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  delete from public.user_holdings where user_id = v_uid;
  get diagnostics v_holdings = row_count;

  delete from public.user_portfolio_settings where user_id = v_uid;
  get diagnostics v_settings = row_count;

  delete from public.user_portfolio_alerts where user_id = v_uid;
  get diagnostics v_alerts = row_count;

  delete from public.user_impact_requests where user_id = v_uid;
  get diagnostics v_requests = row_count;

  return v_holdings + v_settings + v_alerts + v_requests;
end;
$$;

revoke all on function public.delete_my_portfolio() from public;
revoke all on function public.delete_my_portfolio() from anon;
grant execute on function public.delete_my_portfolio() to authenticated;

-- 3. B1: nada para el rol PUBLIC sobre la cartera.
revoke all on table public.user_holdings from public;

-- 4. B2: tope de largo del titulo (los scrapers ya truncan a 300).
--    NOT VALID: no revisa filas antiguas; solo rige para inserts/updates.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'news_items_title_len_check'
  ) then
    alter table public.news_items
      add constraint news_items_title_len_check
      check (char_length(title) <= 300) not valid;
  end if;
end;
$$;

-- 5. B3: la trigger function no se ejecuta directamente.
revoke execute on function public.enforce_user_holdings_limit() from public, anon, authenticated;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop policy if exists "own portfolio alerts delete" on public.user_portfolio_alerts;
-- revoke delete on table public.user_portfolio_alerts from authenticated;
-- drop policy if exists "user_impact_requests own delete" on public.user_impact_requests;
-- revoke delete on table public.user_impact_requests from authenticated;
-- alter table public.news_items drop constraint if exists news_items_title_len_check;
-- -- Volver a aplicar la funcion delete_my_portfolio() de la 053.
-- ============================================================
