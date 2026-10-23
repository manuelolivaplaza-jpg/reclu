-- ============================================================
-- Migration 059: imagen de los ETF de ARK Invest (D28)
-- Los 5 ETF de ARK compartían la ilustración genérica del toro
-- (02-toro.png, 005/055). Se reemplaza por la foto de la gestora,
-- Cathie Wood (fundadora de ARK Invest), con licencia libre de
-- Wikimedia Commons y crédito completo, igual que la 056.
-- Archivo: /public/portraits/ark-invest.webp (256 px, recorte cuadrado).
-- Fuente: https://commons.wikimedia.org/wiki/File:Cathie_Wood.jpg
-- Autor: Steve Jurvetson · Licencia: CC BY 2.0
-- Además se quita el toro genérico como portada de cualquier portafolio
-- (queda el avatar de iniciales como respaldo).
-- Idempotente; no borra filas.
-- ============================================================
update public.portfolios
set portrait_image = 'ark-invest.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Cathie_Wood.jpg',
    portrait_license = 'CC BY 2.0',
    portrait_author = 'Steve Jurvetson'
where source = 'ark_csv'
  and (portrait_image is null or portrait_image = 'ark-invest.webp');

update public.portfolios set cover_image = null where cover_image = '02-toro.png';
