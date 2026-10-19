# F2 — Pagos (rama mejoras/f2-pagos)

## Qué se hizo

Base heredada del commit WIP `e24c5c6` (sesión cortada): capa completa de
billing ya escrita. Esta sesión la auditó, corrigió y dejó verde.

- Correcciones sobre el WIP (commit `ddb2075`):
  - `upgrade-checkout.tsx`: tipo `PaymentMethodId` era undefined (fue borrado
    de `src/lib/types.ts`); ahora vive en el propio componente. Import
    `ButtonLink` y var `activePayment` sin uso eliminados.
  - `mercadopago.ts`: `.includes` sobre `unknown` → cast a `string`.
  - `cancel/route.ts` y `webhook/[provider]/route.ts`: imports/params sin uso.
- Estado verificado en el cierre: `npm run lint` OK, `npm run typecheck` OK,
  `npm test` 45/45 OK, `npm run build` OK (Next.js 16.4). Ver sección
  "Fail closed".

Contenido del frente (del WIP, auditado):
- `src/lib/billing/`: `types.ts` (interfaz PaymentProvider), `flow.ts`
  (HMAC-SHA256 de params ordenados con FLOW_SECRET_KEY, sandbox/producción,
  customer/register + payment/create + payment/getStatus),
  `mercadopago.ts` (/preapproval + x-signature), `mock.ts` (sin claves),
  `index.ts` (elige por PAYMENT_PROVIDER, default mock), `prices.ts`
  (Pro $12.990 / Elite $16.990, anual −20%; TODO usar src/lib/plans.ts),
  `process.ts` (webhook idempotente vía payment_events, cambia plan con
  service role), `supabase-admin.ts`, `completer.ts`/`pending.ts`.
- Rutas: `api/billing/checkout` (zod: plan pro|elite, periodo mensual|anual),
  `api/billing/webhook/[provider]` (nunca confía en el body: consulta al
  proveedor), `api/billing/cancel`. Páginas `upgrade/exito|error|pendiente`.
- UI: `upgrade-checkout.tsx` ya no usa mailto, llama a /api/billing/checkout;
  `billing-status.tsx` insertado en settings (estado + cancelar);
  `broker-affiliate.tsx` apagado por defecto (NEXT_PUBLIC_AFFILIATES_ENABLED).
- M3 referidos: cookie `ref` en proxy → signUp manda `referred_by` en
  metadata; trigger de migración 009 crea el vínculo; el webhook de pago
  aplica la recompensa (1 mes) cuando el referido paga.
- Migración `supabase/migrations/009_pagos_suscripciones.sql`: tablas
  `subscriptions`, `payment_events`, `referrals`; RLS: usuario solo lee lo
  suyo, escritura solo service role; columna `billing_customer_id` en
  profiles (idempotente, if not exists).
- `types.ts`: `stripe_customer_id` → `billing_customer_id` (cambio mínimo).
- `.env.example`: variables nuevas con valor vacío (FLOW_*, MP_*, PAYMENT_*,
  NEXT_PUBLIC_AFFILIATES_ENABLED).

## Fail closed

El mock ya no es el refugio si faltan claves. `isMockAllowed()` (`src/lib/billing/index.ts`)
es true solo si el proveedor pedido es mock o está ausente, `PAYMENT_MODE` no es
`production`, `VERCEL_ENV` no es `production`, y `NODE_ENV` no es `production`
salvo `ALLOW_MOCK_PAYMENTS=true`. `VERCEL_ENV=production` gana aunque
`ALLOW_MOCK_PAYMENTS=true`.

- Checkout (`src/app/api/billing/checkout/route.ts`): 503 "Pagos no configurados"
  si `getPaymentProvider()` lanza `PaymentsNotConfiguredError`. No hay fallback.
- Webhook `mock`: 404 antes de leer el body o tocar la base si `!isMockAllowed()`.
- `flow` / `mercadopago` sin claves lanzan `PaymentsNotConfiguredError`. Nunca
  devuelven el proveedor mock.
- Sin `PAYMENT_PROVIDER`, en desarrollo el default sigue siendo mock (el selector
  ya decía `?? "mock"`, pero `isMockAllowed` exigía la variable explícita y el
  default nunca arrancaba).

Tests en `tests/billing.test.ts` (16 de billing, 45 de la suite). Usan
`vi.stubEnv` / `vi.unstubAllEnvs` y no leen `.env.local`:

1. Sin `PAYMENT_PROVIDER` y `NODE_ENV=development` → mock.
2. `VERCEL_ENV=production` → `isMockAllowed()` false y `getPaymentProvider()` /
   `getProviderById("mock")` lanzan aunque `ALLOW_MOCK_PAYMENTS=true`.
3. `NODE_ENV=production` sin `ALLOW_MOCK_PAYMENTS` → false; con
   `ALLOW_MOCK_PAYMENTS=true` y sin `VERCEL_ENV=production` → mock.
4. `PAYMENT_PROVIDER=flow` y `mercadopago` sin claves → `PaymentsNotConfiguredError`
   con ese `providerId`.
5. POST `/api/billing/webhook/mock` con mock prohibido → 404.

Página `upgrade/pendiente`: si no hay proveedor, no crashea; el texto queda
genérico ("Tu pago está en proceso."). `mock.ts` ya no inserta
`providerCustomerEmail` (esa columna no existe en `subscriptions`; el insert
fallaría en Supabase).

## Revisión de seguridad

Corregido en este cierre:

- Mercado Pago: la firma HMAC cubre `data.id` del query, no el JSON. El webhook
  consultaba el id del body, así que una notificación firmada podía pedir el
  estado de otra suscripción. Ahora se consulta el id firmado y se rechaza si
  el body trae otro (`src/lib/billing/mercadopago.ts`).
- Mock: columna inexistente en el insert (arriba).
- `.env.example` decía que sin claves se caía a mock. Ahora describe el fail
  closed y documenta `ALLOW_MOCK_PAYMENTS` vacío.

Revisado y se mantiene:

- Checkout: el body solo acepta `plan` (`pro`|`elite`) y `period`
  (`mensual`|`anual`). El monto sale de `src/lib/billing/prices.ts`
  (`PLAN_PRICES_CLP`). `src/lib/plans.ts` no está en esta rama
  (`TODO(integración)` en `prices.ts`).
- Flow: el webhook no trae HMAC de entrada (el modelo de Flow es token +
  consulta firmada con `FLOW_SECRET_KEY` a `subscription/get`,
  `payment/getStatus` o `customer/getRegisterStatus`). El plan que se escribe
  en `profiles` es el de la fila local creada en el checkout: el estado de
  Flow llega con `plan: null` y `process.ts` usa esa fila. Idempotencia por
  índice único `(provider, event_id)` en `payment_events`.
- Mercado Pago: verifica `x-signature`, luego `GET /preapproval/{id}`. El plan
  se reconoce por `preapproval_plan_id` contra `MP_PREAPPROVAL_PLAN_*`; si no
  calza, vale la fila local. El monto del alta es `PLAN_PRICES_CLP`.
- Ningún secreto de pagos va con prefijo `NEXT_PUBLIC_`. La service role solo
  se usa en servidor (`supabase-admin.ts`).

Riesgo que queda (no es un bug de código, es configuración): el webhook no
vuelve a comparar el monto cobrado contra `prices.ts`. Si el plan en el
portal de Flow o de Mercado Pago tiene otro precio, se cobra eso y igual se
activa el plan guardado en la fila local. Hay que crear esos planes con los
mismos montos: Pro $12.990/mes, Elite $16.990/mes, anual según `prices.ts`
(Pro $124.680, Elite $163.080).

## Pendiente

- F4: unificar precios con `src/lib/plans.ts` cuando exista.
- F1: incluir `billing_customer_id` en el trigger que protege columnas de
  facturación de profiles.
- Probar en sandbox de Flow y de Mercado Pago el alta real (esta rama no
  llama a esas APIs ni aplica la migración). En MP, confirmar que crear el
  preapproval con `status: "authorized"` igual exige que la persona apruebe
  en `init_point`.

## Configuración para Manu

1. Aplicar migraciones en orden en Supabase (SQL Editor); la 009 es
   idempotente: `...009_pagos_suscripciones.sql`.
2. Variables nuevas (`.env.local`): `PAYMENT_PROVIDER` (`flow` |
   `mercadopago` | `mock`), `PAYMENT_MODE` (`sandbox` | `production`),
   `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `MP_ACCESS_TOKEN`,
   `MP_WEBHOOK_SECRET`, `NEXT_PUBLIC_AFFILIATES_ENABLED=false`.
3. Flow.cl: crear cuenta sandbox, registrar el plan de suscripción, URL de
   webhook a configurar: `https://TU-DOMINIO/api/billing/webhook/flow`.
4. Mercado Pago: crear app + credenciales de test, suscripción /preapproval,
   webhook: `https://TU-DOMINIO/api/billing/webhook/mercadopago`.
5. En local, sin `PAYMENT_PROVIDER` (o con `mock`) el pago se simula
   (checkout → éxito → webhook actualiza el plan). En Vercel production
   no uses mock: `VERCEL_ENV=production` lo apaga aunque pongas
   `ALLOW_MOCK_PAYMENTS=true`. `ALLOW_MOCK_PAYMENTS` solo sirve en un
   `NODE_ENV=production` que no sea el deploy de Vercel (staging).
6. No pongas claves de Flow ni de Mercado Pago en variables `NEXT_PUBLIC_`.
