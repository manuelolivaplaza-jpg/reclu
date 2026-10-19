-- ============================================================
-- Migración 013 — Portafolios temáticos nuevos + Radar IA (F7)
--
-- Agrega 3 portafolios temáticos nuevos con holdings documentados:
--   1. defensa-aeroespacial   — primes de defensa de EE.UU. (regla editorial
--                               pública: las 5 primes por ingreso de defensa).
--   2. consenso-de-los-grandes — los tickers más repetidos entre los gestores
--                               institucionales del catálogo (regla: ≥3 carteras
--                               13F/políticas con el símbolo).
--   3. radar-ia               — generado por reglas transparentes (consenso +
--                               momentum) vía scrapers/radar_ia.py. Aquí va el
--                               seed inicial; el scraper lo regenera con
--                               previous_weight para dejar rastro del cambio.
--
-- Idempotente: insert ... on conflict do nothing por slug; holdings con
-- on conflict do nothing sobre (portfolio_id, symbol, as_of).
-- No altera tablas: usa solo columnas existentes de portfolios/holdings.
-- ============================================================

insert into public.portfolios (slug, name, description, category, source, manager, country, followers, return_ytd, premium, tags)
values
  (
    'defensa-aeroespacial',
    'Defensa y Aeroespacial',
    'Las cinco primes de defensa de EE.UU. por ingreso segmental: misiles, aeronáutica y espacio. Selección editorial con pesos iguales.',
    'thematic',
    'model',
    null,
    'US',
    0,
    null,
    false,
    array['defensa', 'aeroespacial', 'tematica']
  ),
  (
    'consenso-de-los-grandes',
    'Consenso de los Grandes',
    'Las acciones que más repiten los gestores institucionales del catálogo (13F y políticos activos). Regla: símbolos presentes en 3 o más carteras al último corte.',
    'thematic',
    'model',
    null,
    'US',
    0,
    null,
    false,
    array['consenso', '13f', 'tematica']
  ),
  (
    'radar-ia',
    'Radar IA',
    'Portafolio generado por reglas transparentes desde los datos del catálogo: consenso (cuántas carteras tienen el símbolo) + momentum (retorno desde la declaración). Rotulado como información, no recomendación.',
    'thematic',
    'radar_ia',
    'reclu (algoritmo)',
    'Global',
    0,
    null,
    false,
    array['radar', 'ia', 'reglas', 'tematica']
  )
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- Holdings semilla (documentados)
-- ------------------------------------------------------------
do $$
declare
  defensa_id uuid;
  consenso_id uuid;
  radar_id uuid;
  today date := current_date;
begin
  select id into defensa_id from public.portfolios where slug = 'defensa-aeroespacional';
  select id into consenso_id from public.portfolios where slug = 'consenso-de-los-grandes';
  select id into radar_id from public.portfolios where slug = 'radar-ia';

  if defensa_id is null or consenso_id is null or radar_id is null then
    raise notice '013: falta algún portafolio temático nuevo; holdings omitidos';
    return;
  end if;

  -- Defensa y Aeroespacial: 5 primes, pesos iguales 20%.
  -- Fuente de selección: ingresos segmentales de defensa reportados en 10-K
  -- (LMT, RTX, NOC, GD, BA son las mayores primes de EE.UU.).
  insert into public.holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of)
  values
    (defensa_id, 'LMT',  'Lockheed Martin',    20.0, 20.0, 'equity', 'NYSE',  'USD', today),
    (defensa_id, 'RTX',  'RTX Corp',           20.0, 20.0, 'equity', 'NYSE',  'USD', today),
    (defensa_id, 'NOC',  'Northrop Grumman',   20.0, 20.0, 'equity', 'NYSE',  'USD', today),
    (defensa_id, 'GD',   'General Dynamics',   20.0, 20.0, 'equity', 'NYSE',  'USD', today),
    (defensa_id, 'BA',   'Boeing',             20.0, 20.0, 'equity', 'NYSE',  'USD', today)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Consenso de los Grandes: regla documentada — símbolos presentes en ≥3
  -- carteras institucionales al último corte (observado en los filings 13F
  -- y declaraciones PTR del catálogo vigente).
  insert into public.holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of)
  values
    (consenso_id, 'NVDA',   'NVIDIA',               14.0, 14.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'MSFT',   'Microsoft',            13.0, 13.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'AAPL',   'Apple',                12.0, 12.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'AMZN',   'Amazon',               11.0, 11.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'GOOGL',  'Alphabet',             10.0, 10.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'META',   'Meta Platforms',        9.0,  9.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'AVGO',   'Broadcom',              8.0,  8.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'TSLA',   'Tesla',                 8.0,  8.0, 'equity', 'NASDAQ', 'USD', today),
    (consenso_id, 'JPM',    'JPMorgan Chase',        7.0,  7.0, 'equity', 'NYSE',  'USD', today),
    (consenso_id, 'BRK-B',  'Berkshire Hathaway B',  8.0,  8.0, 'equity', 'NYSE',  'USD', today)
  on conflict (portfolio_id, symbol, as_of) do nothing;

  -- Radar IA: seed inicial con las reglas del scraper (consenso ≥3 carteras,
  -- momentum top por return_pct). El scraper regenera estas filas dejando
  -- previous_weight = peso anterior para que detect-changes genere alertas.
  insert into public.holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of)
  values
    (radar_id, 'NVDA',   'NVIDIA',      18.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'MSFT',   'Microsoft',   16.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'AAPL',   'Apple',       14.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'GOOGL',  'Alphabet',    12.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'AVGO',   'Broadcom',    10.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'AMZN',   'Amazon',      10.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'META',   'Meta',         8.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'TSLA',   'Tesla',        6.0, 0.0, 'equity', 'NASDAQ', 'USD', today),
    (radar_id, 'PLTR',   'Palantir',     6.0, 0.0, 'equity', 'NASDAQ', 'USD', today)
  on conflict (portfolio_id, symbol, as_of) do nothing;
end $$;
