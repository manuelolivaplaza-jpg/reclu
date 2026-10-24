-- ============================================================
-- Migración 063 — Portafolios D33 (idempotente, solo inserta)
--
-- 1) scion-13f (Michael Burry). Ya está en schema.sql; aquí se asegura.
--    Fuente: 13F de Scion Asset Management, CIK 1649339 (scrapers/sec13f.py).
--    Ojo: el último 13F es 0001649339-25-000007, presentado 2025-11-03;
--    Scion se desregistró y no hay 13F posteriores. La cartera queda congelada.
-- 2) tuberville-tracker (senador Tommy Tuberville). Ya existe desde la 006;
--    aquí se asegura. Config en politicians.POLITICIANS y SENATORS.
-- 3) inverse-cramer-compras (nuevo): solo el lado largo de inverse-cramer-real
--    (scrapers/inverse_cramer_compras.py).
-- on conflict (slug) do nothing: no pisa filas existentes ni borra nada.
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
) values
  ('scion-13f', 'Scion 13F',
   'Cartera de Scion Asset Management (Michael Burry) según sus declaraciones 13F ante la SEC. Último 13F: 3-11-2025; Scion dejó de reportar.',
   'hedge_fund', 'sec_13f', 'Michael Burry', 'US', 0, null, false,
   array['burry', 'scion', '13f', 'contrarian']),
  ('tuberville-tracker', 'Tommy Tuberville Tracker',
   'Operaciones del senador Tommy Tuberville (R-AL) según sus declaraciones de transacciones (STOCK Act).',
   'political_us', 'congress_invests', 'Tommy Tuberville', 'US', 0, null, false,
   array['senado', 'congreso', 'tuberville']),
  ('inverse-cramer-compras', 'Inverse Cramer: solo compras',
   'Simulación: se compra lo que Jim Cramer recomienda vender en el Lightning Round de CNBC. Sin cortos, igual peso, 30 días hábiles. Mismos picks verificados que Inverse Cramer (real).',
   'model', 'cnbc_lightning_round', 'Jim Cramer (invertido)', 'US', 0, null, false,
   array['cramer', 'inverse', 'cnbc', 'compras'])
on conflict (slug) do nothing;
