-- ============================================================
-- Migracion 051 (F59): noticias e impacto.
--
-- Base del feed "Noticias que te tocan" de docs/mi-portafolio-ia.md:
--   * news_items: noticia normalizada de una fuente gratis verificada
--     (SEC 8-K y hechos esenciales CMF). Solo titulo, URL y un resumen
--     propio corto (max 500 caracteres): nunca el texto completo.
--   * news_tickers: que tickers toca cada noticia y con que relacion.
--   * ticker_profile: sector, industria, pares, proveedores y factores
--     macro por simbolo (se llena a mano o con un job).
--   * ai_impact_cache: analisis generico cacheado por noticia x ticker.
--     SIN user_id: no contiene datos del usuario.
--   * user_impact_requests: auditoria y cupo por usuario.
--
-- Privacidad y permisos:
--   * news_items, news_tickers y ticker_profile: lectura publica, pero
--     anon/authenticated NO pueden leer news_items.summary (se sirve por
--     la app con service role o por una RPC futura). Escritura solo
--     service_role.
--   * ai_impact_cache: RLS sin policies y sin grants a anon/authenticated.
--   * user_impact_requests: RLS solo del dueno (select e insert). La purga
--     de 90 dias corre con service_role.
--
-- 100% idempotente. Bloque -- rollback al final.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1. Noticias normalizadas
-- ------------------------------------------------------------
create table if not exists public.news_items (
  id uuid primary key default uuid_generate_v4(),
  source text not null
    check (source in ('sec_8k', 'cmf_hechos')),
  url text not null,
  title text not null,
  -- Resumen propio y corto. Nunca el cuerpo de la noticia (derechos de autor).
  summary text not null default ''
    check (char_length(summary) <= 500),
  published_at timestamptz not null,
  lang text not null default 'es',
  hash text not null,
  created_at timestamptz not null default now(),
  constraint news_items_hash_key unique (hash)
);

create index if not exists idx_news_items_published_at
  on public.news_items (published_at desc);

comment on table public.news_items is
  'Noticias de fuentes gratis verificadas (SEC 8-K, hechos CMF). Solo titular, URL y resumen propio de max 500 caracteres.';
comment on column public.news_items.hash is
  'Huella estable de la noticia para no duplicar en reingestas.';

alter table public.news_items enable row level security;

drop policy if exists "news_items public read" on public.news_items;
create policy "news_items public read"
  on public.news_items
  for select
  using (true);
-- Sin policies de insert/update/delete: solo el service role escribe.

-- El resumen no se expone por lectura directa (patron del bloque summary
-- de la 048). Un grant a nivel de tabla taparia al de columna, asi que se
-- revoca todo el select y se re-otorga solo las columnas publicas.
revoke all on table public.news_items from anon, authenticated;
revoke select on table public.news_items from anon, authenticated;
grant select (
  id, source, url, title, published_at
) on table public.news_items to anon, authenticated;
grant all on table public.news_items to service_role;

-- ------------------------------------------------------------
-- 2. Tickers afectados por cada noticia
-- ------------------------------------------------------------
create table if not exists public.news_tickers (
  news_id uuid not null
    references public.news_items (id) on delete cascade,
  symbol text not null,
  relation text not null
    check (relation in ('direct', 'sector', 'supplier', 'competitor', 'macro')),
  confidence numeric not null default 1
    check (confidence >= 0 and confidence <= 1),
  primary key (news_id, symbol, relation)
);

create index if not exists idx_news_tickers_symbol
  on public.news_tickers (symbol);

comment on table public.news_tickers is
  'Relacion noticia -> ticker (directa, sector, proveedor, competidor o macro) con confianza 0..1.';

alter table public.news_tickers enable row level security;

drop policy if exists "news_tickers public read" on public.news_tickers;
create policy "news_tickers public read"
  on public.news_tickers
  for select
  using (true);
-- Sin policies de escritura: solo el service role escribe.

revoke all on table public.news_tickers from anon, authenticated;
grant select on table public.news_tickers to anon, authenticated;
grant all on table public.news_tickers to service_role;

-- ------------------------------------------------------------
-- 3. Perfil por ticker (sector, pares, proveedores, macro)
-- ------------------------------------------------------------
create table if not exists public.ticker_profile (
  symbol text primary key,
  sector text,
  industry text,
  country text,
  peers text[] not null default '{}'::text[],
  suppliers text[] not null default '{}'::text[],
  macro_factors text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

comment on table public.ticker_profile is
  'Perfil curado por ticker para el matcher noticia->ticker. Se llena a mano o con un job.';

alter table public.ticker_profile enable row level security;

drop policy if exists "ticker_profile public read" on public.ticker_profile;
create policy "ticker_profile public read"
  on public.ticker_profile
  for select
  using (true);
-- Sin policies de escritura: solo el service role escribe.

revoke all on table public.ticker_profile from anon, authenticated;
grant select on table public.ticker_profile to anon, authenticated;
grant all on table public.ticker_profile to service_role;

-- Reutiliza set_updated_at() del esquema base, con guarda por si no existe.
do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists set_ticker_profile_updated_at on public.ticker_profile;
    create trigger set_ticker_profile_updated_at
      before update on public.ticker_profile
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- ------------------------------------------------------------
-- 4. Cache de analisis de IA (generico, sin datos del usuario)
-- ------------------------------------------------------------
create table if not exists public.ai_impact_cache (
  news_id uuid not null
    references public.news_items (id) on delete cascade,
  symbol text not null,
  model text not null,
  prompt_version text not null,
  analysis jsonb not null,
  created_at timestamptz not null default now(),
  primary key (news_id, symbol, prompt_version)
);

comment on table public.ai_impact_cache is
  'Analisis generico noticia x ticker. Sin user_id: no guarda datos del usuario. Solo service_role.';

alter table public.ai_impact_cache enable row level security;
-- Sin policies: RLS niega todo a anon/authenticated. Solo service_role
-- (que hace bypass de RLS) puede leer y escribir.
revoke all on table public.ai_impact_cache from public, anon, authenticated;
grant all on table public.ai_impact_cache to service_role;

-- ------------------------------------------------------------
-- 5. Consultas de impacto por usuario (cupo + auditoria)
-- ------------------------------------------------------------
create table if not exists public.user_impact_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  news_id uuid not null
    references public.news_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  delivered_via text not null default 'web'
    check (delivered_via in ('web', 'email', 'telegram'))
);

create index if not exists idx_user_impact_requests_user_created
  on public.user_impact_requests (user_id, created_at desc);

comment on table public.user_impact_requests is
  'Auditoria de consultas de impacto. Se purga a los 90 dias con purge_old_impact_requests().';

alter table public.user_impact_requests enable row level security;

drop policy if exists "user_impact_requests own read" on public.user_impact_requests;
create policy "user_impact_requests own read"
  on public.user_impact_requests
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_impact_requests own insert" on public.user_impact_requests;
create policy "user_impact_requests own insert"
  on public.user_impact_requests
  for insert
  with check (auth.uid() = user_id);

-- anon no participa: sin sesion no hay cupo ni auditoria.
revoke all on table public.user_impact_requests from public, anon, authenticated;
grant select, insert on table public.user_impact_requests to authenticated;
grant all on table public.user_impact_requests to service_role;

-- ------------------------------------------------------------
-- 6. Purga de solicitudes viejas (90 dias)
-- ------------------------------------------------------------
create or replace function public.purge_old_impact_requests()
returns integer
language sql
security definer
set search_path = ''
as $$
  with borradas as (
    delete from public.user_impact_requests
    where created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer from borradas;
$$;

comment on function public.purge_old_impact_requests() is
  'Borra solicitudes de impacto de mas de 90 dias. Solo service_role.';

revoke all on function public.purge_old_impact_requests() from public;
revoke execute on function public.purge_old_impact_requests() from anon, authenticated;
grant execute on function public.purge_old_impact_requests() to service_role;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- drop function if exists public.purge_old_impact_requests();
-- drop table if exists public.user_impact_requests;
-- drop table if exists public.ai_impact_cache;
-- drop table if exists public.ticker_profile;
-- drop table if exists public.news_tickers;
-- drop table if exists public.news_items;
-- ============================================================
