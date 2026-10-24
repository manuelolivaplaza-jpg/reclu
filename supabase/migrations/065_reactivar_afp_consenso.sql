-- ============================================================
-- Migración 065 — Reactivar afp-consenso-chile con datos reales (D34)
--
-- MODIFICA una fila existente: la 043 lo ocultó (cifras_inventadas) y lo
-- redirigió a afp-modelo-acciones-cl. Aplicar SOLO después de correr
--   python afp_series.py --consenso-holdings
-- (serie real + holdings del Cuadro 14 sumado de las 7 AFP).
-- Se borran los números de demo (return_ytd, followers) en la misma fila.
-- ============================================================

update public.portfolios
   set is_active = true,
       hidden_reason = null,
       replaced_by_slug = null,
       return_ytd = null,
       followers = 0,
       description = 'Acciones chilenas de las 7 AFP sumadas (Cuadro 14 de la Superintendencia de Pensiones, mensual). El peso es la participación de cada emisor en el total de acciones nacionales de los fondos.'
 where slug = 'afp-consenso-chile'
   and exists (
     select 1 from public.portfolio_performance pp
      where pp.portfolio_id = portfolios.id and pp.is_estimated = false
   );
