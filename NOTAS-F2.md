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
- Estado verificado: `npm run lint` OK (0 problemas), `npm run typecheck` OK,
  `npm test` 40/40 OK (incluye `tests/billing.test.ts`: firma HMAC Flow,
  verificación x-signature de MP, proveedor mock). `next build` compilaba
  salvo esos 3 errores de tsc ya corregidos (mismo tsc que typecheck).

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

## Pendiente

- Re-validar `npm run build` completo tras los fixes (typecheck ya pasa; los
  3 errores que bloqueaban el build eran esos mismos).
- F4: unificar precios con `src/lib/plans.ts` cuando exista.
- F1: incluir `billing_customer_id` en el trigger que protege columnas de
  facturación de profiles.

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
5. Sin claves, `PAYMENT_PROVIDER=mock` simula el pago completo en local
   (checkout → éxito → webhook actualiza el plan).
