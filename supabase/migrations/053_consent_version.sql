-- ============================================================
-- Migration 053: versión del consentimiento de Mi portafolio (F71)
--
-- El endpoint "Pregunta a la IA" (/api/impact) solo trata la cartera si el
-- usuario aceptó la VERSIÓN ACTUAL del texto de consentimiento (Ley 21.719).
-- `consent_at` dice cuándo aceptó; `consent_version` dice qué texto aceptó.
--
-- La versión vigente vive en `src/lib/portfolio-consent.ts`
-- (`PORTFOLIO_CONSENT_VERSION`). Si ese texto cambia, se sube la versión y
-- los usuarios deben volver a aceptar.
--
-- Backfill: las filas que ya tenían consentimiento se marcan con la versión
-- "2026-10", que es exactamente el texto de F75 que aceptaron. Así nadie
-- pierde su consentimiento por esta migración.
--
-- 100% idempotente: add column if not exists + update condicionado.
-- No corre sola: aplicarla en el SQL Editor. No borra datos.
-- ============================================================

alter table public.user_portfolio_settings
  add column if not exists consent_version text;

comment on column public.user_portfolio_settings.consent_version is
  'Versión del texto de consentimiento aceptada (PORTFOLIO_CONSENT_VERSION). Null si nunca aceptó.';

-- Solo toca filas con consentimiento previo y sin versión registrada.
update public.user_portfolio_settings
   set consent_version = '2026-10'
 where consent_at is not null
   and consent_version is null;

-- ============================================================
-- ROLLBACK (ejecutar solo si se quiere volver al estado anterior):
--
-- alter table public.user_portfolio_settings
--   drop column if exists consent_version;
-- ============================================================
