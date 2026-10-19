-- ============================================================
-- Migración 020 — Carteras AFP (F14)
--
-- Portafolio afp-modelo-acciones-cl: acciones chilenas de AFP Modelo
-- según el Cuadro 14 de la Superintendencia de Pensiones, al 29-05-2026.
-- Fuente (endpoint antiguo, vigente hasta mayo 2026):
--   https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php?fecpro=202605&idu=50&listado=14
--
-- El peso es la participación del emisor en esa cartera de acciones
-- chilenas (MMUS$ / total × 100), no el % del fondo completo.
-- Moneda CLP, asset_class equity, previous_weight = 0 (un emisor nuevo
-- dispara new_trade en detect-changes).
--
-- No se guardan códigos CUSIP (aviso de copyright en la fuente).
-- No se toca afp-consenso-chile: viene de la 006 con seguidores y
-- retorno de demostración. Sigue en el catálogo hasta que el consolidado
-- de todas las AFP se pueda leer de verdad.
--
-- Idempotente: on conflict do nothing por slug y por
-- (portfolio_id, symbol, as_of). Reejecutar no pisa filas ya cargadas.
-- 014 queda para F8 y 015 para F9; si al integrar se renumera, se puede
-- volver a correr.
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
) values (
  'afp-modelo-acciones-cl',
  'AFP Modelo: acciones chilenas',
  'Acciones nacionales de AFP Modelo (Cuadro 14 de la Superintendencia de Pensiones, al 29-05-2026). El peso es la participación de cada emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.',
  'public_disclosure',
  'spensiones',
  'AFP Modelo',
  'CL',
  0,
  null,
  false,
  array['afp', 'pensiones', 'chile', 'ipsa']
)
on conflict (slug) do nothing;

with filas(symbol, name, mmusd) as (
  values
    ('LTM'::text, 'LATAM AIRLINES GROUP S.A.'::text, 318.66::numeric),
    ('SQM-B', 'SOCIEDAD QUIMICA Y MINERA DE CHILE S.A.', 293.8),
    ('BCI', 'BANCO DE CREDITO E INVERSIONES', 205.51),
    ('MALLPLAZA', 'PLAZA S.A.', 204.96),
    ('CENCOSUD', 'CENCOSUD S.A.', 164.86),
    ('CHILE', 'BANCO DE CHILE', 162.43),
    ('BSANTANDER', 'BANCO SANTANDER CHILE', 147.1),
    ('CENCOMALLS', 'CENCOSUD SHOPPING SA', 106.43),
    ('FALABELLA', 'FALABELLA S.A.', 98.76),
    ('COPEC', 'EMPRESAS COPEC S.A.', 93.39),
    ('PARAUCO', 'PARQUE ARAUCO S.A.', 72.97),
    ('ENELCHILE', 'ENEL CHILE S.A.', 50.92),
    ('COLBUN', 'COLBUN S.A.', 48.81),
    ('ENELAM', 'ENEL AMERICAS S.A.', 31.95),
    ('SK', 'SIGDO KOPPERS S.A.', 30.52),
    ('ECL', 'ENGIE ENERGIA CHILE S.A.', 29.98),
    ('AGUAS-A', 'AGUAS ANDINAS S.A.', 27.67),
    ('SMU', 'SMU S.A.', 24.25),
    ('CMPC', 'EMPRESAS CMPC S.A.', 22.95),
    ('ANDINA-B', 'EMBOTELLADORA ANDINA S.A.', 21.28),
    ('ANDINA-A', 'EMBOTELLADORA ANDINA S.A.', 17.71),
    ('EMBONOR-B', 'COCA-COLA EMBONOR S.A.', 14.85),
    ('BESALCO', 'BESALCO S.A.', 14.42),
    ('SMSAAM', 'SOCIEDAD MATRIZ SAAM S.A.', 14.27),
    ('RIPLEY', 'RIPLEY CORP S.A.', 13.15),
    ('ENTEL', 'EMPRESA NACIONAL DE TELECOMUNICACIONES S.A.', 12.62),
    ('FORUS', 'FORUS S.A.', 9.84),
    ('CONCHATORO', 'VINA CONCHA Y TORO S.A.', 7.34),
    ('QUINENCO', 'QUINENCO S.A.', 5.53),
    ('ANTARCHILE', 'ANTARCHILE S.A.', 3.84),
    ('ALMENDRAL', 'ALMENDRAL S.A.', 3.71),
    ('INGEVEC', 'INGEVEC S.A.', 1.81),
    ('CAMANCHACA', 'CAMANCHACA S.A.', 1.36),
    ('MULTI X', 'MULTIEXPORT FOODS S.A.', 1.23),
    ('PAZ', 'PAZ CORP S.A.', 1.22),
    ('MOLLER', 'EMPRESA CONSTRUCTORA MOLLER Y PEREZ-COTAPOS S.A.', 1.13),
    ('TRICOT', 'EMPRESAS TRICOT SA', 0.93),
    ('INDISA', 'INSTITUTO DE DIAGNOSTICO S.A.', 0.9),
    ('SOQUICOM', 'SOQUIMICH COMERCIAL S.A', 0.64),
    ('SALMOCAM', 'SALMONES CAMANCHA SA', 0.51),
    ('WATTS', 'WATTS S.A.', 0.31),
    ('CINTAC', 'CINTAC S.A.', 0.07)
),
tot as (
  select sum(mmusd) as total from filas
)
insert into public.holdings (
  portfolio_id, symbol, name, weight, previous_weight,
  asset_class, exchange, currency, as_of
)
select
  p.id,
  f.symbol,
  f.name,
  round((f.mmusd / tot.total) * 100, 2),
  0,
  'equity',
  'BCS',
  'CLP',
  date '2026-05-29'
from public.portfolios p
cross join filas f
cross join tot
where p.slug = 'afp-modelo-acciones-cl'
  and tot.total > 0
on conflict (portfolio_id, symbol, as_of) do nothing;
