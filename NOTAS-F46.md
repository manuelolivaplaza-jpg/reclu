# NOTAS F46 — Backtester sin código: lógica

Frente F46 en `v2/f46-backtester-logica`. Lógica pura para mezclar portafolios
que ya tienen serie de rendimiento, con pesos y rebalanceo mensual o
trimestral, y compararla contra SPY o el proxy del IPSA. No hay UI, ni
migración, ni variables de entorno nuevas.

## Qué hice

- `src/lib/backtest.ts` — `runBacktest({ series, weights, rebalance, benchmark })`.
  Devuelve la curva (base 100), la curva del benchmark alineada y las métricas
  de `computePerformanceMetrics`. No lee Supabase ni la red.
- `tests/backtest.test.ts` — 16 tests. La suite completa queda en 229.

### Contrato

- `series` es un mapa id → puntos. Por defecto cada `value` es el retorno
  acumulado en % de `portfolio_performance.value_pct` (0 = base). Para precios
  o índices ya en nivel, pasar `seriesScale: "level"`.
- `benchmark` son cierres (`benchmark_prices.close`) de SPY o del proxy del
  IPSA. `benchmarkScale: "cumulative_pct"` si el benchmark ya viene en retorno
  acumulado. `benchmarkSymbol` (`"SPY"`, `"^IPSA"`) solo rotula.
- `weights` son pesos objetivo por id. Los positivos se normalizan para sumar
  1. Un peso que no tiene serie se ignora. Una serie sin peso no entra. Peso
  negativo: no hay curva. No se simulan cortos.
- La ventana empieza el día en que todas las series ya tienen un nivel y
  termina cuando se acaba la más corta. Si a una serie le falta una fecha, se
  mantiene el último nivel. No se inventa un retorno ni se alarga una serie
  muerta.
- `rebalance: "monthly" | "quarterly"`. El ajuste es al cierre del primer
  punto del mes o del trimestre, después del retorno de ese día. Entre medias
  los pesos flotan con el precio.
- Rótulo por defecto: `entrada a la fecha de publicación`
  (`PUBLICATION_ENTRY_LABEL`). Cambiar `entryLabel` (por ejemplo a
  `entrada a la fecha de la operación`) no mueve la curva: la serie que entra
  ya tiene que estar observada en la fecha de publicación. Esta función no
  adelanta nada a la fecha de operación.
- `BACKTEST_DISCLAIMER`: simulación histórica, sin órdenes y sin
  recomendación. Sin comisiones ni dividendos.
- Con datos de menos, `curve` queda vacía y `reasons` dice por qué. Las
  métricas que no alcanzan siguen el contrato de F5: `null` y motivo, sin
  números inventados.

## Variables nuevas

Ninguna.

## Deudas

- TODO(F16): no existen `src/lib/legal.ts` ni
  `src/components/legal/legal-notice.tsx`. El aviso vive en
  `BACKTEST_DISCLAIMER` para que la UI lo muestre cuando F16 esté. No creé
  esos archivos.
- No hay pantalla. Quien arme la UI debe mostrar `methodLabel`, `entryLabel`,
  `notes`, `reasons` y el disclaimer junto a la curva. Español, sin asesorar
  ni insinuar una orden.
- Fase 0: no re-chequeé las migraciones 008/009/014–021. Este frente no tiene
  migración ni depende de esas tablas.
- `npm run typecheck` en un árbol sin `.next/types` falla solo por
  `LayoutProps` en `src/app/layout.tsx` (conocido: el tipo lo genera el build).
  Después del paso de TypeScript de `npx next build`, `npm run typecheck`
  termina en verde.
- `npx next build` compila y pasa su TypeScript, y luego corta el prerender
  de `/accion/[symbol]` (`/accion/aapl`): `timeAgo` llama `Date.now()` en
  `src/lib/utils.ts`. La página declara `instant = false` pero no hace
  `await connection()`, que es lo que sí hace `/portfolio/[slug]`. Es
  anterior a F46. No lo toqué: no está en los archivos de este frente.

## Cómo probar

```bash
npx vitest run tests/backtest.test.ts
npm test
npm run lint
```

Ejemplo para la UI que venga después:

```ts
import { runBacktest } from "@/lib/backtest";

const result = runBacktest({
  series: { pelosi: serieValuePct, renta4: otraSerie },
  weights: { pelosi: 0.6, renta4: 0.4 },
  rebalance: "monthly",
  benchmark: cierresSpy,
  benchmarkSymbol: "SPY",
});
// result.curve, result.benchmarkCurve, result.metrics
// result.entryLabel === "entrada a la fecha de publicación"
```

Para niveles en vez de `value_pct`, agregar `seriesScale: "level"`.
Para el IPSA, pasar los cierres del proxy y `benchmarkSymbol: "^IPSA"`.
