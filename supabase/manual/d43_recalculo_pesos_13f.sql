-- ============================================================
-- D43: recálculo de pesos 13F (reemplaza d42_recalculo_pesos_13f.sql).
-- NO APLICADO. Modifica y BORRA filas de holdings (archiva antes en
-- holdings_merged, migración 064). Correr primero la VISTA PREVIA.
--
-- Cambios respecto de d42 (la vista previa de d42 dejó snb-13f en 63,10 y
-- norges-bank-13f en 56,56):
--   * Alcance: solo slugs '%-13f'. radar-ia y ech quedan FUERA (no son 13F;
--     radar-ia suma 200 porque dos escrituras distintas quedaron en el mismo
--     as_of 2026-10-22, ver informe d43; se arregla re-corriendo radar_ia.py
--     con el código nuevo, que borra las filas viejas del snapshot).
--   * Solo snapshots que hoy suman > 100,5.
--   * Paso A (deshacer la suma de d34 con holdings_merged) se usa SOLO si
--     deja el snapshot en >= 99,5. Si resta de más (snb, norges: hay
--     entradas de holdings_merged que no estaban sumadas en esa fila), se
--     omite y se escala.
--   * Paso C: todo snapshot objetivo que no quede en 100 ± 0,5 se escala a
--     100 (peso / suma). Resultado garantizado: 100 ± 0,5 en cada uno.
-- ============================================================

-- ---------- VISTA PREVIA (solo lectura) ----------
with obj as (
  select h.portfolio_id, h.as_of, p.slug, sum(h.weight) as suma_hoy
  from public.holdings h join public.portfolios p on p.id = h.portfolio_id
  where p.slug like '%-13f'
  group by h.portfolio_id, h.as_of, p.slug
  having sum(h.weight) > 100.5
),
filas as (
  select h.* from public.holdings h join obj o on o.portfolio_id = h.portfolio_id and o.as_of = h.as_of
),
nombre_dup as (   -- paso B: fila con nombre de emisor cuyo ticker ya está en el snapshot
  select a.id from filas a
  where (a.symbol ~ '[a-z ]' or length(a.symbol) > 12)
    and exists (select 1 from filas b where b.portfolio_id = a.portfolio_id and b.as_of = a.as_of and b.id <> a.id
                and upper(trim(b.name)) = upper(trim(a.name)) and b.symbol !~ '[a-z ]' and length(b.symbol) <= 12)
),
merged as (
  select merged_into, sum((row_data->>'weight')::numeric) as w_sum, max((row_data->>'weight')::numeric) as w_max
  from public.holdings_merged group by merged_into
),
calc as (
  select f.id, f.portfolio_id, f.as_of, f.symbol, f.weight as w_b,
         case when m.merged_into is not null and f.weight - m.w_sum >= 0
              then greatest(f.weight - m.w_sum, m.w_max) else f.weight end as w_ab
  from filas f left join merged m on m.merged_into = f.id
  where f.id not in (select id from nombre_dup)
),
snap as (
  select o.slug, o.portfolio_id, o.as_of, o.suma_hoy,
         (select count(*) from nombre_dup n join filas f on f.id = n.id
           where f.portfolio_id = o.portfolio_id and f.as_of = o.as_of) as filas_b,
         sum(c.w_b) as suma_b, sum(c.w_ab) as suma_ab
  from obj o join calc c on c.portfolio_id = o.portfolio_id and c.as_of = o.as_of
  group by o.slug, o.portfolio_id, o.as_of, o.suma_hoy
)
select slug, as_of, round(suma_hoy, 2) as suma_hoy, filas_b as filas_nombre_a_borrar,
       round(suma_b, 2) as suma_tras_b, round(suma_ab, 2) as suma_tras_a_b,
       (suma_ab >= 99.5) as usa_paso_a,
       case when suma_ab >= 99.5 then suma_ab else suma_b end as base,
       case when abs((case when suma_ab >= 99.5 then suma_ab else suma_b end) - 100) <= 0.5
            then round(case when suma_ab >= 99.5 then suma_ab else suma_b end, 2) else 100.00 end as suma_final
from snap order by suma_hoy desc;

-- ---------- APLICAR (con aprobación) ----------
begin;

create temp table d43_obj on commit drop as
select h.portfolio_id, h.as_of
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
where p.slug like '%-13f'
group by h.portfolio_id, h.as_of
having sum(h.weight) > 100.5;

-- B) filas con nombre que conviven con su ticker: archivar y borrar (sin sumar peso)
create temp table d43_nombre on commit drop as
select distinct on (a.id) a.id, b.id as into_id, b.symbol as ticker
from public.holdings a
join d43_obj o on o.portfolio_id = a.portfolio_id and o.as_of = a.as_of
join public.holdings b on b.portfolio_id = a.portfolio_id and b.as_of = a.as_of and b.id <> a.id
 and upper(trim(b.name)) = upper(trim(a.name)) and b.symbol !~ '[a-z ]' and length(b.symbol) <= 12
where (a.symbol ~ '[a-z ]' or length(a.symbol) > 12);

insert into public.holdings_merged (holding_id, merged_into, ticker, row_data)
select h.id, d.into_id, d.ticker, to_jsonb(h)
from d43_nombre d join public.holdings h on h.id = d.id
on conflict (holding_id) do nothing;

delete from public.holdings h using d43_nombre d where h.id = d.id;

-- A) deshacer la suma de d34 solo en snapshots donde no resta de más
create temp table d43_a on commit drop as
with merged as (
  select merged_into, sum((row_data->>'weight')::numeric) as w_sum, max((row_data->>'weight')::numeric) as w_max
  from public.holdings_merged where holding_id not in (select id from d43_nombre)
  group by merged_into
)
select h.id, h.portfolio_id, h.as_of,
       case when m.merged_into is not null and h.weight - m.w_sum >= 0
            then greatest(h.weight - m.w_sum, m.w_max) else h.weight end as w_ab
from public.holdings h
join d43_obj o on o.portfolio_id = h.portfolio_id and o.as_of = h.as_of
left join merged m on m.merged_into = h.id;

update public.holdings h set weight = a.w_ab
from d43_a a
where h.id = a.id and h.weight <> a.w_ab
  and (select sum(x.w_ab) from d43_a x where x.portfolio_id = a.portfolio_id and x.as_of = a.as_of) >= 99.5;

-- C) escalar a 100 lo que siga fuera de 100 ± 0,5 (solo snapshots objetivo)
with s as (
  select h.portfolio_id, h.as_of, sum(h.weight) as total
  from public.holdings h join d43_obj o on o.portfolio_id = h.portfolio_id and o.as_of = h.as_of
  group by h.portfolio_id, h.as_of
  having abs(sum(h.weight) - 100) > 0.5 and sum(h.weight) > 0
)
update public.holdings h
set weight = round(h.weight * 100 / s.total, 4)
from s where h.portfolio_id = s.portfolio_id and h.as_of = s.as_of;

-- Verificación: no debería devolver filas
select p.slug, h.as_of, round(sum(h.weight), 2) as suma
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
join d43_obj o on o.portfolio_id = h.portfolio_id and o.as_of = h.as_of
group by p.slug, h.as_of having abs(sum(h.weight) - 100) > 0.5;

rollback; -- cambiar a commit solo con aprobación de Manu
