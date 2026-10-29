-- D45 (v2, D45b): snapshots de 13F/13D fuera de 100 +- 0,5 despues de d43.
-- Dos causas (preview de Andamio en staging):
--  1) doble conteo nombre+ticker en *-13f (renaissance 36, bridgewater 8
--     nombres repetidos): filas con el nombre del emisor como simbolo que
--     conviven con la fila con ticker del mismo emisor. Se fusionan quedandose
--     con el ticker (peso = el mayor, como d42/d43), archivando en holdings_merged.
--  2) redondeo fila a fila a 2 decimales (557 / 264 filas en 0,01; activistas
--     617 x 0,16 = 98,72). Se normaliza a 100.
-- activistas-13d: sus 3 nombres repetidos son filas con ticker distinto
-- (posibles empresas o clases distintas): NO se fusionan, solo se normaliza.
-- Correr antes d45b_diagnostico.sql. NO toca ech, ARK, hero ni lo que no sea
-- *-13f / activistas-13d.

-- ---------- VISTA PREVIA (solo lectura) ----------
with f as (
  select p.slug, h.portfolio_id, h.as_of, h.id, h.symbol, h.weight, upper(trim(h.name)) as nombre_n,
         (h.symbol ~ '[a-z ]' or length(h.symbol) > 12) as es_nombre
  from public.holdings h join public.portfolios p on p.id = h.portfolio_id
  where p.slug like '%-13f' or p.slug = 'activistas-13d'
), dup as (  -- fila con nombre que tiene ticker hermano (solo 13F)
  select distinct on (a.id) a.id, a.portfolio_id, a.as_of, a.weight as w_nombre, b.id as into_id, b.weight as w_ticker
  from f a join f b on b.portfolio_id = a.portfolio_id and b.as_of = a.as_of and b.id <> a.id
   and b.nombre_n = a.nombre_n and not b.es_nombre
  where a.es_nombre and a.slug like '%-13f'
  order by a.id, b.weight desc
), s as (
  select f.slug, f.portfolio_id, f.as_of, count(*) as filas, sum(f.weight) as suma,
         (select count(*) from dup d where d.portfolio_id = f.portfolio_id and d.as_of = f.as_of) as fusionar,
         (select coalesce(sum(least(d.w_nombre, d.w_ticker)), 0) from dup d
           where d.portfolio_id = f.portfolio_id and d.as_of = f.as_of) as peso_quitado
  from f group by f.slug, f.portfolio_id, f.as_of
)
select slug, as_of, filas, round(suma, 2) as suma_hoy, fusionar, round(peso_quitado, 2) as peso_doble,
       round(suma - peso_quitado, 2) as suma_tras_fusion, 100.00 as suma_final
from s where abs(suma - 100) > 0.5 or fusionar > 0 order by abs(suma - 100) desc;

-- ---------- APLICAR (con aprobacion; por defecto rollback) ----------
begin;

-- 1) fusionar nombre -> ticker (solo *-13f)
create temp table d45_dup on commit drop as
select distinct on (a.id) a.id, b.id as into_id, b.symbol as ticker, a.weight as w_nombre
from public.holdings a
join public.portfolios p on p.id = a.portfolio_id and p.slug like '%-13f'
join public.holdings b on b.portfolio_id = a.portfolio_id and b.as_of = a.as_of and b.id <> a.id
 and upper(trim(b.name)) = upper(trim(a.name)) and b.symbol !~ '[a-z ]' and length(b.symbol) <= 12
where (a.symbol ~ '[a-z ]' or length(a.symbol) > 12)
order by a.id, b.weight desc;

insert into public.holdings_merged (holding_id, merged_into, ticker, row_data)
select h.id, d.into_id, d.ticker, to_jsonb(h)
from d45_dup d join public.holdings h on h.id = d.id
on conflict (holding_id) do nothing;

update public.holdings h set weight = greatest(h.weight, x.w)
from (select into_id, max(w_nombre) as w from d45_dup group by into_id) x
where h.id = x.into_id;

delete from public.holdings h using d45_dup d where h.id = d.id;

-- 2) normalizar a 100 los snapshots que sigan fuera de 100 +- 0,5
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

-- Verificacion: ambas deberian devolver 0 filas
select p.slug, h.as_of, round(sum(h.weight), 4) as suma
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
join d45_obj o on o.portfolio_id = h.portfolio_id and o.as_of = h.as_of
group by p.slug, h.as_of having abs(sum(h.weight) - 100) > 0.0001;

select a.id, a.symbol from public.holdings a
join public.portfolios p on p.id = a.portfolio_id and p.slug like '%-13f'
join public.holdings b on b.portfolio_id = a.portfolio_id and b.as_of = a.as_of and b.id <> a.id
 and upper(trim(b.name)) = upper(trim(a.name)) and b.symbol !~ '[a-z ]' and length(b.symbol) <= 12
where (a.symbol ~ '[a-z ]' or length(a.symbol) > 12);

rollback;  -- cambiar a commit solo con aprobacion de Manu
-- Restaurar una fila fusionada: insert into public.holdings select (jsonb_populate_record(null::public.holdings, row_data)).*
--   from public.holdings_merged where holding_id = '<id>';
