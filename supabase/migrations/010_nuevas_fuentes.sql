-- ============================================================
-- Migration 010 (F3): nuevas fuentes — senadores del Senado de EE.UU.,
-- fondos 13F adicionales y ETFs iShares/VanEck.
-- 100% idempotente: seguro de re-ejecutar en el SQL Editor de Supabase.
-- Portafolios nuevos:
--   Senado:  tuberville-tracker (ya existe en 006), mccormick-tracker
--            (ya existe en 006), mullin-tracker (NUEVO)
--   13F:     dme-greenlight-13f, ako-13f, hhlr-13f, temasek-13f
--   ETFs:    ech, eww, ewz, ibit, smh
-- ============================================================

insert into public.portfolios (slug, name, description, category, source, manager, country, followers, return_ytd, premium, tags, is_active)
values
  -- Senado de EE.UU. (scraper senate_disclosure.py, fuente efdsearch.senate.gov)
  ('mullin-tracker', 'Markwayne Mullin Tracker',
   'Operaciones del senador Markwayne Mullin (R-OK), declaradas en los Periodic Transaction Reports oficiales del Senado.',
   'political_us', 'senate_efd', 'Markwayne Mullin', 'US', 3200, 18.50, false,
   '{senado,efd,ptr}', true),

  -- Fondos 13F adicionales (sec13f.py, fuente data.sec.gov)
  ('dme-greenlight-13f', 'Greenlight Capital (DME)',
   'El libro 13F vigente de David Einhorn, presentado por DME Capital Management (Greenlight Capital Inc dejó de presentar en 2024).',
   'hedge_fund', 'sec_13f', 'David Einhorn', 'US', 4100, 12.80, false,
   '{einhorn,13f,value,short}', true),

  ('ako-13f', 'AKO Capital',
   'El libro 13F de AKO Capital (Londres). Atención: el infotable no estándar reporta el valor en miles de dólares.',
   'hedge_fund', 'sec_13f', 'AKO Capital', 'Global', 2900, 15.20, true,
   '{tangen,13f,london,long}', true),

  ('hhlr-13f', 'HHLR Advisors',
   'El libro 13F de HHLR Advisors (ex Hillhouse Capital), el gestor con raíces en Asia que invierte en nombres listados en EE.UU.',
   'hedge_fund', 'sec_13f', 'HHLR Advisors', 'Global', 2600, 14.30, true,
   '{hillhouse,13f,asia}', true),

  ('temasek-13f', 'Temasek Holdings (13F)',
   'La tajada listada en EE.UU. del fondo soberano de Singapur según sus filings 13F (el libro global completo es mayor).',
   'hedge_fund', 'sec_13f', 'Temasek', 'Global', 3400, 11.90, false,
   '{soberano,13f,singapur}', true),

  -- ETFs con holdings oficiales diarios del emisor (etfs.py)
  ('ech', 'iShares MSCI Chile ETF (ECH)',
   'La canasta MSCI Chile publicada por BlackRock: holdings diarios oficiales del emisor, benchmark del mercado chileno.',
   'thematic', 'ishares_csv', 'BlackRock/iShares', 'CL', 5600, -6.51, false,
   '{chile,msci,etf,benchmark}', true),

  ('eww', 'iShares MSCI Mexico ETF (EWW)',
   'La canasta MSCI Mexico publicada por BlackRock: holdings diarios oficiales del emisor.',
   'thematic', 'ishares_csv', 'BlackRock/iShares', 'US', 4100, 9.80, false,
   '{mexico,msci,etf}', true),

  ('ewz', 'iShares MSCI Brazil ETF (EWZ)',
   'La canasta MSCI Brazil publicada por BlackRock: holdings diarios oficiales del emisor.',
   'thematic', 'ishares_csv', 'BlackRock/iShares', 'US', 4300, 32.16, false,
   '{brasil,msci,etf}', true),

  ('ibit', 'iShares Bitcoin Trust (IBIT)',
   'El fondo de bitcoin de BlackRock. Un solo activo subyacente (BTC); holdings diarios del emisor. Lista también en la Bolsa de Santiago.',
   'thematic', 'ishares_csv', 'BlackRock/iShares', 'US', 12800, 41.20, false,
   '{bitcoin,btc,etf,santiago}', true),

  ('smh', 'VanEck Semiconductor ETF (SMH)',
   'Las principales semiconductoras globales según el archivo diario de holdings de VanEck. Pesos oficiales del emisor.',
   'thematic', 'vaneck_xlsx', 'VanEck', 'US', 7200, 28.40, false,
   '{semis,chips,etf}', true)
on conflict (slug) do nothing;
