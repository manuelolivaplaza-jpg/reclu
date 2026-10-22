-- ============================================================
-- Migration 055: imágenes de portafolios (opción A + B)
-- A) Reasigna las 12 ilustraciones de /public/covers a todo portafolio
--    activo o no que NO tenga cover_image (la 005 fue una foto fija y no
--    cubrió los creados después, p. ej. inverse-cramer de la 018).
--    Primero reglas por slug y source, luego un fallback por category.
--    Nunca pisa un cover_image ya asignado.
-- B) Columnas portrait_image / portrait_source / portrait_license y los
--    retratos oficiales de dominio público SOLO de cargos públicos de
--    EE.UU. (Congreso: bioguide.congress.gov; presidente: Casa Blanca).
--    Archivos en /public/portraits/<slug>.webp (256 px). Nada de fotos de
--    gestores, comentaristas, empresarios ni políticos chilenos.
-- Idempotente: add column if not exists + updates deterministas.
-- ============================================================

-- ---- A) ilustraciones ----
update public.portfolios set cover_image = '12-global.png'
  where cover_image is null and slug in ('inverse-cramer', 'ai-world-war', 'claude-portfolio', 'latin-tech', 'bonos-tesoro-us', 'dividend-aristocrats', 'bug', 'hero');

update public.portfolios set cover_image = case
    when source = 'ark_csv' then '02-toro.png'
    when source in ('ishares_csv', 'globalx_csv') then '08-grafico.png'
    when source = 'radar_ia' then '05-algoritmo.png'
    when source = 'sec_13f' then '03-inversor-viejo.png'
    when source in ('sec_form4', 'sec_schedule_13d', 'sec_xbrl_frames') then '04-inversor-joven.png'
    when source in ('renta4', 'larrainvial', 'btg', 'bice_cartera', 'corredoras_cl', 'cmf', 'cmf_fondos', 'spensiones', 'infoprobidad') then '11-banca.png'
    when source in ('musk_mentions', 'cnbc_lightning_round', 'public_mentions') then '12-global.png'
    when source in ('capitol_trades', 'congress_bridge', 'congress_invests', 'house_clerk', 'senate_efd', 'oge_278t', 'trump_mentions', 'truth_social', 'nport_subversive') then '01-capitolio.png'
    else null
  end
  where cover_image is null
    and source in ('ark_csv', 'ishares_csv', 'globalx_csv', 'radar_ia', 'sec_13f', 'sec_form4', 'sec_schedule_13d', 'sec_xbrl_frames',
                   'renta4', 'larrainvial', 'btg', 'bice_cartera', 'corredoras_cl', 'cmf', 'cmf_fondos', 'spensiones', 'infoprobidad',
                   'musk_mentions', 'cnbc_lightning_round', 'public_mentions',
                   'capitol_trades', 'congress_bridge', 'congress_invests', 'house_clerk', 'senate_efd', 'oge_278t', 'trump_mentions', 'truth_social', 'nport_subversive');

update public.portfolios set cover_image = case category
    when 'political_us' then '01-capitolio.png'
    when 'broker_cl' then '11-banca.png'
    when 'hedge_fund' then '03-inversor-viejo.png'
    when 'public_disclosure' then '04-inversor-joven.png'
    when 'model' then '05-algoritmo.png'
    else '12-global.png'
  end
  where cover_image is null;

-- ---- B) retratos oficiales (dominio público) ----
alter table public.portfolios add column if not exists portrait_image text;
alter table public.portfolios add column if not exists portrait_source text;
alter table public.portfolios add column if not exists portrait_license text;
comment on column public.portfolios.portrait_image is 'Archivo bajo /portraits (retrato oficial de dominio público de un cargo público de EE.UU.), o null';

update public.portfolios p
set portrait_image = v.img, portrait_source = v.src, portrait_license = v.lic
from (values
  ('cisneros-tracker', 'cisneros-tracker.webp', 'https://bioguide.congress.gov/photo/C001123.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('delbene-tracker', 'delbene-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/D000617.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('fields-tracker', 'fields-tracker.webp', 'https://bioguide.congress.gov/photo/F000110.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('gottheimer-tracker', 'gottheimer-tracker.webp', 'https://bioguide.congress.gov/photo/G000583.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('hern-tracker', 'hern-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/H001082.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('khanna-tracker', 'khanna-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/K000389.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('mccaul-tracker', 'mccaul-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/M001157.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('mcclain-delaney-tracker', 'mcclain-delaney-tracker.webp', 'https://bioguide.congress.gov/photo/M001232.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('mccormick-tracker', 'mccormick-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/M001243.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('moskowitz-tracker', 'moskowitz-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/M001217.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('mullin-tracker', 'mullin-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/M001190.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('pelosi-tracker', 'pelosi-tracker.webp', 'https://unitedstates.github.io/images/congress/450x550/P000197.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)'),
  ('trump-compra', 'trump-compra.webp', 'https://commons.wikimedia.org/wiki/File:Official_Presidential_Portrait_of_President_Donald_J._Trump_(2025)_(3x4_close_cropped).jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial de la Casa Blanca)'),
  ('trump-dice', 'trump-dice.webp', 'https://commons.wikimedia.org/wiki/File:Official_Presidential_Portrait_of_President_Donald_J._Trump_(2025)_(3x4_close_cropped).jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial de la Casa Blanca)'),
  ('trump-trades', 'trump-trades.webp', 'https://commons.wikimedia.org/wiki/File:Official_Presidential_Portrait_of_President_Donald_J._Trump_(2025)_(3x4_close_cropped).jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial de la Casa Blanca)'),
  ('trump-truth-signals', 'trump-truth-signals.webp', 'https://commons.wikimedia.org/wiki/File:Official_Presidential_Portrait_of_President_Donald_J._Trump_(2025)_(3x4_close_cropped).jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial de la Casa Blanca)'),
  ('tuberville-tracker', 'tuberville-tracker.webp', 'https://bioguide.congress.gov/photo/T000278.jpg', 'Dominio público (obra del gobierno federal de EE.UU., retrato oficial del Congreso)')
) as v(slug, img, src, lic)
where p.slug = v.slug;

-- Verificación:
-- select count(*) filter (where cover_image is null) as sin_cover,
--        count(*) filter (where portrait_image is not null) as con_retrato,
--        count(*) from public.portfolios;

-- rollback (manual):
-- update public.portfolios set portrait_image = null, portrait_source = null, portrait_license = null;
-- alter table public.portfolios drop column if exists portrait_license, drop column if exists portrait_source, drop column if exists portrait_image;
-- (las ilustraciones asignadas por la parte A se pueden dejar: son las mismas de la 005)
