-- ============================================================
-- Migración 062 — Carteras de acciones de las otras 6 AFP (D32)
--
-- Solo crea los portafolios; las holdings las carga scrapers/afp_carteras.py
-- desde el Cuadro 14 oficial (idu verificados 2026-10-23, último mes 202605):
--   https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php?fecpro=202605&idu=N&listado=14
-- AFP Modelo ya existe (020, afp-modelo-acciones-cl).
-- Idempotente: on conflict (slug) do nothing. No borra ni actualiza nada.
-- ============================================================

insert into public.portfolios (
  slug, name, description, category, source, manager, country,
  followers, return_ytd, premium, tags
) values
  ('afp-capital-acciones-cl', 'AFP Capital: acciones chilenas',
   'Acciones nacionales de AFP Capital según el Cuadro 14 de la Superintendencia de Pensiones. El peso es la participación de cada emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.',
   'public_disclosure', 'spensiones', 'AFP Capital', 'CL', 0, null, false,
   array['afp', 'pensiones', 'chile', 'ipsa']),
  ('afp-cuprum-acciones-cl', 'AFP Cuprum: acciones chilenas',
   'Acciones nacionales de AFP Cuprum según el Cuadro 14 de la Superintendencia de Pensiones. El peso es la participación de cada emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.',
   'public_disclosure', 'spensiones', 'AFP Cuprum', 'CL', 0, null, false,
   array['afp', 'pensiones', 'chile', 'ipsa']),
  ('afp-habitat-acciones-cl', 'AFP Habitat: acciones chilenas',
   'Acciones nacionales de AFP Habitat según el Cuadro 14 de la Superintendencia de Pensiones. El peso es la participación de cada emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.',
   'public_disclosure', 'spensiones', 'AFP Habitat', 'CL', 0, null, false,
   array['afp', 'pensiones', 'chile', 'ipsa']),
  ('afp-planvital-acciones-cl', 'AFP PlanVital: acciones chilenas',
   'Acciones nacionales de AFP PlanVital según el Cuadro 14 de la Superintendencia de Pensiones. El peso es la participación de cada emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.',
   'public_disclosure', 'spensiones', 'AFP PlanVital', 'CL', 0, null, false,
   array['afp', 'pensiones', 'chile', 'ipsa']),
  ('afp-provida-acciones-cl', 'AFP Provida: acciones chilenas',
   'Acciones nacionales de AFP Provida según el Cuadro 14 de la Superintendencia de Pensiones. El peso es la participación de cada emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.',
   'public_disclosure', 'spensiones', 'AFP Provida', 'CL', 0, null, false,
   array['afp', 'pensiones', 'chile', 'ipsa']),
  ('afp-uno-acciones-cl', 'AFP UNO: acciones chilenas',
   'Acciones nacionales de AFP UNO según el Cuadro 14 de la Superintendencia de Pensiones. El peso es la participación de cada emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.',
   'public_disclosure', 'spensiones', 'AFP UNO', 'CL', 0, null, false,
   array['afp', 'pensiones', 'chile', 'ipsa'])
on conflict (slug) do nothing;
