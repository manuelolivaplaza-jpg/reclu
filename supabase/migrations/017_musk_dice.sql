-- ============================================================================
-- Migration 017: "Elon Musk dice" (F11)
--
-- Reutiliza public.mentions de la 014. No crea otra tabla.
-- Musk casi no nombra acciones de terceros. Las tres que sí (ETSY, GME y
-- CDR) se guardan como elogio. Tesla es empresa propia: se muestra como
-- contexto y el scraper no arma holding ni alerta con ella.
-- CDR cotiza en Varsovia (PLN). El check de currency no se toca: CDR queda
-- solo como mención. Holdings: ETSY y GME al 50% cada uno.
--
-- El check de kind de la 014 es un constraint de columna, sin nombre en el
-- SQL. Postgres lo llama mentions_kind_check. Aquí se reemplaza para sumar
-- 'critica' y 'empresa_propia', sin sacar los tipos de Trump.
--
-- Idempotente: drop constraint if exists + add, on conflict do nothing.
-- Puede re-ejecutarse. Depende de la 014 (la tabla mentions ya existe).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ampliar kind. Se dropea el check viejo (nombre por defecto, o cualquiera
--    que todavía liste elogio_acuerdo) y se vuelve a crear con el mismo nombre.
-- ----------------------------------------------------------------------------
alter table public.mentions drop constraint if exists mentions_kind_check;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'mentions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%elogio_acuerdo%'
      and pg_get_constraintdef(con.oid) ilike '%compra_directa%'
  loop
    execute format('alter table public.mentions drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.mentions
  add constraint mentions_kind_check
  check (kind in (
    'compra_directa',
    'compra_directa_mercado',
    'elogio',
    'elogio_accion',
    'elogio_con_ticker',
    'elogio_producto',
    'elogio_acuerdo',
    'critica',
    'empresa_propia'
  ));

-- ----------------------------------------------------------------------------
-- 2) Portafolio musk-dice. No se toca elon-doge-tracker.
-- ----------------------------------------------------------------------------
insert into public.portfolios (
  slug, name, description, category, source, manager, country, followers, return_ytd, premium, tags
)
values
  (
    'musk-dice',
    'Elon Musk dice',
    'Simulación histórica de los elogios verificados de Elon Musk a acciones de terceros, con la cita y el enlace al post. Tesla se muestra como contexto: Musk es insider y no es una señal. No es recomendación de inversión.',
    'model',
    'musk_mentions',
    'Elon Musk',
    'US',
    0,
    null,
    false,
    array['musk', 'menciones', 'x']
  )
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Cuatro menciones verificadas. external_id = id del post en X.
--    said_at es el timestamp UTC del post. entry_date es el cierre de
--    Nueva York: el mismo día si el post salió antes de las 16:00 ET;
--    si no, el día hábil siguiente.
-- ----------------------------------------------------------------------------
do $$
declare
  md_id uuid;
begin
  select id into md_id from public.portfolios where slug = 'musk-dice';
  if md_id is null then
    raise notice '017: portafolio musk-dice no existe; menciones omitidas';
    return;
  end if;

  insert into public.mentions (
    portfolio_id, speaker, said_at, entry_date, symbol, company, kind, channel,
    quote, source_urls, status, external_id
  )
  values
    (md_id, 'Elon Musk', '2021-01-26T11:25:00+00:00', '2021-01-26', 'ETSY', 'Etsy', 'elogio',
     'X',
     'I kinda love Etsy',
     array['https://x.com/elonmusk/status/1354027651468550144'],
     'verificada', '1354027651468550144'),
    (md_id, 'Elon Musk', '2021-01-26T21:08:00+00:00', '2021-01-27', 'GME', 'GameStop', 'elogio',
     'X',
     'Gamestonk!!',
     array['https://x.com/elonmusk/status/1354174279894642703'],
     'verificada', '1354174279894642703'),
    (md_id, 'Elon Musk', '2021-01-28T02:34:00+00:00', '2021-01-28', 'CDR', 'CD Projekt', 'elogio',
     'X',
     'It can play Cyberpunk',
     array['https://x.com/elonmusk/status/1354618772586426368'],
     'verificada', '1354618772586426368'),
    (md_id, 'Elon Musk', '2020-05-01T15:11:00+00:00', '2020-05-01', 'TSLA', 'Tesla', 'empresa_propia',
     'X',
     'Tesla stock price is too high imo',
     array['https://x.com/elonmusk/status/1256239815256797184'],
     'verificada', '1256239815256797184')
  on conflict (external_id) do nothing;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Holdings semilla: solo ETSY y GME, 50% cada uno. previous_weight = 0
--    para que detect-changes genere new_trade la primera vez.
--    TSLA (empresa_propia) y CDR (PLN) no van acá.
-- ----------------------------------------------------------------------------
do $$
declare
  md_id uuid;
begin
  select id into md_id from public.portfolios where slug = 'musk-dice';
  if md_id is null then
    raise notice '017: portafolio musk-dice no existe; holdings omitidos';
    return;
  end if;

  insert into public.holdings (
    portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of
  )
  values
    (md_id, 'ETSY', 'Etsy',     50.0, 0.0, 'equity', 'NASDAQ', 'USD', '2026-10-16'),
    (md_id, 'GME',  'GameStop', 50.0, 0.0, 'equity', 'NYSE',   'USD', '2026-10-16')
  on conflict (portfolio_id, symbol, as_of) do nothing;
end $$;
