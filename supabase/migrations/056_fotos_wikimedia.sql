-- ============================================================
-- Migration 056: fotos reales con licencia libre (Wikimedia Commons)
-- Retratos de gestores, inversores y figuras públicas sin retrato oficial.
-- Solo archivos verificados en Commons con dominio público, CC BY o CC BY-SA.
-- Se guarda autor, licencia y URL de la ficha en Commons para el crédito.
-- Archivos en /public/portraits/<slug>.webp (256 px, recorte cuadrado).
-- Idempotente; solo toca slugs listados (si un slug no existe, no hace nada).
-- ============================================================
alter table public.portfolios add column if not exists portrait_author text;
comment on column public.portfolios.portrait_author is 'Autor de la foto para el crédito (Wikimedia Commons), o null';
comment on column public.portfolios.portrait_image is 'Archivo bajo /portraits (retrato oficial de dominio público o foto con licencia libre de Wikimedia Commons), o null';

update public.portfolios p
set portrait_image = v.img, portrait_source = v.src, portrait_license = v.lic, portrait_author = v.author
from (values
  ('berkshire-hathaway', 'berkshire-hathaway.webp', 'https://commons.wikimedia.org/wiki/File:Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_(cropped).jpg', 'Dominio público', 'USA International Trade Administration'),
  ('berkshire-hathaway-13f', 'berkshire-hathaway-13f.webp', 'https://commons.wikimedia.org/wiki/File:Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_(cropped).jpg', 'Dominio público', 'USA International Trade Administration'),
  ('pershing-square', 'pershing-square.webp', 'https://commons.wikimedia.org/wiki/File:Valeant_Pharmaceuticals%27_Business_Model_(headshot).jpg', 'CC BY 2.0', 'Senate Democrats'),
  ('pershing-square-13f', 'pershing-square-13f.webp', 'https://commons.wikimedia.org/wiki/File:Valeant_Pharmaceuticals%27_Business_Model_(headshot).jpg', 'CC BY 2.0', 'Senate Democrats'),
  ('appaloosa-lp', 'appaloosa-lp.webp', 'https://commons.wikimedia.org/wiki/File:David_Tepper_01.jpg', 'CC BY-SA 3.0', 'Appaloosa Management'),
  ('appaloosa-13f', 'appaloosa-13f.webp', 'https://commons.wikimedia.org/wiki/File:David_Tepper_01.jpg', 'CC BY-SA 3.0', 'Appaloosa Management'),
  ('tci-fund', 'tci-fund.webp', 'https://commons.wikimedia.org/wiki/File:Chris_Hohn_GFSS_2023.jpg', 'CC BY 2.0', 'Foreign, Commonwealth & Development Office'),
  ('tci-13f', 'tci-13f.webp', 'https://commons.wikimedia.org/wiki/File:Chris_Hohn_GFSS_2023.jpg', 'CC BY 2.0', 'Foreign, Commonwealth & Development Office'),
  ('baupost-13f', 'baupost-13f.webp', 'https://commons.wikimedia.org/wiki/File:Seth_Klarman_at_147th_Preakness_Stakes.jpg', 'CC BY 2.0', 'Maryland GovPics'),
  ('softbank-vision', 'softbank-vision.webp', 'https://commons.wikimedia.org/wiki/File:Masayoshi_Son_(P066533-522034,_cropped).jpg', 'CC BY 4.0', 'European Communities, 2025 / EC - Audiovisual Service'),
  ('renaissance-institutional', 'renaissance-institutional.webp', 'https://commons.wikimedia.org/wiki/File:Jim_Simons_at_MSRI.jpg', 'CC BY-SA 3.0', 'Gleuschk'),
  ('renaissance-13f', 'renaissance-13f.webp', 'https://commons.wikimedia.org/wiki/File:Jim_Simons_at_MSRI.jpg', 'CC BY-SA 3.0', 'Gleuschk'),
  ('bridgewater-all-weather', 'bridgewater-all-weather.webp', 'https://commons.wikimedia.org/wiki/File:Web_Summit_2018_-_Forum_-_Day_2,_November_7_HM1_7481_(44858045925).jpg', 'CC BY 2.0', 'Web Summit'),
  ('bridgewater-13f', 'bridgewater-13f.webp', 'https://commons.wikimedia.org/wiki/File:Web_Summit_2018_-_Forum_-_Day_2,_November_7_HM1_7481_(44858045925).jpg', 'CC BY 2.0', 'Web Summit'),
  ('soros-13f', 'soros-13f.webp', 'https://commons.wikimedia.org/wiki/File:George_Soros,_Founder_and_Chairman_of_the_Open_Society_Foundations,_visits_the_EC_(3x4_cropped).jpg', 'CC BY 4.0', 'Aris Oikonomou / European Commission'),
  ('musk-dice', 'musk-dice.webp', 'https://commons.wikimedia.org/wiki/File:Elon_Musk_-_54820081119_(cropped).jpg', 'CC BY-SA 4.0', 'Gage Skidmore'),
  ('elon-doge-tracker', 'elon-doge-tracker.webp', 'https://commons.wikimedia.org/wiki/File:Elon_Musk_-_54820081119_(cropped).jpg', 'CC BY-SA 4.0', 'Gage Skidmore'),
  ('inverse-cramer-real', 'inverse-cramer-real.webp', 'https://commons.wikimedia.org/wiki/File:Andrew_Aziz_Cramer_(cropped).jpg', 'CC BY 2.0', 'Bear Bull Traders'),
  ('inverse-cramer', 'inverse-cramer.webp', 'https://commons.wikimedia.org/wiki/File:Andrew_Aziz_Cramer_(cropped).jpg', 'CC BY 2.0', 'Bear Bull Traders'),
  ('bessent-oge', 'bessent-oge.webp', 'https://commons.wikimedia.org/wiki/File:Official_portrait_of_Treasury_Secretary_Scott_Bessent_(borderless)_(cropped).jpg', 'Dominio público', 'U.S. Department of the Treasury'),
  ('lutnick-oge', 'lutnick-oge.webp', 'https://commons.wikimedia.org/wiki/File:Howard_Lutnick_2025.jpg', 'Dominio público', 'Daniel Torok'),
  ('hegseth-oge', 'hegseth-oge.webp', 'https://commons.wikimedia.org/wiki/File:Pete_Hegseth_Official_Portrait.jpg', 'Dominio público', 'U.S. Department of Defense')
) as v(slug, img, src, lic, author)
where p.slug = v.slug;

-- Verificación:
-- select count(*) filter (where portrait_image is not null) from public.portfolios;
-- Rollback:
-- update public.portfolios set portrait_image = null, portrait_source = null, portrait_license = null, portrait_author = null where portrait_source like 'https://commons.wikimedia.org/%';
-- alter table public.portfolios drop column if exists portrait_author;
