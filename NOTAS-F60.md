# F60 — Guardar posiciones con cantidad y costo

Rama: `v2/f60-guardar-posiciones` (base `mejoras/integracion`, con F58/050, F59/051, F69 y F74/052).
Sin push. No se tocó Supabase real ni `.env`.

## Hecho

### `src/lib/validation.ts`
- `userHoldingSchema` ahora acepta:
  - `quantity` >= 0 (opcional)
  - `avg_cost` >= 0 (opcional)
  - `currency`: `"USD" | "CLP"` (default `"USD"`)
  - `market`: `"US" | "CL"` (opcional)
  - `broker`: texto, máximo 60 caracteres (opcional)
  - `weight` 0–100 (sigue siendo válido y tiene prioridad si viene).
- Regla: si no viene `weight`, deben venir `quantity` y `avg_cost`; el peso se
  expresa como **valor de costo** (`quantity × avg_cost`) y `saveUserHoldings`
  lo normaliza a 100 junto con el resto de la cartera. Así se pueden mezclar
  posiciones por peso y por costo sin inventar precios de mercado.
- Un holding con solo `quantity` (sin costo) o solo `avg_cost` se rechaza.

### `src/app/actions/holdings.ts` — `saveUserHoldings`
- **Upsert** en `user_holdings` con `onConflict: "user_id,symbol"` (índice
  único de la 052) en vez de borrar todo e insertar.
- Borra **solo** los símbolos que ya no vienen en la entrada (`.delete().eq(user_id).in("symbol", removed)`).
- Deduplica símbolos repetidos antes del upsert (Postgres no permite tocar la
  misma fila dos veces en un `ON CONFLICT`): suma cantidades y pondera el costo
  promedio por cantidad.
- Tope del plan con `canAddPositions` / `portfolioLimitsFor` de `plans.ts`
  (F74), incluyendo la prueba vigente como Pro. Solo cuentan las posiciones
  nuevas; actualizar una existente en el tope está permitido. Error en español.
- Con `MY_PORTFOLIO_ENABLED === "true"` exige `consent_at` no nulo en
  `user_portfolio_settings`; si falta, devuelve un error que pide el
  consentimiento (menciona «Ajustes»). Con el flag apagado no consulta la tabla.
- Siempre usa `createClient()` de `src/lib/supabase/server.ts` (sesión + RLS),
  nunca service role.
- Traduce el raise del trigger de tope (`límite de posiciones`) a un mensaje
  amigable.

### Tests
- `tests/holdings.test.ts`: casos nuevos de esquema (quantity+costo, CLP/mercado/
  corredora, prioridad de `weight`, negativos, cantidad sin costo, enums y
  largo de `broker`). Primero se escribieron y fallaron por `quantity`, luego
  se implementó (TDD).
- `tests/holdings-save.test.ts` (nuevo, Supabase mockeado):
  - upsert con `onConflict: "user_id,symbol"` y payload con cantidad/costo/moneda.
  - peso por valor de costo (25/75).
  - conserva posiciones no enviadas y borra solo las quitadas.
  - no borra nada si la cartera no se redujo.
  - deduplica símbolos repetidos.
  - tope Gratis (10), actualización en el tope y prueba vigente = Pro.
  - consentimiento: falta → error; presente → guarda; flag apagado → no consulta.

## Pendiente / fuera de alcance
- `importHoldings` (CSV, F45) sigue con delete + insert y convierte cantidad a
  peso por cantidad, no por costo. F61 debe alinearlo (precio promedio y moneda).
- La UI (`portfolio-manager.tsx`) todavía envía solo `weight`; el formulario de
  cantidad/costo es F62.
- No hace falta migración nueva: las columnas vienen de 050 y el índice único +
  trigger de tope de 052.
- No existía `scrapers/data/v2/F60/`; la tarea no requería datos externos.

## Cómo probar
```bash
npx vitest run --maxWorkers=1 tests/holdings.test.ts tests/holdings-save.test.ts
npm run lint
npm run typecheck
npm test
```
Verificación ejecutada: los 68 archivos / 813 tests pasan; lint y typecheck limpios.
No se corrió `next build` ni `npm run dev` (los corre el orquestador).

Commit local: `feat: upsert user holdings with quantity and cost`.
