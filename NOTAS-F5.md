# NOTAS F5 — Rendimiento auditable y "ajusta tu cartera"

Frente F5 en `mejoras/f5-rendimiento`. Meta: que cada portafolio muestre su
rendimiento vs S&P 500 e IPSA con Sharpe y máxima caída, metodología pública,
ranking honesto, panel de alineación en /compare y gráfico incrustable.

## Qué hice (archivos)

### Lógica pura (con tests Vitest)
- `src/lib/performance.ts` — retorno acumulado, CAGR (≥180 días), ventanas
  1M/3M/YTD/1A, volatilidad anualizada (√252, muestral n−1), Sharpe
  (rf=4% configurable, ≥30 retornos), máxima caída, exceso vs benchmark,
  alfa simple, win rate. Datos insuficientes => `null` + motivo en español.
- `src/lib/alignment.ts` — similitud % entre la cartera del usuario y un
  portafolio objetivo (intersección ponderada de pesos normalizados),
  faltantes, sobrantes, diferencias de peso y `shouldAlertAlignment()`
  reutilizable por la edge de alertas (umbral configurable por follow).
- `tests/performance.test.ts` (30 tests) y `tests/alignment.test.ts` (13).

### Datos
- `supabase/migrations/011_rendimiento.sql` — `benchmark_prices(symbol,date,close)`
  y `portfolio_metrics(portfolio_id, as_of, period, return_pct,
  benchmark_symbol, benchmark_return_pct, sharpe, max_drawdown, volatility,
  method, data_points)` + columna `follows.alignment_alert_threshold`
  (default 60) + vista `v_beat_the_market`. Lectura pública, escritura solo
  service role. Idempotente.
  - DECISIÓN: el enunciado pedía llamar a la tabla de métricas
    `portfolio_performance`, pero ese nombre ya existe en el schema (serie
    diaria `portfolio_id,date,value_pct`, usada por performance.py y
    queries.ts). Para no romper nada la llamé `portfolio_metrics` y la serie
    diaria existente se reusa como fuente.
- `scrapers/benchmarks.py` (nuevo) — descarga ^GSPC y ^IPSA (con fallbacks
  SPY / IPSA.SN) desde Yahoo Finance a `benchmark_prices`. Mismo contrato que
  prices.py, con `--dry-run` y `--symbols/--days`.
- `scrapers/compute_returns.py` — cambio MÍNIMO: agregué
  `compute_benchmark_metrics()` (llamada desde main) que para cada portafolio
  activo calcula métricas vs su benchmark natural (CL→IPSA, resto→S&P 500) y
  las upsertea en `portfolio_metrics` (TOTAL + ventanas). Nada existente se
  reescribió.

### UI
- `src/app/metodologia/page.tsx` — metodología completa y pública: datos de
  partida, fórmulas de retorno/riesgo, benchmarks, por qué los políticos son
  estimaciones (rangos PTR, retraso de declaración), límites y sesgos
  (rebalanceo, dividendos, FX, supervivencia), aviso legal.
- `src/components/performance-panel.tsx` — panel servidor-renderizado con
  curva portafolio (negro 2px) vs benchmark (gris punteado), línea base 100,
  6 métricas (retorno, vs índice, Sharpe, máx. caída, volatilidad, % días que
  le gana), razones cuando falta algo, etiqueta "estimado"/"datos de ejemplo",
  enlace a metodología. Insertado en `src/app/portfolio/[slug]/page.tsx` con
  un bloque de ~12 líneas (otros frentes tocan esa página; cambio acotado).
- `src/components/beat-market-ranking.tsx` + `explore-rankings.tsx` — ranking
  "Le ganan al mercado" en /explore, ordenable por exceso de retorno o Sharpe
  (toggle cliente), con Sharpe visible y enlace a metodología. Solo aparece
  con datos reales precalculados.
- `src/lib/performance-queries.ts` — acceso a datos propio (NO toqué
  queries.ts compartido): series de benchmark, métricas precalculadas, cálculo
  al vuelo como fallback y ranking.
- `src/components/alignment-panel.tsx` — en /compare, bajo el administrador de
  cartera: selector de objetivo, % de similitud, te falta / te sobra,
  diferencias de peso, aviso al caer bajo el umbral, texto legal. Insertado
  con cambio mínimo en `src/app/(dashboard)/compare/page.tsx`.
- `src/app/embed/[slug]/page.tsx` + `src/components/embedded-performance-chart.tsx`
  — gráfico incrustable apto para iframe con marca "Datos de reclu.cl",
  robots noindex. `next.config.ts`: `/embed/*` recibe CSP con
  `frame-ancestors *` (sin X-Frame-Options); el resto del sitio mantiene
  `frame-ancestors 'none'` + DENY.

## Verificación ejecutada
- `npx vitest run tests/performance.test.ts tests/alignment.test.ts`: 43/43.
- Suite completa `npm test`: ver NOTAS abajo (correr al final).
- `npx tsc --noEmit`: solo el error conocido de `LayoutProps` en layout.tsx
  (global generado en build; el build real pasa).
- `npx eslint <archivos nuevos>`: limpio.
- `uv run python -m py_compile` sobre benchmarks.py y compute_returns.py: OK.
- Smoke test offline de la lógica Python (series sintéticas): CAGR, drawdown,
  alineación por fecha, _safe_date, filtrado de basura: todos OK.

## Qué debe configurar Manu

1. Migración (en orden, en el SQL Editor de Supabase):
   `supabase/migrations/011_rendimiento.sql` (idempotente).
2. Variables de entorno: NINGUNA nueva obligatoria. Los benchmarks usan las
   credenciales de Supabase ya existentes. Opcionales para el scraper
   (documentadas en .env.example): `BENCHMARK_SYMBOLS`, `BENCHMARK_DAYS`.
3. Backfill manual (cuando quieras datos reales):
   - `cd scrapers && python benchmarks.py` (llena benchmark_prices; también
     `--dry-run` para probar sin escribir).
   - `python compute_returns.py` (actualiza return_pct de holdings y recalcula
     portfolio_metrics).
   - Idealmente después de `prices.py` y `performance.py` en el pipeline.
4. Cuentas externas: ninguna nueva (Yahoo Finance es gratis, sin API key).
5. El gráfico incrustable se publica en `/embed/<slug>`; el medio lo usa con
   `<iframe src="https://reclu.cl/embed/pelosi-tracker" height="260">`.

## Pendiente / decisiones abiertas
- La edge `send-alerts` (frente F4) puede usar `shouldAlertAlignment()` con el
  umbral de `follows.alignment_alert_threshold` para avisar "tu cartera se
  alejó de X". No la toqué (regla del enunciado); la migración deja la columna
  lista y el JSDoc de la función documenta el flujo.
- `win_rate` y `alpha_pct` quedan null en el backfill del scraper (el cálculo
  al vuelo en la UI sí los calcula cuando hay series). Se pueden llenar con un
  backfill posterior si se quieren en ranking.
- El selector del panel de alineación muestra el catálogo completo; una mejora
  natural es priorizar los portafolios seguidos (follows) del usuario.
- La curva del embed usa la serie del portafolio sin benchmark si este no tiene
  datos: honesto pero menos útil; con benchmark_prices poblado se ve la
  comparación completa.
