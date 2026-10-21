# NOTAS F75 — consentimiento, borrar cartera y textos legales

Rama `v2/f75-privacidad-portafolio` (desde `mejoras/integracion`). Sin push.
Todo el código nuevo queda detrás de `MY_PORTFOLIO_ENABLED=true` (exacto).

## Hecho

### Consentimiento explícito
- `src/lib/portfolio-consent.ts` (puro, testeable):
  - `portfolioConsentParagraphs(model)`: finalidad, datos sensibles (Ley 21.719),
    minimización (nunca montos, cantidades, nombre, correo ni identidad a la IA),
    transferencia internacional (OpenRouter + modelo fuera de Chile) y derecho a borrar.
  - `isPortfolioConsentChecked`, `isDeleteConfirmationValid` (BORRAR exacto),
    `formatConsentDate` (UTC, estable para hidratación).
  - `validatePortfolioAlertSettings`: respeta `autoAlerts` por plan, canales
    (`alertChannels`) y exige consentimiento para encender alertas.
  - `portfolioAlertChannelsFor`: email siempre; telegram/both solo si el plan los permite.
- `src/app/actions/portfolio-consent.ts` (cliente de sesión, RLS):
  - `grantPortfolioConsent`: exige checkbox marcado y hace upsert de
    `consent_at = now()` en `user_portfolio_settings`.
  - `withdrawPortfolioConsent`: deja `consent_at = null` y `auto_alerts = false`.
  - `deleteMyPortfolio`: exige `BORRAR`, llama `supabase.rpc("delete_my_portfolio")`.
  - `updatePortfolioAlerts`: guarda `auto_alerts`, `min_relevance` y `alert_channel`.
  - Todas devuelven `FormState` y fallan con mensaje en español si el flag está apagado,
  no hay sesión o Supabase falla.
- `src/components/portfolio-consent.tsx`: checkbox **sin marcar** por defecto,
  botón deshabilitado hasta marcarlo, enlace a `/privacidad` y botón para retirar
  el consentimiento cuando ya existe.

### Ajustes
- `src/components/portfolio-alert-settings.tsx`: interruptor de alertas
  automáticas (parte apagado porque `auto_alerts` default false), umbral
  (30/50/70 %), canal y aviso del plan. Deshabilitado si el plan no incluye
  alertas (`autoAlerts === "none"`) o falta consentimiento.
- `src/components/delete-portfolio-form.tsx`: confirmación escribiendo `BORRAR`;
  el botón se habilita solo con el texto exacto. Aclara que no borra la cuenta,
  follows ni reglas.
- `src/app/(dashboard)/settings/page.tsx`: lee `user_portfolio_settings` solo con
  el flag y monta las tres tarjetas (consentimiento, alertas y borrado).

### Textos legales
- `src/app/privacidad/page.tsx`: secciones nuevas **Mi portafolio** e **IA**, cada
  una con `DraftLegalNotice` visible («Borrador — pendiente revisión de abogado»,
  Ley 21.719 y Ley Fintec 21.521). La sección IA usa `AI_DISCLAIMER` de
  `src/lib/advice-filter.ts`.
- `src/app/disclaimer/page.tsx`: mismas secciones y marcador de borrador; la IA
  usa el mismo `AI_DISCLAIMER`.
- `src/components/legal/draft-legal-notice.tsx`: marcador reutilizable.

### Tests
- `tests/portfolio-consent.test.ts` (20 tests): texto, confirmación, validación
  por plan, consentimiento (checkbox vacío no escribe, marcado guarda
  `consent_at`), flag apagado, retiro (`consent_at = null` y alerts off),
  borrado con confirmación inválida (no llama RPC), válida (llama RPC) y error
  de RPC. También cubre guardar preferencias de alertas.

## Verificación
- `npx vitest run --maxWorkers=1 tests/portfolio-consent.test.ts` → 20/20.
- `npm test -- --maxWorkers=1` → 67 archivos, 815 tests, todos pasan.
- `npm run lint` → OK.
- `npm run typecheck` → solo el error conocido de Next 16
  `src/app/layout.tsx: Cannot find name 'LayoutProps'` (tipo global generado en
  build; `tsc` aislado lo marca, el `next build` real pasa). No hay errores en
  los archivos de F75.

## Pendiente / notas
- **Revisión de abogado obligatoria** antes de encender el flag: los textos están
  marcados como BORRADOR. Revisar especialmente el encuadre de Ley Fintec
  21.521 (analizar la cartera del usuario se acerca a asesoría personalizada) y
  la transferencia internacional de la Ley 21.719.
- La migración `050_mi_portafolio.sql` debe estar aplicada (tabla
  `user_portfolio_settings` y RPC `delete_my_portfolio`). Sin ella la página de
  Ajustes sigue funcionando (warning en logs), pero guardar/borrar falla con
  mensaje genérico.
- No había datos en `scrapers/data/v2/F75/` (la carpeta no existe en este
  worktree); no se necesitaron.
- No se tocó Supabase real, ni `.env`, ni se levantó `next dev`/`next build`.
- `scrapers/data/v2/F27..F36` aparecen como untracked de otras tareas; no se
  tocaron ni se commitearon.

## Cómo probar
1. Aplicar la migración 050 en un entorno de prueba (no producción).
2. `MY_PORTFOLIO_ENABLED=true` en el entorno local.
3. Entrar a `/settings` con sesión: debe aparecer la tarjeta de consentimiento
   con el checkbox vacío y el botón deshabilitado.
4. Marcar y guardar: se escribe `consent_at`; el botón «Retirar consentimiento»
   lo deja en null.
5. Con plan Gratis el interruptor de alertas queda deshabilitado; con Pro/Elite y
   consentimiento se puede activar, elegir umbral y canal.
6. Escribir algo distinto de `BORRAR` no habilita el borrado; con `BORRAR` se
   ejecuta la RPC.
7. `/privacidad` y `/disclaimer` muestran las secciones Mi portafolio e IA con el
   aviso de borrador.

## Actualización F75B — versión del consentimiento y retiro con borrado

Ver `NOTAS-F75B.md` para el detalle. Resumen: `user_portfolio_settings.consent_version`
(obligatoria cuando hay `consent_at`), texto de la §2.5 con
`PORTFOLIO_CONSENT_VERSION = "2026-10-20.v1"`, bloqueo de `saveUserHoldings` e
`importHoldings` si falta consentimiento o la versión quedó atrás, y retiro que
llama a `delete_my_portfolio()` y deja ambas columnas en null. La casilla sigue
sin marcar por defecto. Tests: 854/854, lint OK, typecheck solo con el error
conocido de `LayoutProps`.
