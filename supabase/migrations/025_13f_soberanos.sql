-- ============================================================
-- Migration 025 (F25): 13F de soberanos, banco central y family offices.
-- CIK verificados 2026-10-19 en data.sec.gov
-- (scrapers/data/v2/F25/ciks_verificados.json):
--   Norges Bank            1374170  top 50 por valor
--   Swiss National Bank    1582202  top 50 por valor
--   Gates Foundation Trust 1166559
--   Icahn Carl C            921669
-- Duquesne (1536411) y Soros (1029160) ya existen: no se reinsertan.
--
-- Idempotente: no crea tablas, funciones ni policies. La única escritura
-- es un insert con on conflict (slug) do nothing, así que correrla dos
-- veces no cambia filas ni falla. premium queda en false.
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags, is_active
)
values
  ('norges-bank-13f', 'Norges Bank (13F)',
   'Las 50 posiciones de mayor valor del 13F de Norges Bank, el fondo soberano de Noruega. El libro listado en EE.UU. tiene miles de líneas; aquí queda ese corte. El peso de cada línea es su participación en el 13F completo, no en el corte. El detalle semestral de todas las inversiones está en https://www.nbim.no/en/investments/all-investments/.',
   'hedge_fund', 'sec_13f', 'Norges Bank Investment Management', 'Global', 0, null, false,
   '{soberano,13f}', true),

  ('snb-13f', 'Swiss National Bank (13F)',
   'Las 50 posiciones de mayor valor del 13F del Swiss National Bank. El banco central suizo declara miles de líneas en EE.UU.; este portafolio publica solo el top 50 por valor reportado. El peso de cada línea es su participación en el 13F completo, no en el corte.',
   'hedge_fund', 'sec_13f', 'Swiss National Bank', 'Global', 0, null, false,
   '{soberano,13f}', true),

  ('gates-foundation-13f', 'Gates Foundation Trust (13F)',
   'El libro 13F del Bill & Melinda Gates Foundation Trust: la cartera de inversión que la fundación declara ante la SEC.',
   'hedge_fund', 'sec_13f', 'Gates Foundation Trust', 'Global', 0, null, false,
   '{family-office,13f}', true),

  ('icahn-13f', 'Carl Icahn (13F)',
   'El libro 13F de Carl C. Icahn, family office activista, con las posiciones listadas en EE.UU. al cierre de cada trimestre.',
   'hedge_fund', 'sec_13f', 'Carl C. Icahn', 'Global', 0, null, false,
   '{family-office,13f}', true)
on conflict (slug) do nothing;
