# NOTAS F75B — consentimiento con versión, bloqueo y retiro con borrado

Rama `v2/f75b-consentimiento-version` (desde `mejoras/integracion`). Sin push,
sin Supabase real y sin `next build`/`next dev`.

## Hecho

### Migración 050 (editable: nunca se aplicó)
- `user_portfolio_settings.consent_version text` en el `create table` y
  `add column if not exists` para bases que ya tenían la tabla.
- Constraint idempotente `user_portfolio_settings_consent_version_check`:
  `check (consent_at is null or consent_version is not null)`. No se puede
  acreditar un consentimiento sin la versión del texto aceptado.
- Rollback comentado incluye el constraint y la columna.
- `scrapers/tests/test_migracion_050.py`: 9 tests (incluye la regla nueva).

### Texto y versión
- `src/lib/portfolio-consent.ts`:
  - `PORTFOLIO_CONSENT_VERSION = "2026-10-20.v1"`.
  - `portfolioConsentParagraphs()` usa el texto de la §2.5 del informe legal
    (finalidad, datos sensibles, OpenRouter/proveedor en EE.UU., solo pesos
    porcentuales sin nombre/correo/montos, no asesoría, retiro con borrado y
    versión del texto).
  - `portfolioConsentStatus()` / `hasCurrentPortfolioConsent()` distinguen
    `none`, `current` y `outdated`.
  - Mensajes en español: `PORTFOLIO_CONSENT_REQUIRED_MESSAGE` y
    `PORTFOLIO_CONSENT_OUTDATED_MESSAGE`.
- `grantPortfolioConsent` guarda `consent_at` y `consent_version` juntos.

### Bloqueo en servidor
- `src/app/actions/holdings.ts`: helper `portfolioConsentError()` compartido.
  - `saveUserHoldings` bloquea si no hay `consent_at` o si la versión no es la
    vigente.
  - `importHoldings` aplica el mismo bloqueo antes de borrar/insertar.
  - Con `MY_PORTFOLIO_ENABLED !== "true"` no se consulta ni se bloquea.

### Retiro = borrado
- `withdrawPortfolioConsent` llama a `delete_my_portfolio()` (borra tenencias y
  ajustes) y recrea los ajustes con `consent_at = null`,
  `consent_version = null` y `auto_alerts = false`.
- `src/components/portfolio-consent.tsx`: avisa que retirar borra la cartera y
  pide confirmación con `window.confirm` antes de ejecutar. El checkbox sigue
  partiendo sin marcar. Si la versión guardada es vieja, muestra el formulario
  con el aviso de aceptar de nuevo.
- `src/app/(dashboard)/settings/page.tsx` lee `consent_version`, lo pasa a la
  tarjeta y calcula `hasConsent` solo con la versión vigente.

### Alertas y plan
- `updatePortfolioAlerts` solo considera consentimiento vigente.
- Con plan Gratis (`autoAlerts === "none"`) el servidor rechaza
  `auto_alerts = true` aunque haya consentimiento; probado en la server action
  y en el validador puro.

### Tests
- `tests/portfolio-consent.test.ts` (26): texto §2.5, estados de versión,
  guardado con versión, retiro con RPC y nulls, error de RPC, versión vieja en
  alertas y rechazo de auto_alerts en Gratis.
- `tests/holdings-save.test.ts` (12): guardar sin consentimiento falla, versión
  vieja falla, versión vigente guarda.
- `tests/import-holdings-consent.test.ts` (4): importar sin consentimiento
  falla, versión vieja falla, versión vigente importa, flag apagado no consulta.

## Verificación
- `npx vitest run --maxWorkers=1 tests/portfolio-consent.test.ts
  tests/holdings-save.test.ts tests/import-holdings-consent.test.ts` → 42/42.
- `npm test -- --maxWorkers=1` → 70 archivos, 854 tests, todos pasan.
- `npm run lint` → OK.
- `npm run typecheck` → solo el error conocido de Next 16
  `src/app/layout.tsx: Cannot find name 'LayoutProps'` (tipo global generado en
  build). No hay errores en los archivos de F75B.
- `uv run --with pytest --with-requirements requirements.txt pytest -q
  tests/test_migracion_050.py` (desde `scrapers/`) → 9/9.

## Pendiente / notas
- La migración 050 sigue sin aplicarse en ningún entorno real. Al aplicarla, el
  constraint exige versión en cualquier fila con `consent_at`; si hubiera datos
  previos con `consent_at` y sin versión, habría que completarlos antes (no hay
  entorno aplicado, así que no debería ocurrir).
- Revisión de abogado obligatoria del texto de la §2.5 antes de encender el
  flag: sigue siendo borrador.
- Retirar el consentimiento borra la cartera sin pedir la palabra `BORRAR`; la
  UI lo explica y pide confirmación, pero conviene revisar si legal quiere una
  confirmación más fuerte.
- No se tocó Supabase real, ni `.env*`, ni `next dev`/`next build`, ni se hizo
  push. Los `scrapers/data/v2/F27..F36` untracked son de otras tareas.

## Cómo probar
1. Aplicar `supabase/migrations/050_mi_portafolio.sql` en un entorno de prueba.
2. `MY_PORTFOLIO_ENABLED=true`.
3. En `/settings`, la casilla de consentimiento aparece **sin marcar**.
4. Marcar y guardar: se escriben `consent_at` y
   `consent_version = "2026-10-20.v1"`.
5. Cambiar a mano `consent_version` a un valor viejo: guardar cartera o
   importar CSV debe fallar pidiendo aceptar de nuevo; Ajustes muestra el aviso.
6. Pulsar «Retirar consentimiento y borrar mi cartera»: confirmar, se llama
   `delete_my_portfolio()`, la cartera desaparece y el consentimiento queda nulo.
7. Con plan Gratis, activar auto_alerts aunque haya consentimiento debe dar
   error del servidor.
