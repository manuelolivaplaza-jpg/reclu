-- 043_ocultar_demos_down.sql
--
-- REVERSION de 043_ocultar_demos.sql. NO se aplica en el flujo normal: existe
-- solo para deshacer el ocultamiento si Manu lo pide.
--
-- Vuelve a activar los 4 portafolios ocultos y limpia los metadatos de
-- reemplazo. Las columnas `replaced_by_slug` y `hidden_reason` se dejan
-- (no molestan; borrarlas es una operacion aparte si algun dia se quiere).
--
-- Idempotente y re-ejecutable.

update public.portfolios
   set is_active = true,
       replaced_by_slug = null,
       hidden_reason = null
 where slug in (
   'elon-doge-tracker',
   'trump-truth-signals',
   'afp-consenso-chile',
   'inverse-cramer'
 );
