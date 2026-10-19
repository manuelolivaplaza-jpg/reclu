# NOTAS-F4 — Planes y alertas (rama mejoras/f4-planes-alertas)

## Qué quedó hecho y commiteado

1. **`src/lib/plans.ts`** (nuevo, dueño de este frente): fuente única de verdad.
   Pro $12.990/mes, Elite $16.990/mes, anual = mensual × 0,8 redondeado a $10.
   Follows 2/15/∞ (free/pro/elite). Chat: 5/día, 50/semana, ilimitado.
   Frecuencias: free daily/weekly; pro+elite realtime/daily/weekly.
   Telegram solo pro/elite. CSV solo elite. Helpers: `getPlan`,
   `followLimitFor`, `chatQuotaFor`, `canUseRealtime`, `canUseTelegram`,
   `allowedFrequencies`, `isInTrial`, `isTrialPro`, `trialDaysLeft`,
   `formatClp`, `TRIAL_DAYS=7`. `isPaidPlan` se re-exporta de types.ts.
2. **`src/lib/alert-routing.ts`** (nuevo): `routeAlert()` puro con modos
   instant/daily/weekly, normaliza frecuencia y canal, respeta
   `email_unsubscribed` y `telegram_chat_id` vinculado.
3. **Tests**: `tests/plans.test.ts` y `tests/alert-routing.test.ts`.
   `npm test` → 61 tests OK (7 suites).
4. **`supabase/migrations/008_planes_alertas.sql`** (idempotente, sin ejecutar):
   - `check_chat_quota` y trigger de cuota alineados: free 5/día, pro 50/sem,
     elite límite 1.000.000 con ventana de 1 hora (ilimitado en la práctica).
   - Default `alert_frequency='daily'` para usuarios nuevos; gratis viejos con
     'realtime' migrados a 'daily' (pagados no se tocan).
   - Columnas nuevas: `telegram_chat_id`, `telegram_link_code`,
     `alert_channel` (email|telegram|both), `unsubscribe_token` uuid,
     `email_unsubscribed`, `weekly_digest`, `trial_ends_at` + índices únicos.
   - `handle_new_user` recreado: alta con `alert_frequency='daily'` y
     `trial_ends_at = now() + 7 days` (prueba de Pro para nuevos; los
     existentes no se modifican).
   - RPC server-only: `link_telegram_chat(codigo, chat_id)` y
     `unsubscribe_by_token(uuid)`.

## Pendiente (lo siguiente de este frente, en orden)

1. **`supabase/functions/send-alerts/index.ts`**: reescribir con
   `routeAlert` equivalente en Deno (copia mínima de plans/alert-routing con
   comentario de sincronización), realtime para pro/elite/prueba, respetar
   `alert_frequency` + `email_unsubscribed`, canal Telegram vía Bot API
   (`TELEGRAM_BOT_TOKEN`, se omite sin error si falta), lag de declaración
   (usar `alert.payload`: `tx_date`+`disclosed` o `traded_at`+`filed_at`,
   días entre fechas), baja en cada correo con cabeceras
   `List-Unsubscribe` / `List-Unsubscribe-Post` hacia
   `${SITE_URL}/api/unsubscribe?token=...`, y modo `?mode=weekly` para todos
   los `weekly_digest=true` con bloque `DIGEST_SPONSOR_HTML` (vacío por
   defecto). OJO: el write fue bloqueado por el límite de tiempo; el archivo
   actual sigue funcional y commiteado.
2. Rutas Next: `src/app/api/unsubscribe/route.ts` (GET confirmación, POST un
   clic, service role + `unsubscribe_by_token`), `src/app/baja/page.tsx`,
   `src/app/api/telegram/webhook/route.ts` (verifica
   `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET`,
   parsea `/start CODIGO`, llama `link_telegram_chat`).
3. Componentes: `src/components/telegram-connect.tsx` (server action genera
   código, enlace `https://t.me/<BOT>?start=CODIGO`, selector de canal) e
   inserción de 1-2 líneas en `src/app/(dashboard)/settings/page.tsx`;
   banner de prueba "te quedan N días de Pro" en el dashboard.
4. Consumir `plans.ts` en: `pricing.tsx`, `faq.tsx` (corregir fuentes: House
   Disclosure, Senado, SEC 13F, ARK/Global X, Renta 4, BTG — QUITAR Capitol
   Trades y LarrainVial), `settings-form.tsx`, `alert-frequency-form.tsx`
   (frecuencias desde `allowedFrequencies(plan, trial_ends_at)`), y el límite
   de `followPortfolio` en `queries.ts` (cambio mínimo).

## Cómo deben usar `plans.ts` otros frentes

- **F2 (upgrade-checkout.tsx)**: precios desde `PLANS.pro.monthlyPrice` /
  `PLANS.elite.monthlyPrice` y `formatClp()`; anual con
  `annualMonthlyPrice`/`annualTotalPrice`.
- **F1 (api/chat/route.ts)**: reemplazar `FREE_DAILY_LIMIT` y el chequeo
  `plan === "pro"` por `chatQuotaFor(plan)` (cupo real) y considerar
  `isTrialPro(plan, trial_ends_at)` para dar Pro durante la prueba; Elite =
  ilimitado (`window === "unlimited"`).

## Qué debe configurar/ejecutar Manu (en orden)

1. SQL Editor de Supabase: ejecutar `supabase/migrations/008_planes_alertas.sql`
   (idempotente; después de la 006 si falta).
2. Desplegar la edge function actualizada cuando esté:
   `supabase functions deploy send-alerts`.
3. Crear el bot con @BotFather en Telegram: `/newbot`, anotar token.
4. Variables de entorno (Vercel + Supabase secrets):
   - `TELEGRAM_BOT_TOKEN` (BotFather)
   - `TELEGRAM_BOT_USERNAME` (sin @, para el enlace de vinculación)
   - `TELEGRAM_WEBHOOK_SECRET` (string aleatorio propio)
   - `SITE_URL` o `NEXT_PUBLIC_SITE_URL` (ya existía; base de enlaces y bajas)
   - `DIGEST_SPONSOR_HTML` (opcional, vacío = sin patrocinador)
5. Registrar webhook (una vez):
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<proyecto>.supabase.co/functions/v1/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"`
6. Sin esas variables todo degrada elegante: Telegram se omite, los correos
   siguen funcionando con Resend.

## Seguridad

- `trial_ends_at`, `telegram_chat_id` y `unsubscribe_token` son SOLO DE
  SERVIDOR: el frente F1 agrega un trigger que impide al cliente cambiar
  columnas sensibles; incluir estas tres.
- Nunca commitear `.env*` (salvo `.env.example`).
