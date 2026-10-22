# NOTAS-D3 — Hero de portafolio y gráficos (T4 + T5)

Rama: `v2/d3-hero-portafolio-graficos` (base `mejoras/integracion`).
Worktree: `C:\reclu-work\f14`. Sin push, sin migraciones, sin tocar Supabase.

## Qué se hizo

### 1. `src/lib/simulated-investment.ts` (nuevo)

Lógica pura, sin red ni fechas relativas:

- `simulateInvestment(series, amount = 10_000)` →
  `{ finalValue, gain, gainPct, points }`.
  - Serie vacía / sin fechas válidas → `null` (nunca un número inventado).
  - El **primer punto visible de la serie es la base 0%**: el monto inicial queda
    intacto ahí. Importante porque la serie que entrega el servidor ya viene
    recortada por el plan (90 días para anon/free), así que el primer punto no
    es 0% y hay que rebasar sí o sí.
  - `amount` inválido (<= 0 o NaN) → `DEFAULT_SIMULATED_AMOUNT` (10.000 USD).
  - Ordena por fecha; ignora puntos con fecha o valor no finito.
- `seriesPeriodLabel(series)` → `"desde <mes año>"` (ej. `"desde ene 2024"`),
  con la fecha más antigua. Serie vacía → `""`.

Tests: `tests/simulated-investment.test.ts` (10 casos): serie vacía → null,
ganancia, pérdida, rebasing de la base visible, monto inicial, orden por fecha,
monto inválido, y la etiqueta de período.

### 2. `src/components/charts/area-chart.tsx` (nuevo)

SVG propio, sin librerías. Props: `points: {x,y}[]`, `positive`, y opcionales
`secondary` + `secondaryLabel` (benchmark), `dark`, `height`, `formatValue`,
`ariaLabel`.

- Línea de 1.5px: verde `#16a34a` / roja `#dc2626` (`vectorEffect="non-scaling-stroke"`).
- Área con `linearGradient` del color a transparente.
- Sin ejes, sin grilla, sin números flotantes.
- `viewBox` responsivo (`0 0 640 h`, `preserveAspectRatio="none"`).
- Tooltip mínimo (fecha + valor) al mover el puntero **y** con teclado
  (flechas, Home, End, Escape) sobre un contenedor `tabIndex=0`;
  `role="img"` + `aria-label` con resumen, y `aria-live` para lectores de pantalla.
- Tema `dark`: fondo #111, textos claros.
- Serie secundaria = línea gris fina (`#a3a3a3` / `#8a8a8a` en dark), sin área,
  alineada por fecha y sobre la misma escala vertical.

### 3. `src/components/portfolio-hero.tsx` (nuevo)

- Izquierda: título grande `"<Nombre> subió <X>%"` (o "bajó"), con el % en
  `text-green-600` / `text-red-600`; botón ⓘ con `aria-label` + `title` + tooltip
  que explica el período del cálculo ("Variación calculada sobre la serie de
  rendimiento desde <mes año>…"); pastilla verde (`bg-green-50 text-green-700`)
  con una métrica real (seguidores); CTA con el `FollowButton` existente
  estilizado como píldora negra.
- Derecha: tarjeta `rounded-2xl bg-[#111] text-white p-6` con
  "Si hubieras invertido 10.000 USD" → valor simulado, ganancia en verde/rojo y
  `AreaChart` dark.
- Debajo, en `text-xs text-neutral-500`:
  "Basado en rendimiento histórico. Rentabilidades pasadas no garantizan resultados futuros."
- **Sin serie ⇒ no se muestra ni el % ni la tarjeta**: solo título y CTA.
  Con serie ilustrativa (demo) se rotula "Ejemplo".

### 4. `src/app/portfolio/[slug]/page.tsx`

- Inserta `<PortfolioHero>` arriba del contenido actual.
- El hero usa **la misma serie que ya obtenía la página** (`getPerformance`, que
  recorta por plan vía RPC `get_portfolio_performance` + `trimSeriesToWindow`).
  No se lee ninguna tabla directo → el muro de pago se respeta por construcción.
- Limpieza para no duplicar: el enlace "Volver a explorar" sube arriba del hero,
  el `<h1>` duplicado se elimina (el hero es ahora el título), el `FollowButton`
  queda solo en el hero, y los "seguidores" salen de la fila de metadatos (ya
  están en la pastilla). El bloque "Retorno YTD" se mantiene pero en tamaño
  secundario (`1.75rem`), porque el % gigante del hero es otra magnitud
  (retorno del período vs. YTD del portafolio) y ambos siguen siendo ciertos.
- **No se tocó** `PaywallGate`, `LegalNotice`, `DemoBadge` ni los descargos.

### 5. T5 — estilo unificado de gráficos

- `src/components/charts/portfolio-evolution.tsx`: ahora usa `AreaChart`
  (área con degradado, línea fina verde/roja, sin grilla, tooltip mínimo).
  Mismos datos, mismo orden por fecha.
- `src/components/charts/portfolio-detail-charts.tsx`: el gráfico de
  comparación con benchmark usa `AreaChart` con la serie del portafolio como
  línea/área y el benchmark como línea gris fina (`#a3a3a3`). No cambian los
  datos ni la comparación: el retorno acumulado % se sigue calculando desde el
  primer valor de cada serie y la intersección de fechas es la misma.
  `Comparison` (src/components/charts/comparison.tsx) queda sin uso en este
  archivo; no se borró para no tocar código ajeno.

## Decisiones

- **Rebasing en el primer punto visible**: la serie del servidor llega recortada
  (90 días para anon/free) y el primer punto no es 0%. Simular sobre esa base
  es lo honesto: "si hubieras invertido al inicio del período que ves".
- **El % del hero es el del período visible**, no el YTD. El botón ⓘ lo explica
  y el "Retorno YTD" sigue visible aparte, con su propio rótulo.
- **Seguidores como métrica de la pastilla**: es un dato real que no depende
  del muro. "Número de posiciones" se descartó porque con el paywall el usuario
  anónimo ve solo las top N.
- **Migración nueva**: ninguna. No hizo falta tocar el esquema.

## Verificación

```
npx tsc --noEmit                 # OK
npm run lint                     # OK, 0 warnings
npx vitest run --maxWorkers=1    # 97 archivos, 1139 tests, todos pasan
npx vitest run --maxWorkers=1 tests/simulated-investment.test.ts   # 10/10
```

No se corrió `next build` ni `npm run dev` (por instrucción del orquestador).

## Cómo probar

1. `npm run dev` y abrir `/portfolio/pelosi-tracker` (o cualquier slug de demo).
   - Con Supabase sin configurar, la serie es la de `demoPerformance`: el hero
     debe mostrar "<Nombre> subió X%", la tarjeta negra con los 10.000 USD
     simulados y la pastilla "Ejemplo".
   - Sin serie (portafolio sin datos de rendimiento) el hero debe mostrar solo
     el título y el CTA, sin % ni tarjeta.
2. Mover el puntero sobre el gráfico: tooltip con fecha y valor. Con teclado
   (Tab hasta el gráfico, luego flechas) también aparece.
3. Verificar que el "Retorno YTD" sigue apareciendo aparte y que el botón
   "Seguir" está en el hero.
4. `/portfolio/afp-consenso-chile` (o cualquier premium) como anónimo: la serie
   premium no debe pasar → sin % ni tarjeta de simulación.

## Pendiente / para el orquestador

- `src/components/charts/comparison.tsx` quedó sin uso (el benchmark ahora se
  dibuja con `AreaChart`). Se puede borrar en una pasada aparte.
- `PerformancePanel` (`src/components/performance-panel.tsx`) mantiene su
  `BenchmarkChart` propio con el estilo viejo (línea negra 2px + área gris).
  No se tocó porque la tarea listaba solo `portfolio-evolution.tsx` y
  `portfolio-detail-charts.tsx` para T5; unificarlo con `AreaChart` daría
  coherencia total en la página.
- El hero usa `text-neutral-950` / `text-green-600` / `bg-[#111]` según la guía
  de estilo de la tarea, mientras el resto del sitio usa los tokens `ink-*`.
  Si D1/D2 ya migraron el sistema a `neutral-*`, esto queda consistente; si no,
  es el punto de integración a revisar.
- El botón ⓘ del hero usa `focus-visible:ring-2 ring-offset-2 ring-neutral-950`
  (petición explícita de la tarea). El resto del sitio usa el `:focus-visible`
  global de `globals.css` (outline 1px negro). Conviene unificar la convención.
