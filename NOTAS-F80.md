# NOTAS-F80 — Hallazgos bajos de seguridad (portafolio)

Rama: `v2/f80-seguridad-bajos` (base `mejoras/integracion`).
Worktree: `C:\reclu-work\f9`. Sin push. Sin migraciones nuevas. Sin tocar Supabase real.

## Qué se hizo (un commit por punto)

| # | Hallazgo | Archivos | Commit |
|---|----------|---------|--------|
| 1 | Mensajes crudos de Supabase al usuario | `src/app/actions/holdings.ts` | `7733287` |
| 2 | `source` de la cartera siempre `"csv"` | `src/app/actions/holdings.ts`, `src/lib/holding-source.ts` (nuevo) | `e681fad` |
| 3 | `select("*")` en `getUserHoldings` | `src/lib/queries.ts`, `src/lib/types.ts` | `d532aa9` |
| 4 | Flag después de `CRON_SECRET` | `src/app/api/impact/precompute/route.ts`, `src/app/api/impact/alerts/route.ts` | `8472607` |
| 5 | Sin tope global de entregas | `src/app/api/impact/alerts/route.ts` | `bd9d504` |
| 6 | Filtro de recomendaciones con huecos | `src/lib/advice-filter.ts` | `fec9c52` |
| 7 | Lista de tickers en logs | `scrapers/ticker_profile.py` | `447e91e` |
| 8 | Cuerpos de respuesta del proveedor en logs | `src/lib/portfolio-vision.ts`, `src/app/api/holdings/image/route.ts` | `11415d9` |

## Decisiones por punto

### 1. Mensajes genéricos en `actions/holdings.ts`

- Se agregó `logDbError(scope, error)`: registra SOLO `error.code` (`console.error`),
  nunca `error.message`.
- Las 5 ramas que devolvían `error.message` ahora devuelven mensajes genéricos
  en español: "No pudimos guardar tu cartera. Intenta de nuevo." /
  "No pudimos borrar tu cartera. Intenta de nuevo.".
- `friendlyHoldingDbError` conserva el caso conocido del trigger de la 052
  ("límite de posiciones") y cae en genérico para todo lo demás.
- `getOverlapForSymbols` (RPC `get_symbol_holders`) también pasó a loguear solo
  el código.

### 2. `source: "manual" | "csv" | "cartola"`

- Nuevo `src/lib/holding-source.ts` con la lista cerrada (`HOLDING_SOURCES`),
  constantes (`DEFAULT_HOLDING_SOURCE`, `CSV_SOURCE`, `CARTOLA_SOURCE`) y
  `normalizeHoldingSource(value)` que devuelve `null` si el valor no está en la lista.
- `saveUserHoldings(input, source = "manual")`: el `source` se valida en el
  servidor ANTES de tocar la base. Un valor desconocido se rechaza con
  "Origen de cartera inválido." y no se escribe nada.
- `importHoldings` graba `CSV_SOURCE` (era lo correcto ya; ahora es explícito).
- La lista coincide con el CHECK de la migración 050
  (`check (source in ('csv','manual','cartola'))`). NO se creó migración: la 050
  ya permite los tres valores.
- `saveUserHoldings` es la vía "manual" (la usa el editor cuando guarda la
  cartera completa); `saveHoldingsByMode` (`actions/holdings-entry.ts`) ya
  grababa `source: "manual"` y no se tocó.
- Test existente `tests/holdings-save.test.ts` actualizado: el `source` de la
  fila guardada ahora es `"manual"` (antes esperaba `"csv"`).

### 3. `getUserHoldings` sin `select("*")`

- `select("symbol,name,weight,quantity,avg_cost,market,currency")`.
- Verificado con `rg -n getUserHoldings src`: el único consumidor es
  `src/app/(dashboard)/compare/page.tsx`, que usa `symbol`, `name` y `weight`.
  `mi-portafolio/page.tsx` hace su propia consulta (no usa esta función).
- `UserHolding` en `src/lib/types.ts`: `symbol`, `name`, `weight` quedan
  obligatorios; el resto (`quantity`, `avg_cost`, `market`, `currency`) y los
  que ya no se seleccionan (`id`, `user_id`, `source`, `created_at`) quedan
  opcionales, para no romper a la sesión paralela ni a otro consumidor futuro.

### 4. Bandera antes de `CRON_SECRET`

- En las dos rutas (`precompute`, `alerts`) el check de `isNewsImpactEnabled()`
  va PRIMERO. Con la función apagada se responde 404 aunque falte
  `CRON_SECRET` (antes 503) y aunque el secreto sea incorrecto (antes 401).
- Con la bandera encendida, el chequeo de secreto se mantiene igual: 503 sin
  secreto configurado, 401 con secreto incorrecto.

### 5. Tope global de entregas por corrida

- `MAX_DELIVERIES_PER_RUN = 200` en `src/app/api/impact/alerts/route.ts`.
- Cuenta los mensajes entregados en la corrida (correos + Telegram, entre todos
  los usuarios, no por usuario). Lo que no cabe queda **diferido**: no se marca
  como entregado, así que la próxima corrida reintenta el aviso (no se pierde).
- Se agrega `deferred` a la respuesta JSON de la ruta.
- El log es solo el conteo: `console.warn("[reclu] portfolio alerts diferidos
  por tope de corrida:", deferred)`. Nunca la lista de símbolos, noticias ni
  usuarios.

### 6. Filtro de recomendaciones

- Tokens nuevos: `recomendar`, `recomendacion`, `recomendaciones`, `sugerir`,
  `sugiero`, `sugieres`, `sugerimos`, `sugieren`, `conviene`.
- Frases nuevas: `te sugiero`, `te sugerimos`, `les sugiero`, `apuesta por`,
  `apuesten por`, `podrias considerar`, `podria considerar`, `es buena idea`,
  `son buena idea`, `buena idea para`.
- Test con 14 frases que ahora se bloquean + 3 frases neutras que NO deben
  bloquearse.

### 7. Ticker profile sin lista de tickers en logs

- `symbols_from_user_holdings()` ya no se imprime: se agrega
  `missing_report(missing)` que devuelve `{"missing_count": n, "missing_artifact": ruta}`
  y escribe el detalle en un artefacto local FUERA del repo
  (`tempfile.gettempdir()/reclu-ticker-profile-missing.txt`).
- El log quedó `[ticker_profile] faltan en el CSV: {n}`.
- El `--missing` imprime `faltan {n}` y la ruta del artefacto, no los tickers.
- El `summary` ya no trae la lista: trae `missing_count` y `missing_artifact`.
- Test existente `scrapers/tests/test_ticker_profile.py` actualizado
  (`summary["missing"] == ["BABA"]` → `summary["missing_count"] == 1`).

### 8. Logs del proveedor

- `src/lib/portfolio-vision.ts`: cuando OpenRouter responde error, se extrae
  SOLO un código corto y saneado (`providerErrorCode`) del cuerpo JSON y se
  loguea `status` + `código`. El cuerpo de la respuesta ya no se registra.
- `src/app/api/holdings/image/route.ts`: el fallo de consentimiento se loguea
  con `settingsResult.error.code`, no con el mensaje crudo de Supabase.

## Verificación

```bash
# Vitest (93 archivos, 1108 tests)
npm test

# Un archivo suelto
npx vitest run --maxWorkers=1 tests/f80-holdings-errors.test.ts
npx vitest run --maxWorkers=1 tests/f80-holding-source.test.ts
npx vitest run --maxWorkers=1 tests/f80-get-user-holdings.test.ts
npx vitest run --maxWorkers=1 tests/f80-impact-flag-order.test.ts
npx vitest run --maxWorkers=1 tests/f80-alerts-delivery-cap.test.ts
npx vitest run --maxWorkers=1 tests/f80-advice-filter.test.ts
npx vitest run --maxWorkers=1 tests/f80-vision-logs.test.ts

# Pytest (scrapers)
cd scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q \
  tests/test_ticker_profile.py tests/test_ticker_profile_f80.py

# Tipos y lint
npm run typecheck
npm run lint
```

Estado al cierre: `npm test` 1108/1108 OK, `npm run typecheck` sin errores,
`npm run lint` sin errores, pytest 21/21 OK.
NO se corrió `next build` (lo corre el orquestador).

## Pendiente / fuera de alcance (según la tarea)

- Migraciones B1-B3 y el tope de `user_impact_requests`: para después.
- RPC transaccional: fuera de alcance.
- `src/app/api/impact/alerts/route.ts` sigue logueando `error.message` de
  Supabase en las lecturas (`news_items`, `settings`, `profiles`, `holdings`,
  `ticker_profile`, `sent history`, `daily cap`, `upsert`). Quedó fuera de los
  8 puntos listados; si el orquestador lo quiere, es el mismo patrón del punto 1
  (loguear solo `error.code`).
- `src/app/api/chat/route.ts` loguea `error.message` de Supabase: no estaba en
  la lista de la tarea.

## Notas de coordinación

- La tarea avisaba que otra sesión trabaja en paralelo en
  `src/app/actions/holdings.ts` y en los editores de cartera. Los cambios aquí
  sobre `holdings.ts` son puntuales (mensajes de error, parámetro `source`) y no
  reescriben funciones completas. `src/app/actions/holdings-entry.ts` y
  `src/components/my-portfolio/*` NO se tocaron.
- `src/lib/types.ts` se tocó solo en la interfaz `UserHolding` (campos ahora
  opcionales) para no romper consumidores.
