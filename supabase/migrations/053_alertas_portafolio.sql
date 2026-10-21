-- ============================================================
-- Migration 053: alertas automáticas de Mi portafolio (F73)
--
-- Las alertas de noticias que tocan la cartera del usuario son personales:
-- NO van a la tabla pública `alerts` (que alimenta el muro y `alerts_public`).
-- Se guardan aquí para (1) no duplicar el mismo aviso y (2) contar el tope
-- diario por plan (`autoAlertsMaxPerDay` de src/lib/plans.ts).
--
--   * user_portfolio_alerts: una fila por (usuario, noticia, ticker) enviada.
--     `channel` registra por dónde salió (correo, Telegram o ambos).
--     La clave primaria garantiza el "sin duplicados (news_id, symbol,
--     user)" de la tarea; el job igual consulta antes de enviar.
--   * RLS solo del dueño en lectura. La escritura es exclusiva del
--     service_role (job /api/impact/alerts).
--
-- Depende de la 051 (news_items con uuid). No toca `alerts` ni `alerts.type`.
-- 100% idempotente. Bloque -- rollback al final.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Alertas personales de noticias de cartera
-- ------------------------------------------------------------
create table if not exists public.user_portfolio_alerts (
  user_id uuid not null
    references auth.users (id) on delete cascade,
  news_id uuid not null
    references public.news_items (id) on delete cascade,
  symbol text not null,
  -- Relevancia calculada por news-match.ts (confianza × peso × importancia).
  relevance numeric(6, 5) not null default 0
    check (relevance >= 0 and relevance <= 1),
  channel text not null default 'email'
    check (channel in ('email', 'telegram', 'both')),
  sent_at timestamptz not null default now(),
  -- Un solo aviso por noticia, ticker y usuario.
  primary key (user_id, news_id, symbol)
);

create index if not exists idx_user_portfolio_alerts_user_sent
  on public.user_portfolio_alerts (user_id, sent_at desc);

comment on table public.user_portfolio_alerts is
  'Alertas personales de noticias que tocan la cartera. Solo lectura del dueño; escribe el service_role. No son alertas públicas.';
comment on column public.user_portfolio_alerts.channel is
  'Canal efectivo del envío: email, telegram o both.';
comment on column public.user_portfolio_alerts.relevance is
  'Relevancia 0..1 del match noticia × ticker usada para decidir el envío.';

alter table public.user_portfolio_alerts enable row level security;

drop policy if exists "own portfolio alerts read" on public.user_portfolio_alerts;
create policy "own portfolio alerts read"
  on public.user_portfolio_alerts
  for select
  using (auth.uid() = user_id);

-- Sin policies de insert/update/delete: el job escribe con service_role.
revoke all on table public.user_portfolio_alerts from public, anon, authenticated;
grant select on table public.user_portfolio_alerts to authenticated;
grant all on table public.user_portfolio_alerts to service_role;

-- ------------------------------------------------------------
-- 2. Borrado junto con la cartera (derecho de supresión de la 050).
--    `delete_my_portfolio()` borra tenencias y ajustes; aquí se agrega el
--    historial de avisos para que no quede rastro al borrar la cartera.
--    Se recrea la función con el mismo contrato (devuelve filas borradas).
-- ------------------------------------------------------------
create or replace function public.delete_my_portfolio()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_holdings integer := 0;
  v_settings integer := 0;
  v_alerts integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  delete from public.user_holdings
   where user_id = auth.uid();
  get diagnostics v_holdings = row_count;

  delete from public.user_portfolio_settings
   where user_id = auth.uid();
  get diagnostics v_settings = row_count;

  delete from public.user_portfolio_alerts
   where user_id = auth.uid();
  get diagnostics v_alerts = row_count;

  return v_holdings + v_settings + v_alerts;
end;
$$;

revoke all on function public.delete_my_portfolio() from public;
revoke all on function public.delete_my_portfolio() from anon;
grant execute on function public.delete_my_portfolio() to authenticated;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop table if exists public.user_portfolio_alerts;
-- -- Restaurar la versión de la 050:
-- create or replace function public.delete_my_portfolio()
-- returns integer language plpgsql security invoker set search_path = ''
-- as $$
-- declare
--   v_holdings integer := 0;
--   v_settings integer := 0;
-- begin
--   if auth.uid() is null then return 0; end if;
--   delete from public.user_holdings where user_id = auth.uid();
--   get diagnostics v_holdings = row_count;
--   delete from public.user_portfolio_settings where user_id = auth.uid();
--   get diagnostics v_settings = row_count;
--   return v_holdings + v_settings;
-- end;
-- $$;
-- ============================================================
