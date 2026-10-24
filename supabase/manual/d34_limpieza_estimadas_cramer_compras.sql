-- D34 (manual, requiere aprobación de Manu): BORRA filas estimadas de
-- inverse-cramer-compras en portfolio_performance (las 730 proyectadas desde
-- 2023 por performance.py antes del arreglo). No toca filas reales
-- (is_estimated = false), que escribe event_series.py desde el primer pick.
-- Revisar primero:
select count(*) as estimadas, min(date), max(date)
  from public.portfolio_performance pp
  join public.portfolios p on p.id = pp.portfolio_id
 where p.slug = 'inverse-cramer-compras' and pp.is_estimated = true;

-- Borrado (descomentar para correr):
-- delete from public.portfolio_performance pp
--  using public.portfolios p
--  where p.id = pp.portfolio_id
--    and p.slug = 'inverse-cramer-compras'
--    and pp.is_estimated = true;
