# NOTAS-F9 — Que /accion/[symbol] funcione con el muro de pago de la 012

Rama: `mejoras/f9-fix-accion`. Estado: **parcial, con avance commiteado**.
El run se cortó por presupuesto de tiempo antes de terminar todo el frente;
abajo queda el detalle exacto de lo hecho y lo pendiente para el próximo run.

## Hecho (commiteado)

1. `supabase/migrations/015_holders_por_simbolo.sql`
   - Función `public.get_symbol_holders(p_symbol text)`:
     `security definer`, `set search_path = ''`, `stable`, `language sql`,
     idempotente (`create or replace`), con `grant execute to anon, authenticated`
     y bloque `-- rollback` comentado.
   - Devuelve por cartera activa que tenga el símbolo en su `as_of` más
     reciente: `portfolio_id, slug, name, category, premium, weight, as_of,
     previous_weight, first_seen, holding_name, price_current, currency,
     return_pct`.
   - Respeta el muro: `row_number()` por `(portfolio_id, as_of)` ordenado por
     `weight desc, id` y solo filas con `rank <= holdings_limit_for_plan(
     current_user_plan())` (null = sin límite para pro/elite); carteras
     `premium` solo para planes pagados. Igual semántica que
     `get_portfolio_holdings` de la 012.
   - Extra sobre el pedido mínimo: `first_seen` (para la columna "Desde" de la
     página sin segunda consulta) y `price_current`/`currency` (para el
     `displayName`/precio del overview).

2. `src/lib/ticker-queries.ts` (commits `5b9b790` y anteriores)
   - Nuevo tipo exportado `SymbolHolderRow`: fila de "quién tiene X"
     independiente del origen, con `rankInPortfolio: number | null`.
   - Nueva función pura `trimHoldersForRole(rows, role)`: aplica la misma
     regla que la RPC (premium solo con plan pago; `rankInPortfolio`
     ≤ `HOLDING_LIMITS[role]`). Si `rankInPortfolio` es null el origen ya
     recortó (RPC), no se corta de más. Premium se re-verifica siempre.
   - Import agregado: `HOLDING_LIMITS`, `canViewPremium`, `AccessRole` desde
     `@/lib/access` (archivo ya existente, sin tocarlo).

## Pendiente (para el próximo run de F9)

1. **Reescribir la parte "Supabase real" de `getTickerOverview()` en
   `src/lib/ticker-queries.ts` (~líneas 221-288)**: hoy sigue leyendo
   `from("holdings")` directo (se rompe con la 012 aplicada). Plan ya
   diseñado:
   - Camino 1: `supabase.rpc("get_symbol_holders", { p_symbol: symbol })`
     → mapear filas a `SymbolHolderRow` con `rankInPortfolio: null`
     (la RPC ya recortó) → `trimHoldersForRole` solo por defensa.
   - Camino 2 (RPC no existe / error): `createAdminClient()` de
     `src/lib/supabase/admin.ts`; si hay admin, leer holdings del símbolo +
     portafolios activos y calcular rank por `(portfolio_id, as_of)` en
     TypeScript, luego `trimHoldersForRole(rows, roleFor(await getProfile()))`
     con `roleFor`/`HOLDING_LIMITS` de `src/lib/access.ts`. Nunca enviar al
     navegador filas fuera del recorte.
   - Camino 3 (sin service key): la lectura actual + `trimHoldersForRole`
     (y demo rotulada como ya hace).
   - `summarizeHolders` y la forma de `TickerOverview` NO cambian: convertir
     `SymbolHolderRow` → `RawHoldingRow` + metadatos y seguir usando el
     mismo pipeline. `firstSeen` de la RPC reemplaza el cálculo por historial.
   - La página `src/app/accion/[symbol]/page.tsx` no requiere cambios
     (consume `TickerOverview`, que mantiene su forma). `instant = false` ya
     está.
2. **Verificar el resto del repo con la 012**: `rg 'from\("holdings"\)|from\("portfolio_snapshots"\)' src` hoy solo marca `queries.ts` (ya cubierto por F6 con RPC + admin) y `ticker-queries.ts` (este frente). No hay otras lecturas directas en `src/`; rankings/radar/compare ya pasan por `getAllHoldingsAdmin` o RPC.
3. **Tests** `tests/ticker-access.test.ts` para `trimHoldersForRole`:
   premium oculto para anon/free y visible para paid; rank 1..5 visible con
   anon, rank 6+ oculto; rank 6..10 visible con free; rank >10 oculto con
   free; todo visible con paid (`Infinity`); `rankInPortfolio: null` no se
   corta de más (camino RPC).
4. **Fila 015 en `supabase/migrations/README.md`** (pendiente por corte).
5. `npm run lint && npm run typecheck && npm test && npm run build` — NO
   ejecutados en este run por presupuesto; lo commiteado se escribió con
   typecheck mental contra los archivos leídos (`access.ts`, `types.ts`,
   `queries.ts`). Ejecutarlos es lo primero del próximo run.

## Para Manu

- Aplicar en orden (SQL Editor de Supabase): `012_muro_pago.sql` (si falta) →
  `015_holders_por_simbolo.sql`. Es idempotente: se puede re-ejecutar.
- Sin variables de entorno nuevas ni cuentas externas: la 015 usa solo
  helpers de la 012 y tablas existentes. El respaldo del server usa la
  `SUPABASE_SERVICE_ROLE_KEY` que ya documentan `.env.example` y `admin.ts`.
- Pendiente de este frente antes de merge: ítems 1-5 de arriba.
