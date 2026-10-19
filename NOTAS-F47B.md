# NOTAS F47-B — recorte del historial en el servidor

Rama `v2/f47b-recorte-servidor`, worktree `C:\reclu-work\f46`. Sin push.

## Qué se hizo

- **`src/lib/backtest-window.ts`** (nuevo, sin `"use client"`, funciones puras):
  - `FREE_BACKTEST_WINDOW_DAYS = 90`.
  - `trimSeriesToWindow(points, days, source?)`: recorta desde el último punto
    de la serie a los últimos `days` días. Si el recorte deja menos de dos
    puntos conserva los dos últimos. `days` nulo/inválido no toca la serie.
  - Excepción: si `isPublicDisclosureSource(source)` (`house_ptr`,
    `senate_ptr`, `oge_278t`), devuelve la serie completa.
  - `filterBacktestCandidates(portfolios, paid)`: para usuarios sin plan de pago
    elimina los portafolios `premium` antes de consultar sus series.
- **`src/app/herramientas/backtest/page.tsx`**:
  - La lista de candidatos pasa por `filterBacktestCandidates` antes de las
    consultas; a un usuario gratis no se le consulta ni se le serializa la serie
    de un portafolio premium. Se eligió **excluirlos** (no mostrarlos
    bloqueados) por ser lo más simple y no dejar datos premium en el payload.
  - Cada serie de portafolio se recorta con `trimSeriesToWindow(..., source)`
    antes de construir las props. Las fuentes de declaración pública van
    completas.
  - Los benchmarks (`^GSPC`/`SPY` e `^IPSA`) también se recortan en el servidor.
  - El bloque de recorte posterior que existía al final de la página se eliminó
    para que el recorte ocurra una sola vez, antes de serializar.
  - Se mantiene `windowDays` en las props solo para el copy y el aviso de
    upgrade; el cliente ya no es la defensa.
- **`tests/backtest-window.test.ts`** (nuevo, 6 tests):
  - recorte a 90 días, casos sin ventana/serie corta, conservación de dos puntos,
    excepción de declaraciones públicas y exclusión/visibilidad de premium.

## Verificación

En verde:

```bash
npm run typecheck
npm run lint
npm test
```

`npm test`: **33 archivos, 358 tests** (352 previos + 6 nuevos).
No se corrió `npx next build` (lo hace el orquestador).

## Pendiente / límites

- Los portafolios premium quedan fuera del selector para usuarios gratis; si
  producto prefiere mostrarlos bloqueados con CTA habría que agregar una prop
  aparte, pero sin mandar su serie.
- La ventana se cuenta desde el último punto de cada serie, no desde hoy. Es
  intencional: datos con rezago (disclosures) siguen mostrando sus últimos 90
  días disponibles.
- Las fuentes públicas se entregan completas por diseño; el payload puede ser
  grande si alguna serie crece mucho. `MAX_SERIES_POINTS = 2000` sigue siendo
  el techo de la consulta.
- `truncateSeriesToDays` en `backtest-form.tsx` sigue existiendo para tests de
  UI, pero el servidor ya no depende de él.

## Cómo probar

```bash
npm run typecheck && npm run lint && npm test
```

Manual: abrir `/herramientas/backtest` sin sesión de pago y revisar en el
payload de RSC que las series no pasan de ~90 días (salvo fuentes
`house_ptr`/`senate_ptr`/`oge_278t`) y que no aparece ningún portafolio premium.
Con plan de pago deben aparecer todos y el historial completo.

## Commit

- `a7c9916` — `feat: trim backtest history on server`
