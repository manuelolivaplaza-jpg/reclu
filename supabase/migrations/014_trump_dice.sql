-- ============================================================================
-- Migration 014: Portafolio "Trump dice" (F8)
--
-- Portafolio simulado: compra de US$1.000 al cierre cada vez que Donald Trump
-- llama a comprar o elogia directamente una acción cotizada. Cada mención se
-- guarda con su cita textual y al menos una fuente con URL. Es información
-- pública, no asesoría ni recomendación.
--
-- Contenido:
--   1) Tabla public.mentions (dichos verificados, lectura pública de las
--      verificadas; escritura solo service role, igual que benchmark_prices).
--   2) Portafolio trump-dice (category political_us, source trump_mentions).
--   3) Las 15 menciones verificadas (external_id M01..M15, on conflict skip).
--   4) Holdings semilla al corte 2026-10-16 (pesos por valor de mercado de
--      compras de US$1.000 por mención; suman 100). U.S. Steel deslistada
--      queda como USD-CASH (efectivo a US$55, compra de Nippon 2025-06-18).
--
-- Idempotente: create if not exists, on conflict do nothing, drop policy
-- if exists + create. Puede re-ejecutarse sin error.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabla mentions: un dicho público de Trump por fila. external_id único
--    (id de Truth Social o "M01".."M15") evita duplicar menciones/alertas.
-- ----------------------------------------------------------------------------
create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  speaker text not null,
  said_at timestamptz not null,
  entry_date date not null,
  symbol text not null,
  company text,
  kind text check (kind in (
    'compra_directa',
    'compra_directa_mercado',
    'elogio',
    'elogio_accion',
    'elogio_con_ticker',
    'elogio_producto',
    'elogio_acuerdo'
  )),
  channel text,
  quote text not null,
  source_urls text[] not null check (cardinality(source_urls) >= 1),
  status text not null default 'verificada' check (status in ('pendiente', 'verificada', 'descartada')),
  external_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_mentions_portfolio_said
  on public.mentions(portfolio_id, said_at desc);
create index if not exists idx_mentions_symbol on public.mentions(symbol);

alter table public.mentions enable row level security;

drop policy if exists "mentions public read verified" on public.mentions;
create policy "mentions public read verified" on public.mentions
  for select using (status = 'verificada');
-- Sin políticas de insert/update/delete: solo el service role escribe
-- (scraper trump_dice), igual que benchmark_prices en la 011.

-- ----------------------------------------------------------------------------
-- 2) Portafolio trump-dice.
-- ----------------------------------------------------------------------------
insert into public.portfolios (slug, name, description, category, source, manager, country, followers, return_ytd, premium, tags)
values
  (
    'trump-dice',
    'Trump dice',
    'Compra simulada de US$1.000 al cierre cada vez que Donald Trump llama a comprar o elogia directamente una acción. Cada mención con su cita y su fuente.',
    'political_us',
    'trump_mentions',
    'Donald Trump',
    'US',
    0,
    null,
    false,
    array['trump', 'menciones', 'truth-social', 'dichos']
  )
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 3) Las 15 menciones verificadas (fuente de verdad: menciones.json del
--    orquestador). said_at = fecha del dicho (la hora exacta no siempre está
--    confirmada; se usa 12:00 ET = 16:00 UTC cuando no hay hora reportada).
-- ----------------------------------------------------------------------------
do $$
declare
  td_id uuid;
begin
  select id into td_id from public.portfolios where slug = 'trump-dice';
  if td_id is null then
    raise notice '014: portafolio trump-dice no existe; menciones omitidas';
    return;
  end if;

  insert into public.mentions
    (portfolio_id, speaker, said_at, entry_date, symbol, company, kind, channel, quote, source_urls, status, external_id)
  values
    (td_id, 'Donald Trump', '2025-03-10T21:00+00:00', '2025-03-11', 'TSLA', 'Tesla', 'compra_directa',
     'Truth Social + evento en la Casa Blanca 11-03',
     'Anunció que compraría "a brand new Tesla" como "a show of confidence and support" a Elon Musk.',
     array['https://www.politico.com/news/2025/03/11/trump-buying-tesla-support-elon-musk-00223293'],
     'verificada', 'M01'),
    (td_id, 'Donald Trump', '2025-04-09T13:37+00:00', '2025-04-09', 'SPY', 'Mercado (S&P 500)', 'compra_directa_mercado',
     'Truth Social',
     'THIS IS A GREAT TIME TO BUY!!! DJT',
     array['https://truthsocial.com/@realDonaldTrump/posts/114308272725981913', 'https://apnews.com/article/trump-truth-social-djt-tesla-musk-tariffs-pause-fccfa6b06c8f1ec0cd7844641ca52669', 'https://www.cnbc.com/2025/04/09/trumps-morning-buy-call-nets-huge-returns-for-those-who-listened.html'],
     'verificada', 'M02'),
    (td_id, 'Donald Trump', '2025-05-23T16:00+00:00', '2025-05-23', 'X', 'United States Steel', 'elogio_acuerdo',
     'Truth Social',
     '"I am proud to announce that, after much consideration and negotiation, U.S. Steel will remain in America..." (sociedad con Nippon Steel). La acción subió 21% ese día.',
     array['https://www.trumpstruth.org/statuses/31222', 'https://www.reuters.com/markets/deals/us-steel-remain-america-form-partnership-with-nippon-trump-says-2025-05-23/', 'https://www.ussteel.com/prereleases/-/blogs/nippon-steel-corporation-and-u-s-steel-finalize-historic-partnership'],
     'verificada', 'M03'),
    (td_id, 'Donald Trump', '2025-08-06T19:00+00:00', '2025-08-07', 'AAPL', 'Apple', 'elogio',
     'Discurso en la Casa Blanca',
     'Llamó a Tim Cook "a great legend" y celebró la inversión de US$600.000 millones de Apple en EE.UU.',
     array['https://www.hudson-labs.com/research/trump-praised-companies'],
     'verificada', 'M04'),
    (td_id, 'Donald Trump', '2025-08-22T21:04+00:00', '2025-08-25', 'INTC', 'Intel', 'elogio',
     'Truth Social',
     '"It is my Great Honor to report that the United States of America now fully owns and controls 10% of INTEL, a Great American Company that has an even more incredible future."',
     array['https://trumpstruth.org/statuses/32698', 'https://www.presidency.ucsb.edu/documents/truth-social-posts-august-22-2025'],
     'verificada', 'M05'),
    (td_id, 'Donald Trump', '2025-12-10T16:00+00:00', '2025-12-10', 'DELL', 'Dell Technologies', 'elogio_producto',
     'Mesa redonda en la Casa Blanca',
     'Dijo que Dell "make[s] a great product" al agradecer a Michael y Susan Dell.',
     array['https://www.hudson-labs.com/research/trump-praised-companies'],
     'verificada', 'M06')
  on conflict (external_id) do nothing;

  -- M07..M15 en un insert aparte (mismo bloque, misma idempotencia por
  -- external_id único + on conflict do nothing).
  insert into public.mentions
    (portfolio_id, speaker, said_at, entry_date, symbol, company, kind, channel, quote, source_urls, status, external_id)
  values
    (td_id, 'Donald Trump', '2026-01-08T22:00+00:00', '2026-01-09', 'INTC', 'Intel', 'elogio',
     'Truth Social',
     '"The United States Government is proud to be a Shareholder of Intel, and has already made... Tens of Billions of Dollars for the American People — IN JUST FOUR MONTHS."',
     array['https://www.trumpstruth.org/statuses/34489', 'https://www.cnbc.com/2026/01/08/intel-stock-rises-after-trump-touts-ceo-government-investment.html'],
     'verificada', 'M07'),
    (td_id, 'Donald Trump', '2026-02-19T16:00+00:00', '2026-02-19', 'DELL', 'Dell Technologies', 'compra_directa',
     'Discurso en Rome, Georgia',
     '"Go out and buy a Dell computer."',
     array['https://www.hudson-labs.com/research/trump-praised-companies', 'https://finance.yahoo.com/markets/stocks/articles/trump-keeps-telling-americans-buy-235000210.html'],
     'verificada', 'M08'),
    (td_id, 'Donald Trump', '2026-03-26T19:00+00:00', '2026-03-27', 'MU', 'Micron Technology', 'elogio',
     'Entrevista en Fox News',
     'Describió a Micron como una de las empresas "hottest" de EE.UU. tras reunirse con su CEO.',
     array['https://stocktwits.com/news-articles/markets/equity/micron-stock-extends-slide-despite-hottest-company-nod-from-trump/cZ3uzd4RIlt', 'https://www.barchart.com/story/news/1042736/trump-says-micron-is-one-of-the-hottest-stocks-does-that-make-mu-a-buy-here'],
     'verificada', 'M09'),
    (td_id, 'Donald Trump', '2026-04-10T14:32+00:00', '2026-04-10', 'PLTR', 'Palantir Technologies', 'elogio_con_ticker',
     'Truth Social',
     '"Palantir Technologies (PLTR) has proven to have great war fighting capabilities and equipment. Just ask our enemies!!!"',
     array['https://truthsocial.com/@realDonaldTrump/posts/116380894672815869', 'https://trumpstruth.org/statuses/37688', 'https://www.cnbc.com/2026/04/10/trump-pltr-palantir-stock-iran-war.html'],
     'verificada', 'M10'),
    (td_id, 'Donald Trump', '2026-04-29T22:20+00:00', '2026-04-30', 'INTC', 'Intel', 'elogio_accion',
     'Truth Social',
     '"Intel Stock continues to rise. I''m very proud of that Company... Congratulations to Intel on doing such a great job."',
     array['https://trumpstruth.org/statuses/38092'],
     'verificada', 'M11'),
    (td_id, 'Donald Trump', '2026-05-08T16:00+00:00', '2026-05-08', 'DELL', 'Dell Technologies', 'compra_directa',
     'Evento del Día de la Madre, Casa Blanca',
     '"Go out and buy a Dell. They''re great." (la acción marcó máximo histórico ese día)',
     array['https://finance.yahoo.com/markets/stocks/articles/trump-urged-buy-dell-while-101500656.html', 'https://www.hudson-labs.com/research/trump-praised-companies'],
     'verificada', 'M12'),
    (td_id, 'Donald Trump', '2026-07-06T13:30+00:00', '2026-07-06', 'DELL', 'Dell Technologies', 'compra_directa',
     'Ceremonia en el Despacho Oval',
     '"Go out and buy a Dell computer."',
     array['https://qz.com/trump-dell-stock-endorsement-opening-bell-trump-accounts-070626'],
     'verificada', 'M13'),
    (td_id, 'Donald Trump', '2026-07-22T16:00+00:00', '2026-07-22', 'DELL', 'Dell Technologies', 'compra_directa',
     'Discurso en Marietta, Georgia',
     '"You know what I say? Go out and buy a Dell computer... that''s great stuff."',
     array['https://www.presidency.ucsb.edu/documents/remarks-marietta-georgia', 'https://www.businessinsider.com/trump-michael-dell-hyped-up-trump-accounts-donation-2026-7'],
     'verificada', 'M14'),
    (td_id, 'Donald Trump', '2026-09-06T16:00+00:00', '2026-09-08', 'INTC', 'Intel', 'elogio_accion',
     'Truth Social (imagen IA ''BOUGHT: INTEL $20 / NOW $95'')',
     '"I''ve made Hundreds of Billions of Dollars on Stocks... for the U.S.A., not myself."',
     array['https://www.cnbc.com/2026/09/07/trump-truth-social-ai-images-posting-spree.html', 'https://www.livemint.com/news/us-news/trump-shares-ai-image-showing-intel-stock-price-at-95-claims-hundreds-of-billions-in-gains-for-us-11788789679837.html'],
     'verificada', 'M15')
  on conflict (external_id) do nothing;
end $$;

-- ----------------------------------------------------------------------------
-- 4) Holdings semilla al corte 2026-10-16: pesos por valor de mercado de las
--    compras de US$1.000 por mención (unidades por mención = 1000 / cierre de
--    entrada; valor por ticker = unidades x último cierre; peso = valor/total).
--    Suman 100.00. previous_weight = 0: primera vez, detect-changes genera
--    alerta new_trade por cada ticker. U.S. Steel (X) deslistada desde
--    2025-06-18 (compra de Nippon a US$55): queda como USD-CASH (efectivo).
-- ----------------------------------------------------------------------------
do $$
declare
  td_id uuid;
begin
  select id into td_id from public.portfolios where slug = 'trump-dice';
  if td_id is null then
    raise notice '014: portafolio trump-dice no existe; holdings omitidos';
    return;
  end if;

  insert into public.holdings (portfolio_id, symbol, name, weight, previous_weight, asset_class, exchange, currency, as_of)
  values
    (td_id, 'DELL',     'Dell Technologies',                        39.18, 0.0, 'equity', 'NASDAQ', 'USD', '2026-10-16'),
    (td_id, 'INTC',     'Intel',                                    26.73, 0.0, 'equity', 'NASDAQ', 'USD', '2026-10-16'),
    (td_id, 'MU',       'Micron Technology',                         8.84, 0.0, 'equity', 'NASDAQ', 'USD', '2026-10-16'),
    (td_id, 'AAPL',     'Apple',                                     5.63, 0.0, 'equity', 'NASDAQ', 'USD', '2026-10-16'),
    (td_id, 'TSLA',     'Tesla',                                     5.52, 0.0, 'equity', 'NASDAQ', 'USD', '2026-10-16'),
    (td_id, 'PLTR',     'Palantir Technologies',                     5.22, 0.0, 'equity', 'NASDAQ', 'USD', '2026-10-16'),
    (td_id, 'SPY',      'SPDR S&P 500 ETF',                          5.08, 0.0, 'etf',    'NYSE',   'USD', '2026-10-16'),
    (td_id, 'USD-CASH', 'Efectivo (U.S. Steel, compra de Nippon a US$55)', 3.80, 0.0, 'cash', null, 'USD', '2026-10-16')
  on conflict (portfolio_id, symbol, as_of) do nothing;
end $$;
