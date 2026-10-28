-- D39: auditoría de composición (SOLO LECTURA). Correr en el SQL editor.
-- 1) Portafolios con varios snapshots (as_of) en holdings.
select p.slug, count(distinct h.as_of) as snapshots, min(h.as_of) as primero, max(h.as_of) as ultimo
from public.holdings h join public.portfolios p on p.id = h.portfolio_id
group by p.slug having count(distinct h.as_of) > 1
order by snapshots desc;

-- 2) Último snapshot: símbolos repetidos y suma de pesos fuera de 100 ± 0,5.
with ult as (
  select portfolio_id, max(as_of) as as_of from public.holdings group by portfolio_id
), cur as (
  select h.* from public.holdings h join ult u on u.portfolio_id = h.portfolio_id and u.as_of = h.as_of
)
select p.slug, p.is_active,
       count(*) as filas,
       count(distinct upper(trim(c.symbol))) as simbolos,
       count(*) - count(distinct upper(trim(c.symbol))) as duplicados,
       round(sum(c.weight)::numeric, 2) as suma_pesos
from cur c join public.portfolios p on p.id = c.portfolio_id
group by p.slug, p.is_active
having count(*) <> count(distinct upper(trim(c.symbol))) or abs(sum(c.weight) - 100) > 0.5
order by p.slug;
