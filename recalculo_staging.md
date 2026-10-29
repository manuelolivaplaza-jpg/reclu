# D70 · Recálculo de series en STAGING (anrljeolsredtjmvnxja) — NO APLICADO

Aprobado por Manu para staging. Lo aplica Andamio. Producción: no.
Requiere el código de v2/d70 (scrapers/performance.py) desplegado/checkout en el runner.

## 0. Diagnóstico previo (solo lectura, SQL editor de staging)
```sql
-- (2) carteras CL con serie idéntica + qué holdings tienen bolsa/moneda
select p.slug, count(pp.*) puntos, min(pp.date), max(pp.date),
       md5(string_agg(pp.value_pct::text, ',' order by pp.date)) huella
from portfolios p join portfolio_performance pp on pp.portfolio_id = p.id
where p.slug in ('renta4-moderada','renta4-moderada-ampliada','mbi-acciones-recomendadas','infoProbidad-cl')
group by p.slug;
select p.slug, h.symbol, h.exchange, h.currency, h.weight
from holdings h join portfolios p on p.id = h.portfolio_id
where p.slug in ('renta4-moderada','renta4-moderada-ampliada','mbi-acciones-recomendadas','infoProbidad-cl')
order by p.slug, h.weight desc nulls last;

-- (4) saltos diarios > 15 %
with s as (
  select p.slug, pp.date, pp.is_estimated, pp.value_pct,
         lag(pp.value_pct) over (partition by p.id order by pp.date) prev
  from portfolio_performance pp join portfolios p on p.id = pp.portfolio_id)
select slug, date, is_estimated, round(((1+value_pct/100)/(1+prev/100)-1)*100,1) salto_pct
from s where prev is not null and abs((1+value_pct/100)/(1+prev/100)-1) > 0.15
order by slug, date;

-- (5) activos sin serie y por qué (holdings / pesos nulos / reemplazo)
select p.slug, p.category, p.country, p.replaced_by_slug,
       count(h.*) holdings, count(h.weight) con_peso
from portfolios p left join holdings h on h.portfolio_id = p.id
where p.is_active and not exists (select 1 from portfolio_performance pp where pp.portfolio_id = p.id)
group by p.id order by holdings, p.slug;

-- (8) categorías vacías
select slug from portfolios where is_active and category is null order by slug;
```

## 1. Borrados (LISTADOS APARTE — solo filas ESTIMADAS, nunca reales)
Necesario para que la reconstrucción no herede filas estimadas con base vieja.
Primero contar; borrar solo con el sí explícito:
```sql
-- 1a. conteo
select p.slug, count(*) from portfolio_performance pp join portfolios p on p.id = pp.portfolio_id
where pp.is_estimated = true
  and p.slug in ('renta4-moderada','renta4-moderada-ampliada','mbi-acciones-recomendadas','infoProbidad-cl')
group by p.slug;
-- 1b. BORRADO (series proyectadas mal calculadas de las 4 carteras CL)
-- begin;
-- delete from portfolio_performance pp using portfolios p
-- where p.id = pp.portfolio_id and pp.is_estimated = true
--   and p.slug in ('renta4-moderada','renta4-moderada-ampliada','mbi-acciones-recomendadas','infoProbidad-cl');
-- commit;
```
Para los 13F/PIF/Inverse Cramer/Duquesne NO hace falta borrar: el nuevo
`stitch_estimated` reescribe (upsert) el tramo posterior al último punto real
encadenado a ese punto.

## 2. Pipeline (desde scrapers/, con env de STAGING)
```bash
# dry-run no existe en performance.py: probar primero con un slug
python performance.py --slugs renta4-moderada
# (2)+(5) carteras CL y portafolios sin serie
python performance.py --slugs renta4-moderada renta4-moderada-ampliada mbi-acciones-recomendadas infoProbidad-cl larrainvial-top-picks btg-insights trump-compra trump-trades
# (4) 13F reales trimestrales y luego el tramo diario encadenado
python reconstruct_history.py
python performance.py            # todos (encadena después del último punto real)
python event_series.py           # inverse-cramer-*, trump-dice, musk-dice
python compute_returns.py        # recalcula portfolio_metrics
```
Después: revalidar caché (tag `performance`) vía /api/run-pipeline o un deploy.

## 3. Datos (sí de Manu; sin borrados)
```sql
-- (5) duplicados: ocultar la versión "madre" vacía y redirigir (308) al 13F
begin;
update portfolios s set is_active = false, replaced_by_slug = r.slug
from portfolios r
where (s.slug, r.slug) in (('berkshire-hathaway','berkshire-hathaway-13f'),
                           ('pershing-square','pershing-square-13f'),
                           ('tiger-global','tiger-global-13f'),
                           ('coatue-management','coatue-13f'),
                           ('renaissance-institutional','renaissance-13f'),
                           ('appaloosa-lp','appaloosa-13f'),
                           ('tci-fund','tci-13f'))
  and r.is_active
  and exists (select 1 from portfolio_performance pp where pp.portfolio_id = r.id)
  and not exists (select 1 from portfolio_performance pp where pp.portfolio_id = s.id);
commit;
-- OJO: el hero usa berkshire-hathaway; tras esto debe apuntar a berkshire-hathaway-13f
-- (revisar src/lib/hero-featured.ts) o el gráfico seguirá vacío.

-- (8) categorías faltantes (revisar la lista del paso 0 antes):
-- update portfolios set category = 'hedge_fund' where slug in ('icahn-13f','norges-13f') and category is null;
-- update portfolios set category = 'thematic'  where slug in ('copx','radar-ia','ai-world-war','cobre-superciclo','claude-portfolio') and category is null;
```

## 4. Verificación
- Re-correr las consultas del paso 0: las 4 huellas md5 distintas; ningún salto > 15 % en 13F el 14/17-ago ni el 15-oct.
- /portfolio/renta4-moderada y /mbi-acciones-recomendadas con curvas distintas.
- Ranking: Renta 4 Moderada ≠ Ampliada.

## Lo que NO arregla un recálculo
- AFP 1S = 0,0 %: su serie real es MENSUAL (afp_series.py, cuadro 14 SP); no hay
  punto semanal. La UI (d69) debe mostrar "—" en 1S/1M cuando la serie es mensual.
- Egerton: reconstruct_history solo encontró pocos 13F (3 puntos trimestrales). Es dato real; mostrar aviso.
- Logos faltantes (consenso-corredoras-cl, fondos-mutuos-acciones-cl, larrainvial-top-picks): necesitan imagen; no se inventan logos oficiales.
