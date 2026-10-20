# SD2-A — Muro en la base para series, metricas y alertas (M6/M7)

Rama `v2/sd2a-muro-db` (desde `mejoras/integracion`). Solo SQL + test de texto.
Sin push, sin Supabase real, sin `.env*`, sin servidores.

## Hecho

- **`supabase/migrations/048_muro_series_alertas.sql`** (idempotente):
  - `portfolio_performance` y `portfolio_metrics`: se eliminan las policies de
    lectura publica (`performance public read`, `portfolio_metrics public read`)
    y se crean policies `* non premium read` que solo dejan ver filas de
    portafolios activos con `not p.premium` (via `exists` sobre `portfolios`).
  - RPC `security definer` + `set search_path = ''`:
    - `get_portfolio_performance(uuid)`: premium + plan no pago => vacio;
      anon/free => ultimos 90 dias de la serie (desde su ultimo punto, igual
      que `trimSeriesToWindow`); pro/elite => completa. Excepcion legal:
      `oge_278t` / `house_ptr` / `senate_ptr` se entregan completos.
    - `get_portfolio_metrics(uuid)`: premium + plan no pago => vacio; resto =>
      todas las filas.
    - `get_alerts(uuid default null, int default 20)`: solo `is_published`;
      premium + plan no pago => ninguna; `summary` en null salvo pro/elite;
      tope 3 (anon) / 10 (free) / `p_limit` (pago, max 100).
    - `revoke all ... from public` + `grant execute ... to anon, authenticated`.
  - `alerts`: policy de lectura solo para publicadas de portafolios activos no
    premium; `summary` fuera del privilegio de lectura directa
    (`revoke select (summary)` + `revoke select` de tabla + `grant select` por
    columnas sin `summary`); vista `public.alerts_public`
    (`security_invoker = true`) sin `summary`.
  - Extra M6: `v_beat_the_market` (011) pasa a `security_invoker = true` para
    que no saltee la RLS de `portfolio_metrics` (guardado con `to_regclass`).
  - Bloque `-- ROLLBACK` comentado al final.
- **`supabase/migrations/README.md`**: fila 21 del orden + seccion 048.
- **`scrapers/tests/test_migracion_048.py`**: test de texto (sin red ni DB):
  `security definer` + `search_path = ''` en las 3 funciones, grants, recorte
  de 90 dias, topes de alertas, `summary` fuera de la lectura directa, vista
  `alerts_public`, ausencia de `using (true)` y rollback completo. 8 tests.

## Verificacion (local, ya corrida)

```
uv run --no-project python scrapers/tests/test_migracion_048.py   # 8 ok
uv run --no-project --with pglast python -c "import pglast; \
  print(len(pglast.parse_sql(open('supabase/migrations/048_muro_series_alertas.sql', encoding='utf-8').read())))"
                                                                  # 25 statements (parser real de Postgres)
npm run lint                                                      # ok
npm run typecheck                                                 # ok
npx vitest run --maxWorkers=1                                     # 605 ok (52 suites)
```

Nota: no hay Python global en esta PC; el test se corre con `uv` (Python 3.11
administrado por uv). En CI alcanza `python -m pytest scrapers/tests/test_migracion_048.py`.

No se aplico nada en Supabase ni se ejecuto el SQL contra una base real.

## Pendiente / para SD2-B (importante)

1. **`select("*")` sobre `alerts` queda roto para anon/authenticated** por el
   `revoke select (summary)`: PostgREST devuelve *permission denied for column
   summary*. `getAlerts` en `src/lib/queries.ts:278` usa
   `select("*, portfolio:portfolios!inner (...)")`. SD2-B debe:
   - listar columnas explicitas sin `summary` (o leer `public.alerts_public`), y
   - pedir el resumen por `rpc("get_alerts", { p_portfolio, p_limit })` solo
     cuando el plan sea pro/elite (o dejar que la RPC lo nule para anon/free).
   Mientras no se cambie, el fallback actual devuelve `[]` (el error se loguea
   como warning), asi que el listado de alertas se ve vacio en modo Supabase.
2. **`getPerformance` (`src/lib/queries.ts:137`)** sigue leyendo
   `portfolio_performance` directo. Para premium devolvera `[]` (correcto por
   el muro) pero para anon/free no aplica el recorte de 90 dias por REST (el
   recorte de hoy es solo en la RPC). SD2-B deberia llamar
   `rpc("get_portfolio_performance", { p_portfolio })` (y `get_portfolio_metrics`
   donde corresponda).
3. **`portfolio_metrics` se lee directo en `src/lib/performance-queries.ts`**
   (incluido el ranking): para anon/free las filas premium desaparecen de esas
   paginas. SD2-B debe decidir: usar `rpc("get_portfolio_metrics", ...)` por
   portafolio, o declarar explicitamente que ciertos agregados son publicos
   (la revision de seguridad ya lo marca como decision de M6).
4. Las edge functions y scrapers usan `service_role` (bypassa RLS y privilegios
   de columna): no requieren cambios.

## Como probar el SQL (cuando haya base)

1. Aplicar despues de 012 y 011 en el SQL Editor.
2. Re-ejecutar 048 una segunda vez: no debe fallar (idempotente).
3. Como `anon`:
   - `select * from portfolio_performance` => solo portafolios no premium.
   - `select * from portfolio_metrics` => solo no premium.
   - `select * from alerts` => error de columna `summary`; `select * from
     alerts_public` => sin `summary` y solo no premium.
   - `select * from get_alerts()` => max 3, `summary` null.
   - `select * from get_portfolio_performance('<uuid premium>')` => 0 filas.
4. Como usuario free: `get_alerts()` => max 10; serie => ultimos 90 dias.
5. Como pro/elite: serie completa, metricas premium, `summary` no nulo y
   `p_limit` respetado (tope 100).
