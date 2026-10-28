-- D39: limpieza OPCIONAL, NO APLICADA. BORRA FILAS de holdings.
-- Deja solo el último as_of de cada portafolio. No hace falta para arreglar
-- la página (eso lo hace la migración 067 + el frontend); solo reduce tamaño.
-- OJO: previous_weight / historia de cambios que lea snapshots viejos se
-- pierde. Revisar el conteo antes del delete; correr dentro de la transacción.
begin;

select p.slug, count(*) as filas_a_borrar
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
where h.as_of < (select max(h2.as_of) from public.holdings h2 where h2.portfolio_id = h.portfolio_id)
group by p.slug order by filas_a_borrar desc;

-- Descomentar tras revisar:
-- delete from public.holdings h
-- where h.as_of < (select max(h2.as_of) from public.holdings h2 where h2.portfolio_id = h.portfolio_id);

rollback; -- cambiar a commit solo con aprobación
