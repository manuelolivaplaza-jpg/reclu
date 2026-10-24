-- ============================================================
-- Migration 060: logos de fondos (Wikimedia Commons) + RPC de series (D29)
-- A) Logos con licencia verificada en Wikimedia Commons (dominio público,
--    marca registrada: se muestra con crédito y sin sugerir respaldo):
--    - iShares by BlackRock: File:Logo-ishares_2019.svg
--      https://commons.wikimedia.org/wiki/File:Logo-ishares_2019.svg
--      Licencia: Dominio público (marca registrada) · Autor: BlackRock
--    - Berkshire Hathaway:   File:Berkshire-Hathaway-Logo.svg
--      https://commons.wikimedia.org/wiki/File:Berkshire-Hathaway-Logo.svg
--      Licencia: Dominio público (marca registrada) · Autor: Berkshire Hathaway
--      (versión apilada en dos líneas para que se lea en 40/64 px)
--    Archivos: /public/portraits/ishares-logo.webp, berkshire-logo.webp (256 px).
--    Se guardan en portrait_* (misma ruta de avatar y crédito que la 056).
--    Reemplaza la foto de Buffett solo en berkshire-hathaway(-13f).
-- B) RPC portfolio_ids_with_series(): ids de portafolios con al menos un
--    punto en portfolio_performance (solo ids, sin cifras). Solo service_role.
-- Idempotente; no borra filas.
-- ============================================================
update public.portfolios
set portrait_image = 'ishares-logo.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Logo-ishares_2019.svg',
    portrait_license = 'Dominio público (marca registrada)',
    portrait_author = 'BlackRock'
where source = 'ishares_csv';

update public.portfolios
set portrait_image = 'berkshire-logo.webp',
    portrait_source = 'https://commons.wikimedia.org/wiki/File:Berkshire-Hathaway-Logo.svg',
    portrait_license = 'Dominio público (marca registrada)',
    portrait_author = 'Berkshire Hathaway'
where slug in ('berkshire-hathaway', 'berkshire-hathaway-13f');

create or replace function public.portfolio_ids_with_series()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct portfolio_id from public.portfolio_performance;
$$;

revoke all on function public.portfolio_ids_with_series() from public, anon, authenticated;
grant execute on function public.portfolio_ids_with_series() to service_role;
