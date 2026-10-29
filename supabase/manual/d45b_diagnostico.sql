-- D45b: diagnostico SOLO LECTURA de los 3 snapshots del preview d45.
-- Lista filas_nombre y nombres repetidos con simbolo, nombre, peso y tipo.
with obj(slug, as_of) as (values
  ('activistas-13d', date '2026-10-22'),
  ('renaissance-13f', date '2026-08-13'),
  ('bridgewater-13f', date '2026-08-14')
), f as (
  select o.slug, h.as_of, h.id, h.symbol, h.name, h.weight,
         (h.symbol ~ '[a-z ]' or length(h.symbol) > 12) as es_nombre,
         upper(trim(h.name)) as nombre_n
  from obj o join public.portfolios p on p.slug = o.slug
  join public.holdings h on h.portfolio_id = p.id and h.as_of = o.as_of
), rep as (
  select slug, nombre_n, count(*) as n,
         count(*) filter (where es_nombre) as n_nombre,
         count(*) filter (where not es_nombre) as n_ticker
  from f group by slug, nombre_n having count(*) > 1
)
-- 1) Nombres repetidos. tipo: nombre+ticker = doble conteo (se fusiona en d45);
--    solo_tickers = posibles empresas/clases distintas (revisar a mano).
select 'repetido' as seccion, f.slug, f.as_of, f.nombre_n as nombre, f.symbol, f.weight, f.es_nombre,
       case when r.n_nombre > 0 and r.n_ticker > 0 then 'nombre+ticker'
            when r.n_ticker = 0 then 'solo_nombres' else 'solo_tickers' end as tipo,
       exists (select 1 from public.holdings_merged m where m.merged_into = f.id) as tiene_merge_d34,
       f.id
from f join rep r on r.slug = f.slug and r.nombre_n = f.nombre_n
union all
-- 2) Filas con nombre como simbolo que NO tienen ticker hermano (emisor sin resolver).
select 'nombre_sin_ticker', f.slug, f.as_of, f.nombre_n, f.symbol, f.weight, true, 'sin_resolver',
       false, f.id
from f where f.es_nombre and not exists (select 1 from rep r where r.slug = f.slug and r.nombre_n = f.nombre_n)
order by 1, 2, 4, 7, 6 desc;

-- 3) Resumen por snapshot
with obj(slug, as_of) as (values ('activistas-13d', date '2026-10-22'),
  ('renaissance-13f', date '2026-08-13'), ('bridgewater-13f', date '2026-08-14'))
select o.slug, o.as_of, count(*) as filas, round(sum(h.weight), 4) as suma,
       round(sum(h.weight) filter (where h.symbol ~ '[a-z ]' or length(h.symbol) > 12), 4) as peso_filas_nombre,
       count(*) filter (where h.weight = 0.01) as filas_001
from obj o join public.portfolios p on p.slug = o.slug
join public.holdings h on h.portfolio_id = p.id and h.as_of = o.as_of
group by o.slug, o.as_of order by 1;
