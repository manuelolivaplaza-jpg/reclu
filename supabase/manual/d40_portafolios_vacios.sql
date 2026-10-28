-- D40 · NO APLICADO. Requiere el sí de Manu (escribe en portfolios/holdings).
-- Diagnóstico: los portafolios visibles del seed 006 (berkshire-hathaway,
-- pershing-square, renaissance-institutional, appaloosa-lp) no reciben
-- holdings: scrapers/load_13f.py escribe en los slugs "*-13f"
-- (berkshire-hathaway-13f, pershing-square-13f, renaissance-13f,
-- appaloosa-13f). Khanna y DelBene no están en scrapers/politicians.py
-- (POLITICIANS) y Tuberville tiene 0 trades (Senado 403), así que quedan
-- vacíos. Sus tarjetas mostraban el return_ytd estático del seed.

-- 1) Diagnóstico (solo lectura).
select p.slug, p.is_active, p.return_ytd, count(h.*) as holdings,
       (select count(*) from portfolio_performance pp where pp.portfolio_id = p.id) as puntos_serie
from portfolios p
left join holdings h on h.portfolio_id = p.id
where p.slug in ('berkshire-hathaway','berkshire-hathaway-13f','pershing-square','pershing-square-13f',
                 'renaissance-institutional','renaissance-13f','appaloosa-lp','appaloosa-13f',
                 'khanna-tracker','delbene-tracker','tuberville-tracker')
group by p.id, p.slug, p.is_active, p.return_ytd
order by p.slug;

-- 2) Propuesta A (si el "*-13f" está activo y con holdings): ocultar el seed
--    vacío y redirigir al real (la app ya redirige con replaced_by_slug, 308).
-- begin;
-- update portfolios s set is_active = false, replaced_by_slug = r.slug
-- from portfolios r
-- where (s.slug, r.slug) in (('berkshire-hathaway','berkshire-hathaway-13f'),
--                            ('pershing-square','pershing-square-13f'),
--                            ('renaissance-institutional','renaissance-13f'),
--                            ('appaloosa-lp','appaloosa-13f'))
--   and r.is_active = true
--   and exists (select 1 from holdings h where h.portfolio_id = r.id);
-- commit;
--    Alternativa: cambiar FUND_SLUG en load_13f.py para escribir en el slug
--    visible (más seguidores, fotos de 059/060) y desactivar el "*-13f".

-- 3) Propuesta B: no mostrar el return_ytd estático del seed en portafolios
--    sin serie (la UI ya no lo muestra en tarjetas; esto limpia OG/compare).
-- update portfolios p set return_ytd = null
-- where not exists (select 1 from portfolio_performance pp where pp.portfolio_id = p.id)
--   and not exists (select 1 from holdings h where h.portfolio_id = p.id);
