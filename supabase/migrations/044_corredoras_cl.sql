-- ============================================================
-- Migration 044 (F23): carteras recomendadas BICE y MBI (Chile).
--
-- Solo las filas de `portfolios`. Los holdings los carga la etapa
-- `scrapers/stages/corredoras_cl.py` (adaptadores `bice_cartera` y
-- `mbi_cartera`); aqui no hay holdings semilla.
--
-- Idempotente: la unica escritura es un insert con
-- `on conflict (slug) do update` que toca solo `description` y `source`.
-- Nunca reescribe followers ni return_ytd (los maneja el trigger de
-- follows y el calculo de rendimiento respectivamente).
--
-- Aplicar despues de 021_infoprobidad_agregado.sql (y de la 043 si
-- existe). Independiente de 022-042.
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags, is_active
)
values
  ('bice-acciones-destacadas', 'BICE - Acciones Destacadas',
   'Cartera de acciones destacadas del equipo de research de BICE Inversiones (Chile). Se publica en el PDF publico https://mercadosenlinea.biceinversiones.cl/reportes/cartera-inversiones-bice.pdf, que se reemplaza cada mes en el mismo enlace. Aqui solo se registran nemotecnico, peso y fecha del corte.',
   'broker_cl', 'bice_cartera', 'BICE Inversiones', 'CL', 0, null, false,
   '{chile,bice,acciones}', true),

  ('mbi-acciones-recomendadas', 'MBI - Acciones Recomendadas',
   'Cartera de acciones recomendadas de MBI Corredores de Bolsa (Chile). El informe mensual se publica en PDF dentro de https://corredores.mbi.cl/publicaciones (nota "Cartera Recomendada"); la URL del PDF cambia cada mes, por eso se enlaza el listado publico. Aqui solo se registran nemotecnico, peso y fecha del corte.',
   'broker_cl', 'mbi_cartera', 'MBI Corredores de Bolsa', 'CL', 0, null, false,
   '{chile,mbi,acciones}', true)
on conflict (slug) do update
  set description = excluded.description,
      source      = excluded.source;
