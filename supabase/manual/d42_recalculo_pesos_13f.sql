-- OBSOLETO (D43): NO USAR. Reemplazado por d43_recalculo_pesos_13f.sql (paso A restaba de mas en snb/norges y el paso C tocaba ech/radar-ia).
-- ============================================================
-- D42: recálculo de pesos de holdings que suman > 100% (13F y radar-ia).
-- NO APLICADO. Modifica y BORRA filas de holdings (archiva antes en
-- holdings_merged, migración 064). Correr primero la VISTA PREVIA.
--
-- Causa: load_13f hace upsert por (portafolio, símbolo, as_of). Cuando un
-- CUSIP no resolvía, la fila quedó con el NOMBRE del emisor; en una corrida
-- posterior el mismo CUSIP resolvió a ticker y se insertó OTRA fila (mismo
-- as_of) => la misma posición dos veces. Luego el merge de d34 sumó el peso
-- de la fila con nombre en la del ticker (weight + weight) y borró la de
-- nombre => sin duplicados visibles, pero el snapshot suma ~200%.
--
-- Pasos (una transacción):
--   A) deshacer la suma de d34 con holdings_merged: peso = mayor de los dos.
--   B) nombre + ticker que aún conviven en un snapshot: archivar y borrar la
--      fila con nombre (no se suma su peso).
--   C) snapshots que aún suman > 100,5%: escalar a 100 (peso/suma).
--      Los que suman < 100 (caja no informada, top-N) no se tocan.
-- ============================================================

-- ---------- VISTA PREVIA (solo lectura) ----------
with merged as (
  select merged_into, sum((row_data->>'weight')::numeric) as w_sum,
         max((row_data->>'weight')::numeric) as w_max
  from public.holdings_merged group by merged_into
),
paso_a as (
  select h.id, h.portfolio_id, h.as_of, h.symbol, h.name, h.weight as antes,
         case when m.merged_into is not null and h.weight - m.w_sum >= 0
              then greatest(h.weight - m.w_sum, m.w_max) else h.weight end as w
  from public.holdings h left join merged m on m.merged_into = h.id
),
nombre_dup as (
  select a.id from paso_a a
  where (a.symbol ~ '[a-z ]' or length(a.symbol) > 12)
    and exists (select 1 from paso_a b where b.portfolio_id = a.portfolio_id and b.as_of = a.as_of
                and b.id <> a.id and upper(trim(b.name)) = upper(trim(a.name))
                and b.symbol !~ '[a-z ]' and length(b.symbol) <= 12)
),
paso_b as (select * from paso_a where id not in (select id from nombre_dup)),
sumas as (select portfolio_id, as_of, sum(w) as s from paso_b group by portfolio_id, as_of),
ult as (select portfolio_id, max(as_of) as as_of from public.holdings group by portfolio_id)
select p.slug, s.as_of,
       round((select sum(antes) from paso_a x where x.portfolio_id = s.portfolio_id and x.as_of = s.as_of), 2) as suma_hoy,
       (select count(*) from nombre_dup n join paso_a x on x.id = n.id
         where x.portfolio_id = s.portfolio_id and x.as_of = s.as_of) as filas_nombre_a_borrar,
       round(s.s, 2) as suma_tras_a_b,
       case when s.s > 100.5 then 100.00 else round(s.s, 2) end as suma_final
from sumas s
join ult u on u.portfolio_id = s.portfolio_id and u.as_of = s.as_of
join public.portfolios p on p.id = s.portfolio_id
where abs((select sum(antes) from paso_a x where x.portfolio_id = s.portfolio_id and x.as_of = s.as_of) - 100) > 0.5
order by suma_hoy desc;

-- ---------- APLICAR (con aprobación) ----------
begin;

-- A) deshacer la suma de d34
with merged as (
  select merged_into, sum((row_data->>'weight')::numeric) as w_sum,
         max((row_data->>'weight')::numeric) as w_max
  from public.holdings_merged group by merged_into
)
update public.holdings h
set weight = greatest(h.weight - m.w_sum, m.w_max)
from merged m
where h.id = m.merged_into and h.weight - m.w_sum >= 0;

-- B) archivar y borrar filas con nombre que conviven con su ticker
create temp table d42_nombre_dup on commit drop as
select a.id, b.id as into_id, b.symbol as ticker
from public.holdings a
join public.holdings b on b.portfolio_id = a.portfolio_id and b.as_of = a.as_of and b.id <> a.id
 and upper(trim(b.name)) = upper(trim(a.name)) and b.symbol !~ '[a-z ]' and length(b.symbol) <= 12
where (a.symbol ~ '[a-z ]' or length(a.symbol) > 12);

insert into public.holdings_merged (holding_id, merged_into, ticker, row_data)
select distinct on (d.id) h.id, d.into_id, d.ticker, to_jsonb(h)
from d42_nombre_dup d join public.holdings h on h.id = d.id
on conflict (holding_id) do nothing;

update public.holdings b set weight = greatest(b.weight, a.weight)
from d42_nombre_dup d join public.holdings a on a.id = d.id
where b.id = d.into_id;

delete from public.holdings h using d42_nombre_dup d where h.id = d.id;

-- C) escalar a 100 los snapshots que siguen > 100,5
with s as (
  select portfolio_id, as_of, sum(weight) as total
  from public.holdings group by portfolio_id, as_of having sum(weight) > 100.5
)
update public.holdings h
set weight = round(h.weight * 100 / s.total, 4)
from s where h.portfolio_id = s.portfolio_id and h.as_of = s.as_of;

-- Verificación: debería no devolver filas > 100,5
select p.slug, h.as_of, round(sum(h.weight), 2) as suma
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
group by p.slug, h.as_of having sum(h.weight) > 100.5;

rollback; -- cambiar a commit solo con aprobación de Manu
