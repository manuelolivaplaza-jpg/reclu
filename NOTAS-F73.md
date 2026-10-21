# NOTAS F73 — Alertas automáticas de la cartera (opt-in)

Rama: `v2/f73-alertas-portafolio` (desde `mejoras/integracion`).
Estado: **implementado y verificado** (lint, typecheck y suite completa en verde).

## Qué se hizo

### 1. Migración `supabase/migrations/053_alertas_portafolio.sql` (nueva, idempotente)

- Tabla `user_portfolio_alerts`:
  `user_id, news_id, symbol, relevance, channel, sent_at`.
  - PK `(user_id, news_id, symbol)` → garantiza “sin duplicados
    (news_id, symbol, user)” a nivel de base.
  - `channel` ∈ `email | telegram | both`.
  - Índice `(user_id, sent_at desc)` para el tope diario.
- RLS: solo el dueño puede **leer** (`auth.uid() = user_id`). No hay policies
  de escritura: el job usa `service_role`. `anon` sin grants.
- No se tocó la tabla pública `alerts` ni su check de `type`: al ser alertas
  personales viven en su propia tabla (recomendación de la tarea).
- Se recrea `delete_my_portfolio()` (de la 050) para borrar también el
  historial de avisos al ejercer el derecho de supresión.
- Incluye bloque de rollback al final. **No se aplicó ninguna migración real.**

### 2. `src/lib/portfolio-alerts.ts` (lógica pura, sin red ni Supabase)

- `isPortfolioAlertEligible()`: switch `auto_alerts`, `consent_at` vigente y
  `autoAlerts !== "none"` según `portfolioLimitsFor()` de `plans.ts`.
- `portfolioDeliveryChannels()`: reutiliza `normalizeChannel()` de
  `alert-routing.ts` (Telegram solo Pro/Elite/prueba), respeta la baja de
  correo y exige chat de Telegram vinculado.
- `selectPortfolioDeliveries()`:
  - Pro / prueba (`daily_digest`): un solo resumen por día; si ya se envió
    algo hoy, no se repite.
  - Elite (`realtime`): hasta `autoAlertsMaxPerDay - enviadosHoy`, ordenado
    por relevancia descendente (tope 20).
- `formatExposure()`, `relationLabel()`, `portfolioAlertSubject()`.
- Render de correo (blanco, filetes 1px, sin sombras, píldora negra, según
  `docs/hermes-diseno.md`) y de Telegram (HTML).
- Contenido: título, ticker, % de cartera expuesto, enlace a la fuente y el
  descargo corto `IA · Información, no recomendación · Puede tener errores.`
  **Nunca montos.** Las URLs solo se enlazan si son `http(s)`.

### 3. `src/app/api/impact/alerts/route.ts` (job POST)

- Protegido con `Authorization: Bearer ${CRON_SECRET}` y `timingSafeEqual()`.
  Sin secreto configurado → 503; secreto incorrecto → 401.
- Con `NEWS_IMPACT_ENABLED` distinto de `"true"` → **404** (apagado por
  defecto). Sin Supabase configurado → 503. Sin ningún canal
  (`RESEND_API_KEY` / `TELEGRAM_BOT_TOKEN`) → 503.
- Flujo: noticias de las últimas 48 h (`news_items` + `news_tickers`) →
  usuarios con `auto_alerts = true` y consentimiento → perfiles, carteras
  (`user_holdings`) y `ticker_profile` → `matchNewsToPortfolio()` con
  `minRelevance` del usuario → tope por plan → envío → registro en
  `user_portfolio_alerts`.
- Deduplicación: consulta previa por `(user, news, symbol)` + PK/upsert
  `ignoreDuplicates`.
- Tope diario: cuenta filas del día UTC por usuario.
- Solo registra filas de avisos entregados por al menos un canal; si Resend o
  Telegram fallan, se reintenta en la próxima corrida.
- Email con Resend (`POST https://api.resend.com/emails`, headers
  `List-Unsubscribe` cuando hay token) y Telegram (`sendMessage`), mismo
  patrón que `supabase/functions/send-alerts`.
- `Cache-Control: no-store`. La respuesta solo trae conteos (sin datos
  personales).

### 4. `tests/portfolio-alerts.test.ts` (12 tests, Supabase y `fetch` mockeados)

Cubren: 401, 404 con flag apagado, Gratis no recibe, Pro recibe **un** resumen
con todas las noticias, Pro no repite resumen el mismo día, Elite envía 20 de
25 y descuenta lo ya enviado hoy, sin consentimiento no recibe,
`auto_alerts=false` no recibe, no reenvía duplicados, si Resend falla no
registra, y resumen por Telegram cuando es el canal elegido.

## Cómo probar

```bash
npm run lint
npm run typecheck
npm test          # 72 archivos / 884 tests en verde
npx vitest run --maxWorkers=1 tests/portfolio-alerts.test.ts
```

Invocación real (cuando exista Supabase + migración 053 aplicada):

```bash
curl -X POST https://<host>/api/impact/alerts \
  -H "Authorization: Bearer $CRON_SECRET"
```

Variables: `NEWS_IMPACT_ENABLED=true`, `CRON_SECRET`, `RESEND_API_KEY`,
`EMAIL_FROM`, `TELEGRAM_BOT_TOKEN` (opcional), `NEXT_PUBLIC_SITE_URL`.

## Pendiente / recomendaciones

- **Wiring del cron**: igual que F70 (`/api/impact/precompute`), la ruta no
  está llamada desde `run-pipeline` ni desde `vercel.json`. Falta que el
  orquestador decida la frecuencia (p. ej. cada hora para Elite y una corrida
  diaria para el resumen de Pro) y agregue la llamada.
- **Concurrencia**: dos corridas simultáneas podrían enviar antes de escribir
  la fila. La PK evita duplicados en base, no un doble envío. Si el cron puede
  solaparse, conviene un lock (advisory lock o fila de “claim”) en una
  migración futura.
- **Resumen diario de Pro**: se envía en la primera corrida del día que tenga
  noticias nuevas. Lo que llegue después espera al día siguiente (semántica
  “un resumen diario”).
- **Revisión legal**: `docs/informe-legal-reclu.md` exige opinión escrita
  antes de lanzar alertas personalizadas; el flag sigue apagado por defecto y
  las alertas parten opt-in. Actualizar `/privacidad` si cambia el texto del
  consentimiento (hoy se reutiliza `consent_at` de la 050).
- `NEWS_IMPACT_ENABLED` y `MY_PORTFOLIO_ENABLED` deben estar en `true` para
  que el flujo completo (feed + alertas) funcione; la ruta solo exige
  `NEWS_IMPACT_ENABLED`.
