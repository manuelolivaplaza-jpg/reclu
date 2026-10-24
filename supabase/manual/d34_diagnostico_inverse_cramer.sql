-- D34: solo lectura. Confirma por qué inverse-cramer-real se ve vacío.
select p.slug, p.is_active, p.replaced_by_slug,
       (select count(*) from public.holdings h where h.portfolio_id = p.id) as holdings,
       (select max(as_of) from public.holdings h where h.portfolio_id = p.id) as ultimo_as_of,
       (select count(*) from public.portfolio_performance pp where pp.portfolio_id = p.id and pp.is_estimated = false) as serie_real,
       (select count(*) from public.portfolio_performance pp where pp.portfolio_id = p.id and pp.is_estimated = true) as serie_estimada
  from public.portfolios p
 where p.slug in ('inverse-cramer', 'inverse-cramer-real', 'inverse-cramer-compras');
