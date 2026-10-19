-- ============================================================
-- Migración 026 — ETFs de congresistas NANC y GOP (F26)
--
-- NANC (Unusual Whales Subversive Democratic Trading ETF) y GOP
-- (Unusual Whales Subversive Republican Trading ETF) replican carteras
-- basadas en las divulgaciones (PTR) de miembros del Congreso de EE.UU.
--
-- Fuente: formularios N-PORT del trust en EDGAR (CIK 1742912), no la web
-- del emisor (devuelve 403 y carga los holdings con JS). Los holdings los
-- carga scrapers/etfs.py; esta migración solo crea los portafolios.
--
-- Legal: la propia web de NANC advierte que EIGA (5 U.S.C. § 13107)
-- prohíbe el uso comercial de los PTR. Por eso ambos ETFs van gratis
-- (premium = false) y su fuente queda fuera del muro en
-- src/lib/public-disclosure.ts. No son una recomendación de inversión.
--
-- Idempotente: insert ... on conflict (slug) do nothing. Reejecutar no
-- duplica ni pisa portafolios ya existentes.
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
    false,
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
    false,
    array['etf', 'congreso', 'republicanos', 'gop', 'subversive']
  )
on conflict (slug) do nothing;
