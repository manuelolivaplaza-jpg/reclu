-- ============================================================
-- Migration 068 (D41): logos oficiales de instituciones. NO APLICADA.
-- Solo actualiza portrait_* de portafolios de instituciones (corredoras,
-- AFP, fondos 13F, emisores de ETF, bancos). No toca personas.
-- Archivos en /public/portraits/logo-*.webp (256 px, WebP). Fuentes y
-- licencias en public/portraits/ATRIBUCIONES-LOGOS.md. Idempotente.
-- ============================================================

-- AFP Capital
update public.portfolios
set portrait_image = 'logo-afp-capital.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:AFP_Capital_Logo.jpg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'AFP Capital'
where slug in ('afp-capital-acciones-cl');

-- AFP Habitat
update public.portfolios
set portrait_image = 'logo-afp-habitat.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:AFP_Habitat.jpg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'AFP Habitat'
where slug in ('afp-habitat-acciones-cl');

-- AFP PlanVital
update public.portfolios
set portrait_image = 'logo-afp-planvital.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Plan-vital.png',
    portrait_license = 'CC BY-SA 4.0 (marca registrada)',
    portrait_author = 'AFP PlanVital'
where slug in ('afp-planvital-acciones-cl');

-- AFP ProVida
update public.portfolios
set portrait_image = 'logo-afp-provida.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Logotipo_AFP_ProVida.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'AFP ProVida'
where slug in ('afp-provida-acciones-cl');

-- AFP UNO
update public.portfolios
set portrait_image = 'logo-afp-uno.webp',
    portrait_source = 'https://static.uno.cl/images/logo-unoafp.svg',
    portrait_license = 'Marca registrada (logo publicado en el sitio oficial)',
    portrait_author = 'AFP UNO'
where slug in ('afp-uno-acciones-cl');

-- AKO Capital
update public.portfolios
set portrait_image = 'logo-ako.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:AKO_Capital.png',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'AKO Capital'
where slug in ('ako-13f');

-- Banco BICE
update public.portfolios
set portrait_image = 'logo-banco-bice.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Logo_Banco_BICE-300dpi.jpg',
    portrait_license = 'CC BY-SA 4.0 (marca registrada)',
    portrait_author = 'Banco BICE'
where slug in ('bice-acciones-destacadas');

-- The Baupost Group
update public.portfolios
set portrait_image = 'logo-baupost.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:The_Baupost_Group_Logo.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'The Baupost Group'
where slug in ('baupost-13f');

-- BTG Pactual
update public.portfolios
set portrait_image = 'logo-btg-pactual.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Btg-logo-blue.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'BTG Pactual'
where slug in ('btg-cartera-recomendada', 'btg-insights');

-- Coatue Management
update public.portfolios
set portrait_image = 'logo-coatue.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Coatue_Logo.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Coatue Management'
where slug in ('coatue-13f', 'coatue-management');

-- Egerton Capital
update public.portfolios
set portrait_image = 'logo-egerton.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Egerton_Capital.jpg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Egerton Capital'
where slug in ('egerton-13f');

-- Gates Foundation
update public.portfolios
set portrait_image = 'logo-gates-foundation.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Gates_Foundation_logo.svg',
    portrait_license = 'CC0 (marca registrada)',
    portrait_author = 'Gates Foundation'
where slug in ('gates-foundation-13f');

-- Global X ETFs
update public.portfolios
set portrait_image = 'logo-global-x.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:GX-Wordmark_ST-OrangeRGB.png',
    portrait_license = 'CC BY-SA 4.0 (marca registrada)',
    portrait_author = 'Global X ETFs'
where slug in ('copx', 'lit', 'bug', 'hero');

-- Hillhouse Investment (HHLR Advisors)
update public.portfolios
set portrait_image = 'logo-hillhouse.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Hillhouse_2024.png',
    portrait_license = 'CC0 (marca registrada)',
    portrait_author = 'Hillhouse Investment (HHLR Advisors)'
where slug in ('hhlr-13f');

-- Icahn Enterprises
update public.portfolios
set portrait_image = 'logo-icahn.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Icahn_Enterprises_Logo.gif',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Icahn Enterprises'
where slug in ('icahn-13f');

-- MBI Inversiones
update public.portfolios
set portrait_image = 'logo-mbi.webp',
    portrait_source = 'https://www.mbi.cl/static/img/logo-border.svg',
    portrait_license = 'Marca registrada (logo publicado en el sitio oficial)',
    portrait_author = 'MBI Inversiones'
where slug in ('mbi-acciones-recomendadas');

-- Mubadala Investment Company
update public.portfolios
set portrait_image = 'logo-mubadala.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Mubadala_Investment_logo.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Mubadala Investment Company'
where slug in ('mubadala-13f', 'mubadala-sovereign');

-- Norges Bank
update public.portfolios
set portrait_image = 'logo-norges-bank.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Norges_Bank_logo.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Norges Bank'
where slug in ('norges-bank-13f');

-- Public Investment Fund
update public.portfolios
set portrait_image = 'logo-pif.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Public_Investment_Fund_(Saudi_Arabia)_logo.svg',
    portrait_license = 'CC BY-SA 4.0 (marca registrada)',
    portrait_author = 'Public Investment Fund'
where slug in ('pif-13f', 'pif-saudi');

-- Polymarket
update public.portfolios
set portrait_image = 'logo-polymarket.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Polymarket.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Polymarket'
where slug in ('polymarket-ballenas');

-- Renaissance Technologies
update public.portfolios
set portrait_image = 'logo-renaissance.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Renaissance_Technologies.png',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Renaissance Technologies'
where slug in ('renaissance-13f', 'renaissance-institutional');

-- Renta 4
update public.portfolios
set portrait_image = 'logo-renta4.webp',
    portrait_source = 'https://www.renta4.cl/content/dam/rentabanco/renta4chile/imagenes/header-y-footer/logo-home-Chile.png',
    portrait_license = 'Marca registrada (logo publicado en el sitio oficial)',
    portrait_author = 'Renta 4'
where slug in ('renta4-moderada', 'renta4-moderada-ampliada');

-- Scion Asset Management
update public.portfolios
set portrait_image = 'logo-scion.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Scion_Asset_Management.png',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Scion Asset Management'
where slug in ('scion-13f', 'scion-asset-management');

-- Banco Nacional Suizo (SNB)
update public.portfolios
set portrait_image = 'logo-snb.webp',
    portrait_source = 'https://www.snb.ch/.resources/frontend/assets/default/img/logo/logo~3c63f919~2026-10-23-20-28-26-000~cache.svg',
    portrait_license = 'Marca registrada (logo publicado en el sitio oficial)',
    portrait_author = 'Banco Nacional Suizo (SNB)'
where slug in ('snb-13f');

-- SoftBank Group
update public.portfolios
set portrait_image = 'logo-softbank.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:SoftBank_logo.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'SoftBank Group'
where slug in ('softbank-13f', 'softbank-vision');

-- Soros Fund Management
update public.portfolios
set portrait_image = 'logo-soros.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Soros_Fund_Mgmt_logo.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Soros Fund Management'
where slug in ('soros-13f');

-- Temasek Holdings
update public.portfolios
set portrait_image = 'logo-temasek.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Temasek_Holdings_logo.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Temasek Holdings'
where slug in ('temasek-13f');

-- Third Point LLC
update public.portfolios
set portrait_image = 'logo-third-point.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Third_Point_LLC_Logo.svg',
    portrait_license = 'CC BY-SA 4.0 (marca registrada)',
    portrait_author = 'Third Point LLC'
where slug in ('third-point-13f');

-- Tiger Global Management
update public.portfolios
set portrait_image = 'logo-tiger-global.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Tiger_Global.png',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'Tiger Global Management'
where slug in ('tiger-global', 'tiger-global-13f');

-- VanEck
update public.portfolios
set portrait_image = 'logo-vaneck.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Vaneck.svg',
    portrait_license = 'Public domain (marca registrada)',
    portrait_author = 'VanEck'
where slug in ('smh');

-- Viking Global Investors
update public.portfolios
set portrait_image = 'logo-viking-global.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Viking_Global_Investors_logo.png',
    portrait_license = 'CC BY-SA 4.0 (marca registrada)',
    portrait_author = 'Viking Global Investors'
where slug in ('viking-global-13f');
