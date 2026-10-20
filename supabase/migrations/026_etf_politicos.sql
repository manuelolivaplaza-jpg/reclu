-- ============================================================
-- Migración 026 — ETFs de congresistas NANC y GOP (F26)
--
-- NANC (Unusual Whales Subversive Democratic Trading ETF) y GOP
-- (Unusual Whales Subversive Republican Trading ETF) son ETFs de
-- Subversive: un producto comercial cuyos holdings salen del formulario
-- N-PORT del trust en EDGAR (CIK 1742912), no de los PTR de los
-- congresistas. No son una divulgación oficial de un funcionario.
--
-- Por decisión de producto ambos van PREMIUM (detrás del muro de pago,
-- migración 012). Las declaraciones que sí son oficiales y públicas
-- (`house_ptr`, `senate_ptr`, `oge_278t`) siguen gratis, como exige
-- 5 U.S.C. § 13107.
--
-- Fuente: formularios N-PORT del trust en EDGAR, no la web del emisor
-- (devuelve 403 y carga los holdings con JS). Los holdings los carga
-- scrapers/etfs.py; esta migración solo crea los portafolios.
--
-- Idempotente: insert ... on conflict (slug) do update set premium = true.
-- Reejecutar no duplica y corrige filas que ya existan como premium = false.
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
) values
  (
    'nanc-etf',
    'NANC — Congresistas demócratas',
    'ETF de Subversive que sigue una cartera basada en las operaciones divulgadas por miembros demócratas del Congreso de EE.UU. Holdings desde el N-PORT oficial en EDGAR. Información pública, no recomendación de inversión.',
    'political_us',
    'nport_subversive',
    'Subversive Capital Advisor',
    'US',
    0,
    null,
    true,
    array['etf', 'congreso', 'democratas', 'nanc', 'subversive']
  ),
  (
    'gop-etf',
    'GOP — Congresistas republicanos',
    'ETF de Subversive que sigue una cartera basada en las operaciones divulgadas por miembros republicanos del Congreso de EE.UU. (antes KRUZ). Holdings desde el N-PORT oficial en EDGAR. Información pública, no recomendación de inversión.',
    'political_us',
    'nport_subversive',
    'Subversive Capital Advisor',
    'US',
    0,
    null,
    true,
    array['etf', 'congreso', 'republicanos', 'gop', 'subversive']
  )
on conflict (slug) do update set premium = true;
