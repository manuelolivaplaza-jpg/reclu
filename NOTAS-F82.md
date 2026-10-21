# NOTAS-F82 — Aviso "pagos no disponibles"

**Rama:** `v2/f82-pagos-no-disponibles` (worktree `C:\reclu-work\f48`, base `mejoras/integracion`)
**Commit:** `43eb2d4` — feat(billing): show plans with 'pagos no disponibles' notice instead of crashing upgrade page
**Estado:** terminado y verificado. `npm run lint`, `npm run typecheck` y `npm test` (1083 tests, 89 archivos) pasan.

---

## 1. El problema

Sin claves de pago, `getPaymentProvider()` lanza `PaymentsNotConfiguredError`.
`src/app/(dashboard)/upgrade/page.tsx` llamaba a `isMockProvider()` (que llama a
`getPaymentProvider()`) en el render → la página /upgrade **se caía entera** con
un 500 en vez de mostrar los planes.

Además, las rutas de API respondían 503 pero con **dos mensajes distintos**
("Pagos no configurados." vs "Pagos no configurados: falta configurar las claves
del proveedor."), y la ruta de **cancel** no capturaba el error: `getProviderById()`
lanza el mismo error y se traducía en un 500.

## 2. Qué se hizo

### 2.1 `src/lib/billing/index.ts` — nueva función `getPaymentsAvailability()`

```ts
export type PaymentsAvailability =
  | { available: true; isTestMode: boolean }
  | { available: false };

export function getPaymentsAvailability(): PaymentsAvailability {
  try {
    const provider = getPaymentProvider();
    return { available: true, isTestMode: provider.id === "mock" };
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) return { available: false };
    throw err;
  }
}
```

- Captura **SOLO** `PaymentsNotConfiguredError`. Cualquier otro error se propaga
  (hay un test que lo verifica con un mock que lanza `Error("boom")`).
- **NO** se tocó `getPaymentProvider`, `getProviderById` ni `isMockAllowed`.
- El fail closed se mantiene: `getPaymentsAvailability()` **nunca** cae a mock
  por falta de claves, porque llama a `getPaymentProvider()` y respeta su lógica.

### 2.2 `src/lib/billing/messages.ts` (nuevo)

Textos en español, en un módulo aparte porque lo importan tanto el **client
component** del checkout como las rutas de API. `src/lib/billing/index.ts` no es
apto para el cliente (importa los adaptadores de Flow/Mercado Pago, server-only).

- `PAYMENTS_UNAVAILABLE_MESSAGE` = "Los pagos no están disponibles por ahora. Vuelve a intentarlo más tarde." (aviso visible en /upgrade)
- `PAYMENTS_UNAVAILABLE_ERROR` = "Los pagos no están disponibles por ahora." (error de la API)

### 2.3 `src/app/(dashboard)/upgrade/page.tsx`

Reemplaza `isMockProvider()` por `getPaymentsAvailability()` y pasa dos props:

```tsx
isTestMode={payments.available && payments.isTestMode}
paymentsAvailable={payments.available}
```

La página ya no se cae: muestra planes, precios y el aviso.

### 2.4 `src/components/upgrade-checkout.tsx`

Nueva prop `paymentsAvailable?: boolean` (default `true`, para no romper otros usos).

- **Aviso visible** con `role="status"`, borde 1px negro y sin sombra (mismo
  estilo que el bloque de error existente del componente):
  "Los pagos no están disponibles por ahora. Vuelve a intentarlo más tarde."
- **Botón de pago deshabilitado** (`disabled` en el `Button` submit).
- **Radios de medio de pago deshabilitados.**
- Los **selectores de plan y el toggle mensual/anual siguen activos**: el usuario
  puede seguir mirando precios y comparando planes.
- Guarda extra en `handleActivate`: si no hay pagos, no se llama a la API y se
  muestra el mensaje (protección si alguien dispara el submit por otra vía).

### 2.5 Rutas de API

- `src/app/api/billing/checkout/route.ts`: un solo mensaje genérico para todos los
  proveedores → **503**, nunca 500. Antes había dos mensajes distintos.
- `src/app/api/billing/cancel/route.ts` (no estaba en el `rg` de la tarea, pero
  tenía el mismo bug): `getProviderById()` ahora se captura y devuelve **503**
  con el mismo mensaje genérico en vez de 500.

Los tres `getPaymentProvider(` / `getProviderById(` que aparecen en `src/app`
quedan cubiertos:

| Archivo | Antes | Ahora |
|---|---|---|
| `upgrade/page.tsx` | 500 (se caía) | planes + aviso, botón deshabilitado |
| `upgrade/pendiente/page.tsx` | ya tenía try/catch | sin cambios (no crasheaba) |
| `api/billing/checkout/route.ts` | 503, 2 mensajes distintos | 503, mensaje único |
| `api/billing/cancel/route.ts` | 500 | 503, mensaje único |

## 3. Tests (3 archivos nuevos, 21 tests)

- `tests/payments-availability.test.ts` (9 tests) — la función:
  - sin claves + `PAYMENT_PROVIDER=flow` → `{ available: false }`
  - sin claves + flow → **`getPaymentProvider` sigue lanzando** `PaymentsNotConfiguredError`
  - sin claves + `mercadopago` → `{ available: false }`
  - producción sin claves → **nunca devuelve mock** (ni con `ALLOW_MOCK_PAYMENTS=true`)
  - mock permitido → `{ available: true, isTestMode: true }`
  - flow **con** claves → `{ available: true, isTestMode: false }`
  - un error que no es `PaymentsNotConfiguredError` se propaga
  - los textos en español son los acordados
- `tests/upgrade-payments-unavailable.test.ts` (8 tests) — render de la página
  con `renderToStaticMarkup` (Supabase mockeado): la página no lanza, muestra los
  planes y precios, muestra el aviso, el botón submit y los radios quedan
  `disabled`, los selectores de plan NO, y con mock no hay aviso ni `disabled`.
- `tests/billing-checkout-unavailable.test.ts` (5 tests) — la API de checkout
  devuelve 503 con el mensaje genérico, nunca 500, y **el mensaje no revela**
  el proveedor pedido ni el nombre de las claves faltantes.

> Nota: las aserciones de `disabled` miran el **atributo** (`\sdisabled(=|\s|>)`)
> y no la clase CSS `disabled:pointer-events-none`, que daba un falso positivo.

## 4. Decisiones

1. **Mensaje genérico y único** para todos los proveedores. Antes la respuesta
   distinguía "mock no configurado" de "faltan claves de flow"; con el mensaje
   único no se revela qué proveedor se pidió ni qué claves faltan.
2. **Los planes se siguen mostrando.** Bloquear la página entera era peor para
   el usuario que avisar y dejar el checkout deshabilitado.
3. **Solo se bloquea el pago**, no la exploración: cambiar de plan o de ciclo
   de facturación sigue funcionando.
4. **Módulo de mensajes aparte** (`src/lib/billing/messages.ts`) porque el
   componente del checkout es `"use client"` y no puede importar
   `src/lib/billing/index.ts` (arrastraría los adaptadores de pago al cliente).
5. **Sin migración de base de datos**: no cambia nada el esquema. No se creó
   ninguna migración (la 054 sigue siendo la última).
6. **No se tocó** `src/app/actions/holdings.ts` ni los editores de cartera
   (trabajo de la otra sesión en paralelo).

## 5. Cómo probarlo

### Automatizado (lo que corre el orquestador)

```bash
cd C:/reclu-work/f48
npm run lint
npm run typecheck
npm test
# solo F82:
npx vitest run --maxWorkers=1 tests/payments-availability.test.ts tests/upgrade-payments-unavailable.test.ts tests/billing-checkout-unavailable.test.ts
```

### Manual (con `npm run dev`, fuera de este worktree)

1. **Sin claves** (el caso del bug). En `.env.local` poner
   `PAYMENT_PROVIDER=flow` y **sin** `FLOW_API_KEY` / `FLOW_SECRET_KEY`.
   Entrar a `/upgrade`:
   - la página **carga** (antes daba 500),
   - se ven los planes Pro y Elite con sus precios,
   - aparece el aviso "Los pagos no están disponibles por ahora. Vuelve a
     intentarlo más tarde.",
   - el botón "Activar Plan …" está deshabilitado y los radios de medio de pago
     también; los selectores de plan sí funcionan,
   - no aparece la nota "Modo prueba".
2. **Con mock** (desarrollo): `PAYMENT_PROVIDER=mock`, `NODE_ENV` de desarrollo.
   `/upgrade` no muestra el aviso, el botón está habilitado y sale la nota
   "Modo prueba: los pagos se simulan y no se realizan cobros reales".
3. **La API**: con `curl` a `POST /api/billing/checkout` (con sesión) y sin
   claves → **503** con `{"ok":false,"error":"Los pagos no están disponibles por
   ahora."}`. Antes en `cancel` era un 500.

## 6. Pendientes / fuera de alcance

- `src/app/(dashboard)/upgrade/pendiente/page.tsx` sigue con un `catch` genérico
  que se traga cualquier error (no solo `PaymentsNotConfiguredError`). No se
  tocó porque no crasheaba y quedaba fuera del alcance de la tarea. Si se quiere,
  se puede pasar a `getPaymentsAvailability()` para que el mensaje sea explícito.
- `isMockProvider()` (`src/lib/billing/index.ts`) sigue exportada y **lanza** si
  no hay proveedor. Ya no la usa ningún archivo de `src/` (la quedó sin uso
  `upgrade/page.tsx`), pero es una trampa para quien la use a futuro. No se
  borró para no tocar API pública del módulo sin pedido explícito.
- **No se probó con claves reales de Flow ni de Mercado Pago** (no hay
  credenciales en este entorno). El camino con `available: true, isTestMode:
  false` está cubierto por mocks de env, no contra la API de Flow.
- Falta decidir qué pasa con el botón de la home (`src/components/sections/pricing.tsx`)
  y con la sección de pricing cuando no hay pagos: hoy apunta a `/upgrade`, que
  ya avisa, pero no muestra el aviso antes de entrar.
