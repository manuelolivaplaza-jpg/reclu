# Pagos con Mercado Pago (Fraccion)

Los planes Pro y Elite (mensual y anual) se cobran con **suscripciones de
Mercado Pago** (preapproval), porque son cobros recurrentes. El código está en
`src/lib/billing/mercadopago.ts`.

## Qué tiene que configurar Manu

### 1. Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | De dónde sale | Obligatoria |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Mercado Pago Developers → Tus integraciones → (app) → Credenciales de producción → Access Token | Sí |
| `MERCADOPAGO_PUBLIC_KEY` | Mismo lugar → Public Key | Recomendada (hoy no se usa en el navegador; queda lista para Bricks) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Tus integraciones → (app) → Webhooks → "Clave secreta" | Sí |
| `PAYMENT_PROVIDER` | Escribir `mercadopago` | Sí en producción |
| `PAYMENT_MODE` | `production` en producción, `sandbox` en prueba | Sí |
| `NEXT_PUBLIC_SITE_URL` | `https://fraccion.si` cuando el dominio esté listo | Sí |
| `NEXT_PUBLIC_BRAND_DOMAIN` | Opcional; por defecto `fraccion.si` | No |
| `EMAIL_FROM` | p. ej. `Fraccion <alertas@fraccion.si>` (dominio verificado en Resend) | Sí para emails |

Para el sitio de prueba usa las **credenciales de prueba** y cuentas de
prueba de comprador y vendedor de Mercado Pago.

Nunca pegues estas claves en el código ni en el chat: solo en Vercel.

### 2. Webhook en el panel de Mercado Pago

Tus integraciones → (app) → Webhooks → Configurar notificaciones:

- URL de producción: `https://fraccion.si/api/billing/webhook/mercadopago`
- URL de prueba: `https://<dominio-de-prueba>/api/billing/webhook/mercadopago`
- Eventos: **Planes y suscripciones** (`subscription_preapproval` y
  `subscription_authorized_payment`).
- Copia la "Clave secreta" a `MERCADOPAGO_WEBHOOK_SECRET`.

### 3. Precios

Los montos en CLP salen de `src/lib/billing/prices.ts`. No hace falta crear
planes en el panel de Mercado Pago.

## Cómo funciona

1. `/api/billing/checkout` crea un preapproval en estado `pending` con
   `external_reference = "<userId>|<plan>|<periodo>"` y una llave de
   idempotencia (`X-Idempotency-Key`), y deja la suscripción local como
   `pending`. El usuario va a `init_point` y paga en Mercado Pago.
2. Mercado Pago lo devuelve a `/api/billing/return/mercadopago`, que consulta
   el estado real y redirige a:
   - activa → `/upgrade/exito`
   - pendiente → `/upgrade/pendiente`
   - rechazada o cancelada → `/upgrade/error`
3. El webhook `/api/billing/webhook/mercadopago`:
   - valida `x-signature` (HMAC-SHA256 con la clave secreta) y rechaza si el
     `data.id` del cuerpo no coincide con el firmado;
   - nunca confía en el cuerpo: consulta `GET /preapproval/{id}` (o
     `/authorized_payments/{id}` en cada cobro recurrente);
   - es idempotente: cada evento se guarda en `payment_events` con un id
     estable (suscripción + estado + próximo cobro) y los repetidos se ignoran;
   - actualiza `subscriptions` y `profiles.plan`.
4. Cancelar (`/api/billing/cancel`) hace `PUT /preapproval/{id}` con
   `status: cancelled`. El usuario conserva el plan hasta la fecha del próximo
   cobro, que ya no se hace.

## Modo prueba (mock)

Sin `MERCADOPAGO_ACCESS_TOKEN` y sin `PAYMENT_PROVIDER`, en desarrollo se usa
el proveedor de prueba (`mock.ts`), que no cobra. En producción el mock nunca
se activa: si faltan claves, el checkout responde "Pagos no disponibles".
Con el token puesto y sin `PAYMENT_PROVIDER`, se usa Mercado Pago.

## Antes de lanzar (checklist)

- [ ] Credenciales de prueba en el sitio de prueba y una compra de punta a
      punta con tarjetas de prueba (aprobada, rechazada y pendiente).
- [ ] Webhook de prueba recibido ("Simular notificación" en el panel de MP).
- [ ] Credenciales de producción y `PAYMENT_MODE=production` solo en producción.
- [ ] `NEXT_PUBLIC_SITE_URL=https://fraccion.si` cuando el dominio apunte a Vercel.
