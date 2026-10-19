# NOTAS F47 — Backtester sin código: página /herramientas/backtest

Rama `v2/f47-backtester-ui`, worktree `C:\reclu-work\f46`. No hubo push.

## Qué se hizo

- `src/app/herramientas/backtest/page.tsx` — página pública de la herramienta.
  - Lee la sesión con `getProfile()` y decide la ventana **en el servidor**:
    - anónimo y plan gratis: últimos **90 días**;
    - Pro/Elite: historial completo disponible.
  - Carga hasta **32 portafolios** (los más seguidos, según `getPortfolios`) y su
    serie `portfolio_performance.value_pct` en lotes de 8 consultas.
  - Carga `^GSPC` (con respaldo en `SPY`) e `^IPSA` desde `benchmark_prices`.
  - Sin Supabase configurado usa `demoPerformance` y muestra `DemoBadge`.
  - `await connection()` + `export const instant = false` (Next 16).
  - `<LegalNotice kind="simulation" />` y una sección de metodología.
- `src/components/backtest-form.tsx` — formulario cliente.
  - Selección de 1 a 5 portafolios (checkbox, búsqueda y contador).
  - Pesos en porcentaje; al agregar/quitar se reparten en partes iguales
    (34/33/33, etc.) y hay botón para volver a repartir.
  - Rebalanceo mensual o trimestral.
  - Benchmark automático: IPSA si toda la selección es chilena; si no, S&P 500.
    El usuario puede cambiarlo.
  - Curva propia (combinación en negro, benchmark punteado gris), tooltip y
    métricas: retorno total, CAGR, máxima caída, volatilidad, Sharpe y exceso
    contra el benchmark. Muestra `methodLabel`, `entryLabel`, notas, motivos y
    el disclaimer de `runBacktest`.
  - Aviso de ventana gratuita con enlace a `/signup?plan=pro`.
- `tests/backtest-ui.test.ts` — 8 tests de la lógica de pantalla: tope de 5,
  pesos iguales, conversión a decimales, benchmark sugerido, recorte de
  ventana, combinación con `runBacktest`, normalización y selección vacía.

Se reutilizan `runBacktest` (F46), `getPortfolioPerformance`/queries existentes,
`LegalNotice` (F16) y los tokens de `docs/hermes-diseno.md`. No se tocó
`src/lib/queries.ts`, Supabase real ni migraciones.

## Variables nuevas

Ninguna. No se leyó ni modificó `.env*`.

## Verificación

En verde:

```bash
npm run typecheck
npm run lint
npm test
```

`npm test`: **32 archivos, 352 tests** (344 previos + 8 de este frente).
No se corrió `npx next build`: lo ejecuta el orquestador según la nota.

## Deudas y límites

- `scrapers/data/v2/F47/` no existe en este worktree; la tarea no necesitó datos
  locales para la UI. Si el orquestador esperaba fixtures ahí, faltan.
- El formulario lista como máximo 32 portafolios para no disparar decenas de
  consultas por request. Si el catálogo crece, conviene una consulta batch o un
  endpoint paginado.
- La "ventana completa" de pago depende de `MAX_SERIES_POINTS = 2000` y del
  límite de filas de PostgREST/Supabase (por defecto 1000). Si una serie supera
  ese tope, el historial completo real requiere paginar en `range()`.
- No se usó `Comparison` de `src/components/charts/comparison.tsx` porque su
  leyenda fija "S&P 500" rotularía mal al IPSA. El gráfico local replica el
  mismo lenguaje visual (negro 2px vs. gris punteado 1,5px).
- Los portafolios premium no se filtran en el backtest: la única restricción
  pedida fue el largo del historial. Confirmar si el producto quiere además
  reservar la herramienta a planes de pago.
- El modo demo genera series ilustrativas con `demoPerformance` y las rotula
  como "datos de ejemplo". No son cifras reales.
- Sin comisiones, dividendos, impuestos ni tipo de cambio, igual que F46.

## Cómo probar

```bash
npm run typecheck && npm run lint && npm test
```

Manual (cuando el orquestador levante el server): abrir
`/herramientas/backtest`.

- Sin Supabase: se ven los `DemoBadge`, dos portafolios preseleccionados y una
  curva contra el S&P 500 de ejemplo.
- Con Supabase: elegir 1–5 portafolios, cambiar pesos y rebalanceo, y verificar
  que la curva y las métricas cambian.
- Anónimo/gratis: la ventana dice "Últimos 90 días" y aparece el bloque de
  upgrade. Pro/Elite: dice "Historial completo" y no aparece el bloque.

## Commit

- `d5c93c3` — `feat: add interactive portfolio backtest page`
