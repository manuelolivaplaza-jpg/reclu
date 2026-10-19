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

## Hecho en la continuación del 19-10 (Grok Build, commiteado)

5. **`supabase/functions/send-alerts/index.ts`** (no se reescribió entero):
   - Realtime para pro, elite y prueba (`canUseRealtime`).
   - Sin `?mode`: pasada `instant` y luego `daily` (el cron de
     `vercel.json` llama la función una vez al día). `?mode=daily` solo el
     digest. `?mode=weekly` solo «Lo que movieron los grandes» para
     `weekly_digest !== false`, con `DIGEST_SPONSOR_HTML` (vacío = nada).
   - Respeta `alert_frequency` y `email_unsubscribed`.
   - Telegram si hay `TELEGRAM_BOT_TOKEN` y `telegram_chat_id` (si falta el
     token, se omite).
   - Desfase de declaración en el correo y en el digest (`tx_date`/`disclosed`
     o `traded_at`/`filed_at`).
   - Enlace de baja y cabeceras `List-Unsubscribe` /
     `List-Unsubscribe-Post` dentro del JSON de Resend (no en el fetch),
     hacia `${SITE_URL|NEXT_PUBLIC_SITE_URL}/api/unsubscribe?token=...`.
     Si no hay env, el fallback del host sigue siendo `https://reclu.cl`.
   - `alert_deliveries` no distingue canal: un upsert de la misma fila.
6. **Baja**: `src/app/api/unsubscribe/route.ts` (GET redirige a la
   confirmación, no da de baja; POST llama `unsubscribe_by_token` con el
   cliente de servicio) y `src/app/baja/page.tsx`.
7. **Telegram**: `src/app/api/telegram/webhook/route.ts` verifica
   `X-Telegram-Bot-Api-Secret-Token`, acepta `/start CODIGO` y llama
   `link_telegram_chat`. `TelegramConnect` en Ajustes genera el código y el
   enlace `https://t.me/<BOT>?start=CODIGO`, y guarda `alert_channel`.

## Pendiente

- Banner de prueba «te quedan N días de Pro» en el dashboard. No entró en
  este corte.
- El pipeline (`/api/run-pipeline`) no agrega `?mode=weekly`. Hay que
  programar una llamada semanal aparte a la edge function.
- `email_unsubscribed` no tiene botón para volver a suscribirse.

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
5. Registrar webhook (una vez), contra la ruta de Next, no una edge function:
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<dominio>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"`
6. Resumen semanal: una vez por semana, POST a
   `.../functions/v1/send-alerts?mode=weekly` (el cron diario ya manda
   instantáneas + digest).
7. Sin esas variables todo degrada elegante: Telegram se omite, los correos
   siguen funcionando con Resend.

## Seguridad

- `trial_ends_at`, `telegram_chat_id` y `unsubscribe_token` son SOLO DE
  SERVIDOR: el frente F1 agrega un trigger que impide al cliente cambiar
  columnas sensibles; incluir estas tres.
- La 008 corre después de la 007: marca `set_config('reclu.trusted','on',true)` en `check_chat_quota`, `link_telegram_chat`, `unsubscribe_by_token` y `handle_new_user`, y revoca las tres RPC a `public`, `anon` y `authenticated` (solo `service_role`).
- Nunca commitear `.env*` (salvo `.env.example`).
