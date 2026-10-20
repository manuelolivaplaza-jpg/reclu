# SD2-B — La app lee series, métricas y alertas por las funciones del muro (M6/M7)

Rama `v2/sd2b-muro-app` (desde `mejoras/integracion`). Sin push, sin Supabase
real, sin `.env*`, sin servidores. Depende de la migración `048` de SD2-A.

## Hecho

### Series y métricas (`src/lib/queries.ts`, `src/lib/performance-queries.ts`)

- **`getPerformance`** ahora llama `rpc("get_portfolio_performance", {
  p_portfolio })` con el cliente del usuario. Acepta `{ role, source }` y
  vuelve a recortar a **90 días** en el servidor para anon/free (defensa en
  profundidad; las declaraciones públicas siguen completas por
  `trimSeriesToWindow`). Si la RPC no existe o falla, devuelve `[]`: no hay
  lectura directa de la tabla para servir series a usuarios.
- **`getPrecomputedMetrics`** usa `rpc("get_portfolio_metrics")` y filtra
  `period = TOTAL` + benchmark en memoria. Un portafolio premium devuelve
  `null` para anon/free (la RPC no entrega filas).
- **`getPerformanceSeriesDirect`** usa la RPC de series; el cálculo al vuelo
  del panel de rendimiento ya no toca `portfolio_performance` directo.
- **`getBeatTheMarketRanking`** (ranking de explore, ranking honesto, widgets
  y páginas de socio) pide las métricas **por portafolio** con la RPC (lotes de
  8). Si el plan no es pro/elite, ni siquiera consulta los portafolios premium.
- **Backtest** (`src/app/herramientas/backtest/page.tsx`): la serie se pide por
  `get_portfolio_performance`; se mantiene `trimSeriesToWindow` (90 días para
  planes gratis) antes de serializar al cliente y se conserva
  `filterBacktestCandidates` para no pedir premium a no pagos.

### Alertas (`src/lib/queries.ts` y consumidores)

- **`getAlerts`** usa `rpc("get_alerts", { p_portfolio, p_limit })`. Acepta
  `portfolioIds` para juntar alertas de varios portafolios (dashboard) sin
  leer la tabla. Aplica otra vez el recorte del rol (3 anon / 10 free / todo
  pago) y **borra `summary`** para anon/free aunque la RPC lo devolviera.
- **Página `/alerts`**: eliminó el `select("*, portfolio:...")` directo (la
  048 revocó el privilegio sobre `summary`, así que ese select falla). Usa
  `getAlerts` y enriquece el portafolio con el catálogo.
- **Dashboard**: las alertas de portafolios seguidos se piden por RPC con
  `portfolioIds`; el fallback global también usa la RPC.
- **`/portfolio/[slug]`**: las alertas siguen llegando recortadas por rol. El
  resumen AI se renderiza solo si viene; si no, aparece “Resumen AI disponible
  en Pro”. Se pasa `{ role, source }` a `getPerformance`.
- **`src/lib/chat-guard.ts`** y **`src/lib/ticker-queries.ts`** también leían
  `alerts` directo (`select("*")` / `select("title, summary")`), lo que falla
  tras la 048. Ahora usan la RPC.
- **`/api/explain-alert`**: pide columnas explícitas sin `summary` y toma el
  resumen de `get_alerts` (solo pro/elite). Sigue explicando únicamente
  alertas publicadas de la base (M8).

### Ranking (`src/app/ranking/page.tsx`, `src/lib/ranking.ts`)

- Si el portafolio es premium y el usuario no paga, la fila se muestra en una
  sección **“Métricas disponibles en Pro”** con candado, nombre y benchmark,
  **sin cifras** (retorno, exceso, Sharpe ni fecha de corte). No se marca como
  “sin datos”: el dato existe, está tras el muro. La lógica pura conserva la
  bandera `locked` en `RankingSourceInput`/`RankedSource`.

### Tests (`tests/muro-app.test.ts`)

8 tests con `rpc` mockeada (sin Supabase real):

- free no recibe la serie de un portafolio premium;
- free recibe solo 90 días aunque la RPC devuelva 150;
- pro recibe la serie completa;
- free no recibe métricas premium y sí las de un portafolio no premium;
- anon recibe máximo 3 alertas y `summary = null`;
- pro recibe el resumen AI;
- una fila premium bloqueada queda sin cifras y fuera del ranking.

## Verificación (local, ya corrida)

```
npm run typecheck                 # ok
npm run lint                      # ok
npx vitest run --maxWorkers=1     # 629 ok (54 suites, incluye muro-app)
```

No se ejecutó `next build` ni `npm run dev` (los corre el orquestador). No se
aplicó nada en Supabase real.

## Pendiente / notas para el orquestador

1. **La 048 debe estar aplicada** para que las RPC existan. Si no está, la app
   falla cerrada: series, métricas y alertas se ven vacías (no hay lectura
   directa de respaldo). Es intencional para no saltarse el muro.
2. `getBeatTheMarketRanking` hace una RPC por portafolio activo (lotes de 8).
   Con el catálogo actual es aceptable; si crece mucho, conviene una RPC
   agregada en una migración futura.
3. El backtest sigue leyendo `benchmark_prices` directo (dato público, fuera
   de M6).
4. `/explore` pide `getAlerts` sin rol explícito para el radar de alertas: la
   RPC ya recorta por `auth.uid()` (3/10/p_limit). El resto de las páginas sí
   pasan el rol y aplican el recorte otra vez.

## Cómo probar

1. Con Supabase y la 048 aplicada:
   - anon: `/portfolio/<slug-premium>` no muestra serie ni métricas; `/alerts`
     no es accesible (auth), pero el feed público/acciones muestra ≤3 alertas
     sin resumen; `/ranking` lista los premium con candado y sin cifras.
   - free: serie de portafolios no premium limitada a 90 días; métricas
     premium ausentes; alertas ≤10 sin resumen.
   - pro/elite: serie completa, métricas premium y `summary` visible.
2. Sin Supabase (modo demo): el sitio sigue funcionando con `demo-data` y los
   rótulos de demo.
3. Rápido: `npx vitest run --maxWorkers=1 tests/muro-app.test.ts`.
