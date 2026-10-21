# F78 — Ingresar la cartera por cantidad de acciones, monto o porcentaje

Rama: `v2/f78-modo-ingreso-cartera` (base `mejoras/integracion`, incluye F58–F77 y la
migración 054). Commits locales, sin push.

## Decisión de Manu

En la carga de cartera (`/compare` y `/mi-portafolio`) el usuario elige **un solo modo
por cartera**: cantidad de acciones, monto en dinero o porcentaje. El selector de modo
aparece **antes de la tabla de posiciones**.

## Qué se hizo

### 1. Helper puro — `src/lib/holdings-entry.ts` (nuevo)

Sin red ni Supabase. Convierte lo que el usuario escribe a la forma que guarda
`user_holdings`:

| Modo      | Qué entra                | Qué se guarda                                              |
| --------- | ------------------------ | ---------------------------------------------------------- |
| `percentage` | peso en %              | `weight` normalizado a 100 (comportamiento actual)         |
| `shares`  | cantidad de acciones      | `quantity`; peso = cantidad × precio / total              |
| `amount`  | monto en dinero           | `quantity` = monto / precio; peso = monto / total          |

Reglas deliberadas:

- **Moneda**: manda la del precio (`prices.currency` y el sufijo `.SN` de los
  tickers chilenos). Si la cartera mezcla USD y CLP se exige un tipo de cambio
  (CLP por dólar), el mismo criterio de `replicate.ts`; sin él no se guarda nada
  para no sumar monedas distintas.
- **Sin precio** en modo acciones/monto: error claro por símbolo y la cartera
  completa queda sin resolver — nunca se guarda a medias.
- **Redondeo estable**: pesos a 2 decimales que suman 100 (método del mayor
  residuo con desempate por orden de entrada → estable entre servidor y cliente).
- `roundWeightsTo100` es el export usado por la UI para previsualizar.

### 2. Precios — `src/lib/holdings-prices.ts` (nuevo)

`loadHoldingPrices` lee el último cierre de `prices` (la misma fuente que usa la
valorización de Mi portafolio, `src/app/(dashboard)/mi-portafolio/page.tsx`).
Prueba el ticker y su versión `.SN`; chunks de 8 en paralelo. La moneda del
precio manda: `.SN` ⇒ CLP.

### 3. Acción de guardado — `src/app/actions/holdings-entry.ts` (nuevo)

`saveHoldingsByMode({ mode, rows, fx })`:

- Valida la sesión, el consentimiento vigente (`hasCurrentPortfolioConsent` /
  `PORTFOLIO_CONSENT_VERSION`, exigido siempre como en M1 de F77) y el tope de
  posiciones del plan (`canAddPositions`).
- Convierte con el helper puro usando los precios del servidor.
- Devuelve `errors[]` por símbolo (precio faltante, moneda mezclada sin tipo de
  cambio) y **no guarda nada** si hay errores.
- Guarda en las columnas existentes: `weight`, `quantity`, `currency`, `avg_cost`,
  `market`, `broker`. **No se creó ninguna columna nueva ni migración.**
- Borra solo los símbolos que el usuario quitó (igual que `saveUserHoldings`).

`getHoldingPrices(symbols)` es la lectura de precios para la UI.

### 4. UI

- `src/components/my-portfolio/entry-mode-selector.tsx` (nuevo): el selector de los
  tres modos, píldora negra para el activo, borde 1px, sin sombras.
- `src/components/my-portfolio/holdings-entry-panel.tsx` (nuevo): tabla de
  posiciones con la columna de valor según el modo, peso calculado **en vivo con
  el mismo helper del servidor** (lo que se ve es lo que se guarda) y botón
  guardar. Pide el tipo de cambio solo cuando la cartera mezcla USD y CLP.
- `/compare` (`src/components/portfolio-manager.tsx`): la tabla "Tu cartera" ahora
  es el panel con selector de modo. El import CSV sigue igual y siembra el panel
  en modo porcentaje.
- `/mi-portafolio` (`src/components/my-portfolio/portfolio-editor.tsx`): el selector
  va antes de la tabla de posiciones; el campo principal del formulario se llama
  "Cantidad de acciones" / "Monto" / "Peso %" según el modo; el guardado va por
  `saveHoldingsByMode`. La valorización por moneda (P&L, totales) se mantiene
  intacta. Cada posición guarda el valor de los tres modos, así que cambiar de
  modo no borra lo tipeado.

## Tests

- `tests/holdings-entry.test.ts` (19): los tres modos, porcentaje sin precio,
  mezcla de monedas con y sin tipo de cambio, redondeo a 2 decimales que suman
  100, símbolos repetidos, cartera vacía, acciones fraccionarias, decimales en
  cantidad derivada del monto.
- `tests/holdings-entry-action.test.ts` (10): la acción con cada modo, error por
  símbolo sin precio, mezcla de monedas rechazada, conversión con tipo de
  cambio, consentimiento vigente, tope del plan, borrado de quitadas, sesión sin
  autenticar.
- `tests/holdings-prices.test.ts` (6): candidatos de búsqueda de precio, `.SN`.

Suite completa: **988 tests pasan** (`npx vitest run --maxWorkers=1`).

## Verificación

```
npx tsc -p tsconfig.json --noEmit      # limpio
npx eslint src/... (archivos tocados)  # limpio, 0 warnings
npx vitest run --maxWorkers=1          # 82 archivos, 988 tests, todos pasan
```

No se corrió `next build` (lo corre el orquestador). No se tocó Supabase real ni
se corrieron migraciones. No se hizo push.

## Decisiones

- **Sin columnas nuevas**: `user_holdings` ya tenía `weight`, `quantity`,
  `currency`, `avg_cost`, `market` y `broker` (migración 050). No hizo falta la
  055.
- **Tipo de cambio**: el repo no tiene una fuente de tipo de cambio (ni FX en
  `prices` ni un servicio externo); `replicate.ts` y `tax/fx.ts` ya usan el
  criterio "lo declara el usuario". Por eso el tipo de cambio (CLP por USD) se
  pide en la UI solo cuando la cartera mezcla USD y CLP, y sin él no se guarda.
- **Acción nueva en vez de tocar `actions/holdings.ts`**: otra sesión trabaja en
  ese archivo y en los editores de cartera. Se creó `actions/holdings-entry.ts`
  para no pisar ese trabajo; el flujo de consentimiento/tope/upsert está duplicado
  a propósito (misma semántica, misma fuente de verdad: `portfolio-consent.ts` y
  `plans.ts`).
- **En `/compare` la tabla de pesos manual se reemplazó** por el panel: la tabla
  vieja mostraba "Peso" y "Normalizado" calculados en el cliente, lo que ya no
  es válido cuando el modo es acciones o monto (el peso sale del precio). El
  panel muestra el peso real en vivo.

## Pendiente

- El panel de `/compare` no muestra nombre ni columna "Normalizado" como la
  tabla anterior; el nombre de la posición llega vacío desde `getUserHoldings`
  (la columna `name` existe pero no se puebla en el alta manual).
- En `/mi-portafolio`, la valorización por moneda (P&L) sigue agrupando por
  moneda sin convertir, igual que antes de F78. El **peso guardado** sí usa el
  tipo de cambio cuando se mezcla USD/CLP. Unificar ambos criterios requiere un
  acuerdo de producto.
- `importHoldings` (CSV) sigue trabajando en modo porcentaje: el CSV trae
  cantidades y las convierte a peso relativo, sin usar `prices`. Conectarlo al
  modo acciones/monto es trabajo aparte.
- Falta revisar visualmente la UI (el orquestador corre `next build`; no se
  levantó dev server por indicación de la tarea).

## Cómo probar

1. `npm run dev` y entrar a `/compare` (o `/mi-portafolio` con
   `MY_PORTFOLIO_ENABLED=true` y consentimiento vigente).
2. Elegir modo "Cantidad de acciones", agregar AAPL 10 y MSFT 5. El peso debe
   aparecer en vivo (50% / 50% con precios de ejemplo).
3. Cambiar a "Monto en dinero": el mismo AAPL con monto 1500 y precio 150 debe
   derivar 10 acciones.
4. Agregar un ticker sin precio (inventado): debe aparecer el error por símbolo
   y **no** guardarse nada.
5. Mezclar un símbolo USD y uno CLP: debe pedir el tipo de cambio; sin él, no
   guarda.
6. "Guardar cartera" y revisar en Supabase que `user_holdings.weight` suma 100 y
   `quantity` quedó con las acciones derivadas del monto.
