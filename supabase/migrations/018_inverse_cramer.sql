-- ============================================================================
-- Migration 018: Inverse Cramer (real) (F12)
--
-- Depende de la 014 (public.mentions). No crea otra tabla.
--
--   1) Amplía el check de mentions.kind con recomienda_compra y
--      recomienda_venta. Idempotente: dropea el check de kind que haya y
--      lo vuelve a crear.
--   2) Portafolio inverse-cramer-real (category model). El proxy
--      inverse-cramer (SQQQ/PSQ) no se toca.
--   3) Los 27 picks curados (2026-09-02 a 2026-10-15). external_id =
--      fecha || '-' || ticker. Solo cita de hasta 10 palabras + URL.
--   4) Holdings semilla al 2026-10-16: igual peso entre las posiciones
--      abiertas (30 días hábiles). weight es positivo: el check de
--      holdings exige weight >= 0 y <= 100, así que el corto va en el
--      nombre ("Corto: TICKER"), nunca en un peso negativo. MTZ está
--      largo (venta del 6 oct) y corto (compra del 13 oct) a la vez:
--      se netea y no hay fila.
--
-- Idempotente: on conflict do nothing, drop constraint si existe.
-- Puede re-ejecutarse. Si la 014 no está, avisa y no inserta menciones.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) kind: suma recomienda_compra / recomienda_venta sin perder los de F8.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  if to_regclass('public.mentions') is null then
    raise notice '018: public.mentions no existe (falta la 014); no se altera kind';
    return;
  end if;

  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'mentions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.mentions drop constraint %I', r.conname);
  end loop;

  alter table public.mentions
    add constraint mentions_kind_check
    check (kind is null or kind in (
      'compra_directa',
      'compra_directa_mercado',
      'elogio',
      'elogio_accion',
      'elogio_con_ticker',
      'elogio_producto',
      'elogio_acuerdo',
      -- 'critica' y 'empresa_propia' los agrega la 017 (se instala antes): no quitarlos.
      'critica',
      'empresa_propia',
      'recomienda_compra',
      'recomienda_venta'
    ));
end $$;

-- ----------------------------------------------------------------------------
-- 2) Portafolio. followers 0, return_ytd null, premium false.
-- ----------------------------------------------------------------------------
insert into public.portfolios (
  slug, name, description, category, source, manager, country, followers, return_ytd, premium, tags
)
values (
  'inverse-cramer-real',
  'Inverse Cramer (real)',
  'Simulación: se vende en corto lo que Jim Cramer recomienda comprar en el Lightning Round de CNBC y se compra lo que recomienda vender. Igual peso, 30 días hábiles, sin costo de préstamo. Cada pick guarda ticker, fecha, una cita de hasta 10 palabras y el enlace.',
  'model',
  'cnbc_lightning_round',
  'Jim Cramer (invertido)',
  'US',
  0,
  null,
  false,
  array['cramer', 'inverse', 'cnbc', 'menciones']
)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Picks. said_at = 18:55 ET = 22:55 UTC (EDT en sep–oct 2026).
--    entry_date = cierre del día hábil siguiente (Labor Day 2026-09-07).
-- ----------------------------------------------------------------------------
do $$
declare
  ic_id uuid;
begin
  if to_regclass('public.mentions') is null then
    raise notice '018: public.mentions no existe; picks omitidos';
    return;
  end if;

  select id into ic_id from public.portfolios where slug = 'inverse-cramer-real';
  if ic_id is null then
    raise notice '018: portafolio inverse-cramer-real no existe; picks omitidos';
    return;
  end if;

  insert into public.mentions (
    portfolio_id, speaker, said_at, entry_date, symbol, company, kind, channel, quote, source_urls, status, external_id
  )
  values
    (ic_id, 'Jim Cramer', '2026-09-02T22:55:00+00:00', '2026-09-03', 'HWM', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'hold on to it or buy some',
     array['https://www.cnbc.com/2026/09/02/cramers-lightning-round-buy-howmet-aerospace.html'],
     'verificada', '2026-09-02-HWM'),
    (ic_id, 'Jim Cramer', '2026-09-08T22:55:00+00:00', '2026-09-09', 'TRN', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'pull the trigger',
     array['https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html'],
     'verificada', '2026-09-08-TRN'),
    (ic_id, 'Jim Cramer', '2026-09-08T22:55:00+00:00', '2026-09-09', 'SPG', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'so great',
     array['https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html'],
     'verificada', '2026-09-08-SPG'),
    (ic_id, 'Jim Cramer', '2026-09-08T22:55:00+00:00', '2026-09-09', 'FRT', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'excellent',
     array['https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html'],
     'verificada', '2026-09-08-FRT'),
    (ic_id, 'Jim Cramer', '2026-09-08T22:55:00+00:00', '2026-09-09', 'JOBY', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'negativo',
     array['https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html'],
     'verificada', '2026-09-08-JOBY'),
    (ic_id, 'Jim Cramer', '2026-09-08T22:55:00+00:00', '2026-09-09', 'GRAB', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'never liked',
     array['https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html'],
     'verificada', '2026-09-08-GRAB'),
    (ic_id, 'Jim Cramer', '2026-09-08T22:55:00+00:00', '2026-09-09', 'AZN', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'not going to put my money',
     array['https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html'],
     'verificada', '2026-09-08-AZN'),
    (ic_id, 'Jim Cramer', '2026-09-14T22:55:00+00:00', '2026-09-15', 'ET', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'buy, buy, buy',
     array['https://www.cnbc.com/2026/09/14/cramers-lightning-round-buy-energy-transfer.html'],
     'verificada', '2026-09-14-ET'),
    (ic_id, 'Jim Cramer', '2026-09-17T22:55:00+00:00', '2026-09-18', 'BB', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'buy buy buy',
     array['https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html'],
     'verificada', '2026-09-17-BB'),
    (ic_id, 'Jim Cramer', '2026-09-17T22:55:00+00:00', '2026-09-18', 'GME', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'is a buy',
     array['https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html'],
     'verificada', '2026-09-17-GME'),
    (ic_id, 'Jim Cramer', '2026-09-17T22:55:00+00:00', '2026-09-18', 'CRDO', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'can buy',
     array['https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html'],
     'verificada', '2026-09-17-CRDO'),
    (ic_id, 'Jim Cramer', '2026-09-17T22:55:00+00:00', '2026-09-18', 'IRM', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'it''s a buy',
     array['https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html'],
     'verificada', '2026-09-17-IRM'),
    (ic_id, 'Jim Cramer', '2026-09-17T22:55:00+00:00', '2026-09-18', 'SNAP', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'negativo',
     array['https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html'],
     'verificada', '2026-09-17-SNAP'),
    (ic_id, 'Jim Cramer', '2026-09-30T22:55:00+00:00', '2026-10-01', 'KMI', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'I''m a buyer',
     array['https://www.cnbc.com/2026/09/30/cramers-lightning-round-buy-kinder-morgan.html'],
     'verificada', '2026-09-30-KMI'),
    (ic_id, 'Jim Cramer', '2026-09-30T22:55:00+00:00', '2026-10-01', 'GRAL', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'can go higher',
     array['https://www.cnbc.com/2026/09/30/cramers-lightning-round-buy-kinder-morgan.html'],
     'verificada', '2026-09-30-GRAL'),
    (ic_id, 'Jim Cramer', '2026-09-30T22:55:00+00:00', '2026-10-01', 'POET', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'not recommending stocks that are losing money',
     array['https://www.cnbc.com/2026/09/30/cramers-lightning-round-buy-kinder-morgan.html'],
     'verificada', '2026-09-30-POET'),
    (ic_id, 'Jim Cramer', '2026-10-05T22:55:00+00:00', '2026-10-06', 'CIEN', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'very good',
     array['https://www.cnbc.com/2026/10/05/cramers-lightning-round-i-think-ciena-is-very-good.html'],
     'verificada', '2026-10-05-CIEN'),
    (ic_id, 'Jim Cramer', '2026-10-05T22:55:00+00:00', '2026-10-06', 'AVY', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'winner',
     array['https://www.cnbc.com/2026/10/05/cramers-lightning-round-i-think-ciena-is-very-good.html'],
     'verificada', '2026-10-05-AVY'),
    (ic_id, 'Jim Cramer', '2026-10-06T22:55:00+00:00', '2026-10-07', 'EPD', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'you should own it',
     array['https://www.cnbc.com/2026/10/06/cramers-lightning-round-enterprise-products-partners-is-a-really-well-run-company.html'],
     'verificada', '2026-10-06-EPD'),
    (ic_id, 'Jim Cramer', '2026-10-06T22:55:00+00:00', '2026-10-07', 'MTZ', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'not going to get in front',
     array['https://www.cnbc.com/2026/10/06/cramers-lightning-round-enterprise-products-partners-is-a-really-well-run-company.html'],
     'verificada', '2026-10-06-MTZ'),
    (ic_id, 'Jim Cramer', '2026-10-12T22:55:00+00:00', '2026-10-13', 'AMBA', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'negativo',
     array['https://www.cnbc.com/2026/10/12/cramers-lightning-round-i-like-blackberry-very-much.html'],
     'verificada', '2026-10-12-AMBA'),
    (ic_id, 'Jim Cramer', '2026-10-12T22:55:00+00:00', '2026-10-13', 'MDLZ', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'negativo',
     array['https://www.cnbc.com/2026/10/12/cramers-lightning-round-i-like-blackberry-very-much.html'],
     'verificada', '2026-10-12-MDLZ'),
    (ic_id, 'Jim Cramer', '2026-10-13T22:55:00+00:00', '2026-10-14', 'PENG', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'you can buy it',
     array['https://www.cnbc.com/2026/10/13/cramers-lightning-round-hold-on-to-element-solutions.html'],
     'verificada', '2026-10-13-PENG'),
    (ic_id, 'Jim Cramer', '2026-10-13T22:55:00+00:00', '2026-10-14', 'MTZ', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'buy MasTec',
     array['https://www.cnbc.com/2026/10/13/cramers-lightning-round-hold-on-to-element-solutions.html'],
     'verificada', '2026-10-13-MTZ'),
    (ic_id, 'Jim Cramer', '2026-10-13T22:55:00+00:00', '2026-10-14', 'STWD', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'don''t want to own',
     array['https://www.cnbc.com/2026/10/13/cramers-lightning-round-hold-on-to-element-solutions.html'],
     'verificada', '2026-10-13-STWD'),
    (ic_id, 'Jim Cramer', '2026-10-15T22:55:00+00:00', '2026-10-16', 'RDDT', null, 'recomienda_compra',
     'CNBC Mad Money — Lightning Round', 'buy',
     array['https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html'],
     'verificada', '2026-10-15-RDDT'),
    (ic_id, 'Jim Cramer', '2026-10-15T22:55:00+00:00', '2026-10-16', 'RKLB', null, 'recomienda_venta',
     'CNBC Mad Money — Lightning Round', 'sell, sell, sell',
     array['https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html'],
     'verificada', '2026-10-15-RKLB')
  on conflict (external_id) do nothing;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Holdings al 2026-10-16. 25 nombres x 4.00 = 100. previous_weight = 0
--    para que detect-changes emita new_trade la primera vez.
-- ----------------------------------------------------------------------------
do $$
declare
  ic_id uuid;
begin
  select id into ic_id from public.portfolios where slug = 'inverse-cramer-real';
  if ic_id is null then
    raise notice '018: portafolio inverse-cramer-real no existe; holdings omitidos';
    return;
  end if;

  insert into public.holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of)
  values
    (ic_id, 'AMBA', 'AMBA',       4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'AVY',  'Corto: AVY',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'AZN',  'AZN',         4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'BB',   'Corto: BB',   4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'CIEN', 'Corto: CIEN', 4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'CRDO', 'Corto: CRDO', 4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'EPD',  'Corto: EPD',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'ET',   'Corto: ET',   4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'FRT',  'Corto: FRT',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'GME',  'Corto: GME',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'GRAB', 'GRAB',        4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'GRAL', 'Corto: GRAL', 4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'HWM',  'Corto: HWM',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'IRM',  'Corto: IRM',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'JOBY', 'JOBY',        4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'KMI',  'Corto: KMI',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'MDLZ', 'MDLZ',        4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'PENG', 'Corto: PENG', 4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'POET', 'POET',        4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'RDDT', 'Corto: RDDT', 4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'RKLB', 'RKLB',        4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'SNAP', 'SNAP',        4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'SPG',  'Corto: SPG',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'STWD', 'STWD',        4.00, 0.0, 'equity', null, 'USD', '2026-10-16'),
    (ic_id, 'TRN',  'Corto: TRN',  4.00, 0.0, 'equity', null, 'USD', '2026-10-16')
  on conflict (portfolio_id, symbol, as_of) do nothing;
end $$;
