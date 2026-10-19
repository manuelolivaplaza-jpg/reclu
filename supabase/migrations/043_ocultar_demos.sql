-- 043_ocultar_demos.sql
--
-- Oculta (SIN borrar) los portafolios con cifras inventadas y apunta su slug
-- hacia el portafolio real que los reemplaza. No toca holdings ni alerts.
--
-- Idempotente y re-ejecutable. La reversion vive en
-- `043_ocultar_demos_down.sql` (NO se aplica en el flujo normal).
--
-- Decision de Manu (D43):
--   elon-doge-tracker    -> musk-dice              (F11, 017) siempre
--   trump-truth-signals  -> trump-dice             (F8, 014)  siempre
--   afp-consenso-chile   -> afp-modelo-acciones-cl (F14, 020) siempre
--   inverse-cramer       -> inverse-cramer-real    (F12, 018) solo si la real
--                                                              existe y está activa

alter table public.portfolios add column if not exists replaced_by_slug text;
alter table public.portfolios add column if not exists hidden_reason text;

-- Los tres reemplazos garantizados por migraciones previas (017, 014, 020).
update public.portfolios
   set is_active = false,
       hidden_reason = 'cifras_inventadas',
       replaced_by_slug = 'musk-dice'
 where slug = 'elon-doge-tracker';

update public.portfolios
   set is_active = false,
       hidden_reason = 'cifras_inventadas',
       replaced_by_slug = 'trump-dice'
 where slug = 'trump-truth-signals';

update public.portfolios
   set is_active = false,
       hidden_reason = 'cifras_inventadas',
       replaced_by_slug = 'afp-modelo-acciones-cl'
 where slug = 'afp-consenso-chile';

-- inverse-cramer (proxy SQQQ/PSQ): queda oculto siempre; el redirect solo se
-- escribe si existe `inverse-cramer-real` y está activa. Si la real no existe
-- (o está inactiva) se limpia cualquier `replaced_by_slug` previo.
update public.portfolios
   set is_active = false,
       hidden_reason = 'cifras_inventadas'
 where slug = 'inverse-cramer';

update public.portfolios
   set replaced_by_slug = 'inverse-cramer-real'
 where slug = 'inverse-cramer'
   and exists (
     select 1
       from public.portfolios real
      where real.slug = 'inverse-cramer-real'
        and real.is_active = true
   );

update public.portfolios
   set replaced_by_slug = null
 where slug = 'inverse-cramer'
   and not exists (
     select 1
       from public.portfolios real
      where real.slug = 'inverse-cramer-real'
        and real.is_active = true
   );
