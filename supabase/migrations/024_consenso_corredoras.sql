-- ============================================================
-- Migracion 024 (F24): consenso de corredoras chilenas.
--
-- Crea las carteras recomendadas de BICE y MBI como portafolios
-- `broker_cl` y el portafolio agregado `consenso-corredoras-cl`.
-- El consenso promedia el peso de cada accion entre las corredoras
-- con cartera completa (BICE y MBI). Las carteras parciales (Itau,
-- Credicorp) son solo referencia y no entran al calculo.
--
-- Datos: scrapers/data/v2/F23/carteras_oct_2026.json (corte octubre
-- 2026). Solo nemotecnico, nombre, peso, fecha y moneda. El PDF no se
-- guarda en la base: la URL publica vive en el scraper y en el panel.
--
-- Idempotente: `on conflict` por slug para los portafolios y por
-- (portfolio_id, symbol, as_of) para los holdings. Reejecutar no pisa
-- followers, return_ytd ni filas ya cargadas.
-- Aplicar despues de 021 (y de 044 si existe). Independiente de 022-042.
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags, is_active
)
values
  (
    'bice-cartera-recomendada',
    'BICE - Cartera Recomendada',
    'Cartera de acciones recomendada por el equipo de research de BICE Inversiones (Chile). Se publica en el PDF publico https://mercadosenlinea.biceinversiones.cl/reportes/cartera-inversiones-bice.pdf, que se reemplaza cada mes en el mismo enlace. Aqui solo se registran nemotecnico, peso y fecha del corte.',
    'broker_cl', 'bice_cartera', 'BICE Inversiones', 'CL',
    0, null, false, array['chile', 'bice', 'acciones'], true
  ),
  (
    'mbi-cartera-recomendada',
    'MBI - Cartera Recomendada',
    'Cartera de acciones recomendada por MBI Corredores de Bolsa (Chile). El informe mensual se publica en PDF dentro de https://corredores.mbi.cl/publicaciones (nota "Cartera Recomendada"); la URL del PDF cambia cada mes, por eso se enlaza el listado publico. Aqui solo se registran nemotecnico, peso y fecha del corte.',
    'broker_cl', 'mbi_cartera', 'MBI Corredores de Bolsa', 'CL',
    0, null, false, array['chile', 'mbi', 'acciones'], true
  ),
  (
    'consenso-corredoras-cl',
    'Consenso de Corredoras CL',
    'Peso promedio de cada accion entre las corredoras chilenas con cartera completa (BICE y MBI al corte de octubre 2026). Las carteras parciales (Itau, Credicorp) se muestran solo como referencia y no entran al promedio. Es informacion publica agregada, no una recomendacion de inversion.',
    'broker_cl', 'corredoras_cl', 'reclu (agregado)', 'CL',
    0, null, false, array['chile', 'consenso', 'corredoras'], true
  )
on conflict (slug) do update
  set description = excluded.description,
      source      = excluded.source;

-- ------------------------------------------------------------
-- Holdings semilla: corte 2026-10-05.
-- previous_weight = 0 para que detect-changes marque la primera
-- aparicion como posicion nueva. currency CLP, bolsa BCS.
-- ------------------------------------------------------------
with filas(slug, symbol, name, weight) as (
  values
    -- BICE Inversiones (pesos tal como los publica el PDF).
    ('bice-cartera-recomendada', 'FALABELLA',  'Falabella',          20.00),
    ('bice-cartera-recomendada', 'LTM',        'LATAM Airlines',     20.00),
    ('bice-cartera-recomendada', 'SQM-B',      'SQM-B',              15.00),
    ('bice-cartera-recomendada', 'CHILE',      'Banco de Chile',     15.00),
    ('bice-cartera-recomendada', 'BSANTANDER', 'Banco Santander',    12.50),
    ('bice-cartera-recomendada', 'BCI',        'BCI',                10.00),
    ('bice-cartera-recomendada', 'ENELCHILE',  'Enel Chile',          7.50),

    -- MBI Corredores de Bolsa (reparto igualitario del PDF).
    ('mbi-cartera-recomendada',  'COPEC',      'Copec',              20.00),
    ('mbi-cartera-recomendada',  'ITAUCL',     'Itau Corpbanca',     20.00),
    ('mbi-cartera-recomendada',  'LTM',        'LATAM Airlines',     20.00),
    ('mbi-cartera-recomendada',  'SQM-B',      'SQM-B',              20.00),
    ('mbi-cartera-recomendada',  'CENCOMALLS', 'Cencosud Shopping',  20.00),

    -- Consenso: promedio simple entre BICE y MBI (ambas completas).
    ('consenso-corredoras-cl',   'LTM',        'LATAM Airlines',     20.00),
    ('consenso-corredoras-cl',   'SQM-B',      'SQM-B',              17.50),
    ('consenso-corredoras-cl',   'FALABELLA',  'Falabella',          10.00),
    ('consenso-corredoras-cl',   'COPEC',      'Copec',              10.00),
    ('consenso-corredoras-cl',   'ITAUCL',     'Itau Corpbanca',     10.00),
    ('consenso-corredoras-cl',   'CENCOMALLS', 'Cencosud Shopping',  10.00),
    ('consenso-corredoras-cl',   'CHILE',      'Banco de Chile',      7.50),
    ('consenso-corredoras-cl',   'BSANTANDER', 'Banco Santander',     6.25),
    ('consenso-corredoras-cl',   'BCI',        'BCI',                 5.00),
    ('consenso-corredoras-cl',   'ENELCHILE',  'Enel Chile',          3.75)
)
insert into public.holdings (
  portfolio_id, symbol, name, weight, previous_weight,
  asset_class, exchange, currency, as_of
)
select
  p.id, f.symbol, f.name, f.weight, 0.00,
  'equity', 'BCS', 'CLP', date '2026-10-05'
from filas f
join public.portfolios p on p.slug = f.slug
on conflict (portfolio_id, symbol, as_of) do nothing;
