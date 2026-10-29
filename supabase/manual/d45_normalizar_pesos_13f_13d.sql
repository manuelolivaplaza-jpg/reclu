-- D45: snapshots de 13F/13D que siguen fuera de 100 +- 0,5 despues de d43.
-- Causa: sec13f.py y activists_13d.py redondeaban cada fila a 2 decimales
-- (renaissance-13f 2934 filas -> 101,26; bridgewater-13f 998 -> 100,97;
-- activistas-13d 617 x 0,16 -> 98,72). El codigo ya reparte el resto (D45);
-- esto corrige los datos guardados. NO toca ech, ARK, hero ni nada que no
-- sea *-13f / activistas-13d (ahi la diferencia es real: caja, derivados).

-- ---------- VISTA PREVIA (solo lectura) ----------
with s as (
  select p.slug, h.portfolio_id, h.as_of, count(*) as filas, sum(h.weight) as suma,
         count(*) filter (where h.weight = 0.01) as filas_001,
         count(*) filter (where h.symbol ~ '[a-z ]' or length(h.symbol) > 12) as filas_nombre,
         count(*) - count(distinct upper(trim(h.name))) as nombres_repetidos
  from public.holdings h join public.portfolios p on p.id = h.portfolio_id
  where p.slug like '%-13f' or p.slug = 'activistas-13d'
  group by p.slug, h.portfolio_id, h.as_of
)
select slug, as_of, filas, round(suma, 2) as suma_hoy, filas_001, filas_nombre, nombres_repetidos,
       100.00 as suma_final
from s where abs(suma - 100) > 0.5 order by abs(suma - 100) desc;
-- Esperado: bridgewater-13f 2026-08-14 100,97; renaissance-13f 2026-08-13 101,26;
-- activistas-13d 98,72. Si filas_nombre o nombres_repetidos > 0, avisar antes
-- de aplicar (seria doble conteo, no redondeo).

-- ---------- APLICAR (con aprobacion; por defecto rollback) ----------
begin;

create temp table d45_obj on commit drop as
select h.portfolio_id, h.as_of, sum(h.weight) as total
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
where (p.slug like '%-13f' or p.slug = 'activistas-13d')
group by h.portfolio_id, h.as_of
having abs(sum(h.weight) - 100) > 0.5 and sum(h.weight) > 0;

update public.holdings h set weight = round(h.weight * 100 / o.total, 4)
from d45_obj o where h.portfolio_id = o.portfolio_id and h.as_of = o.as_of;

-- el residuo de redondeo (< 0,01) va a la fila mas grande de cada snapshot
with r as (
  select o.portfolio_id, o.as_of, 100 - sum(h.weight) as resto
  from public.holdings h join d45_obj o on o.portfolio_id = h.portfolio_id and o.as_of = h.as_of
  group by o.portfolio_id, o.as_of
), top as (
  select distinct on (h.portfolio_id, h.as_of) h.id, r.resto
  from public.holdings h join r on r.portfolio_id = h.portfolio_id and r.as_of = h.as_of
  order by h.portfolio_id, h.as_of, h.weight desc, h.id
)
update public.holdings h set weight = h.weight + t.resto from top t where h.id = t.id;

-- Verificacion: no deberia devolver filas
select p.slug, h.as_of, round(sum(h.weight), 4) as suma
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
join d45_obj o on o.portfolio_id = h.portfolio_id and o.as_of = h.as_of
group by p.slug, h.as_of having abs(sum(h.weight) - 100) > 0.0001;

rollback;  -- cambiar a commit solo con aprobacion de Manu
