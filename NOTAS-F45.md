# NOTAS F45 — Importar mi cartera y ver quién más tiene lo mismo

Rama: `v2/f45-importar-cartera` (worktree `C:\reclu-work\f48`, base
`mejoras/integracion`). Commit local, **sin push**.

## Verificación previa de la base

- `supabase/migrations/008_planes_alertas.sql`, `009_pagos_suscripciones.sql`
  y `014`–`021` existen (además de 022, 025, 027, 030, 037, 043, 044). Base OK.
- `015_holders_por_simbolo.sql` (F9) aporta `get_symbol_holders(text)`, que es
  la función usada por el panel.

## Qué se hizo

### 1. `src/lib/import-holdings.ts` (nuevo, puro — papaparse + zod)

- `parseHoldingsCsv(text)`: CSV con columnas de **símbolo** y **cantidad**.
  - Encabezados en español o inglés con normalización (BOM, acentos, espacios,
    mayúsculas): `símbolo`/`symbol`/`ticker`/`accion`/`activo`/`instrumento` y
    `cantidad`/`quantity`/`qty`/`shares`/`acciones`/`numero_acciones`/`unidades`.
  - `parseQuantity`: acepta `1.234,56` (Chile), `1,234.56`, `1.234.567`,
    `$ 1.000`, decimales con coma/punto.
  - Deduplica símbolos repitiendo mayúsculas/minúsculas (suma cantidades).
  - Filas inválidas se acumulan en `errors` y se ignoran; si no queda ninguna
    válida, `rows` va vacío.
  - Tope `MAX_IMPORT_ROWS = 100` y `MAX_CSV_LENGTH = 1 MB`.
  - **Cantidad → peso**: como `user_holdings` guarda `weight` y F45 no trae
    migración, se usa `weight = cantidad / total * 100` (peso relativo por
    cantidad, ajustado para sumar 100). No es el % real del patrimonio: sin
    precios no se puede valorar; la UI lo dice.
- Esquemas zod exportados: `importSymbolSchema`, `importRowSchema`,
  `importSymbolsSchema`.
- Tipos públicos para el panel (sin datos personales): `OverlapHolder`,
  `OverlapEntry`.

### 2. `src/app/actions/holdings.ts` (modificado)

- `importHoldings(rawCsv)`: valida tamaño, parsea con `parseHoldingsCsv`,
  revalida ítems con `userHoldingsSchema`, normaliza pesos, **reemplaza** la
  cartera (`delete` + `insert` con `source: "csv"`) y `revalidatePath("/compare")`.
  Devuelve `{ success, warnings, holdings }` o `{ error }`.
- `getOverlapForSymbols(symbols)`: server action autenticada que consulta la RPC
  **`get_symbol_holders` (015, F9)** por cada símbolo, en lotes de 5. La RPC ya
  aplica el recorte del muro de pago (rank por plan + carteras premium).
  Devuelve solo nombres públicos del catálogo; **nunca** la cartera del usuario.
  Se añadió como apoyo del panel (la tarea solo pedía `importHoldings`): sin él
  el panel no podría refrescarse al cargar la página sin exponer un endpoint
  público.

### 3. `src/components/overlap-panel.tsx` (nuevo, cliente)

- Panel "Quién más tiene lo mismo": para cada símbolo de la cartera arma la
  frase tipo `Nancy Pelosi, Berkshire Hathaway y tu AFP también tienen NVDA.`
  (las carteras AFP se muestran como "tu AFP").
- Lista hasta 5 carteras por símbolo con etiqueta de categoría y peso, enlaza a
  `/portfolio/[slug]`, "Buscando coincidencias…" y estado de error sin romper.
- Incluye `<LegalNotice kind="fintec" />` (no ejecuta órdenes ni recomienda).
- No llama a `setState` síncrono dentro del efecto (regla de lint del repo).

### 4. `src/components/portfolio-manager.tsx` (modificado)

- La tarjeta CSV pasó a **"Importar CSV"** (columnas símbolo y cantidad, máx.
  100 activos). El botón lee el archivo en el navegador y llama a la server
  action `importHoldings`; al volver, actualiza la tabla y `router.refresh()`.
- Se quitó el parser local de pesos (papaparse ya no entra al bundle).
- `<OverlapPanel symbols={…} />` bajo "Tu cartera", con la lista memoizada.

### 5. `tests/import-holdings.test.ts` (nuevo, 16 tests)

Encabezados es/en/BOM, separador `;`, decimales CL y anglosajones, símbolos
repetidos, filas inválidas, CSV vacío, columnas faltantes, símbolos peligrosos,
tope de 100 y suma de pesos = 100.

## Variables de entorno

**Ninguna nueva.** Usa `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (cliente de sesión) y
la RPC de la 015. No se tocó `.env.example` ni ningún `.env*`.

## Legal

- No ejecuta, enruta ni sugiere órdenes (Ley 21.521). Solo muestra coincidencias
  informativas.
- La cartera del usuario es dato personal: vive en `user_holdings` bajo RLS; el
  panel solo envía los **símbolos** a una server action autenticada y recibe
  carteras públicas. No hay endpoint público nuevo.
- Los datos de funcionarios de EE.UU. que devuelve la RPC siguen sin muro
  (5 U.S.C. § 13107); el panel no agrega paywall.

## Cómo probar

```bash
npm test        # 35 archivos, 396 tests (incluye tests/import-holdings.test.ts)
npm run lint
npm run typecheck
# build lo corre el orquestador: npx next build
```

UI (con Supabase y sesión): `/compare` → "Mi cartera vs. Portafolio" →
**Importar CSV** con un archivo `simbolo,cantidad\nAAPL,12\nNVDA,3\n`. Se guarda,
se ve "Tu cartera" y debajo el panel de coincidencias. Ejemplo mental: NVDA
aparece en varias carteras del catálogo.

## Deudas / pendientes

- **`scrapers/data/v2/F45/` no vino en este worktree** (solo existe
  `scrapers/data/v2/F48/fuentes.md`). No hizo falta: todo es lógica pura con
  datos de los tests. Si el orquestador esperaba un CSV de muestra, no está.
- `user_holdings` **no tiene columna de cantidad** y F45 prohíbe migración: el
  peso importado es relativo a la cantidad, no al valor. Si más adelante se
  agrega `quantity`, reemplazar la conversión y `saveUserHoldings` (que sigue
  esperando pesos).
- `saveUserHoldings` (pesos) sigue existiendo para la entrada manual; un
  "Guardar" después de importar sobreescribe con pesos normalizados por el
  cliente. No se tocó su comportamiento.
- `importHoldings` guarda solo `symbol`, `name` vacío y `weight`; el nombre del
  activo no viene en el CSV de símbolo+cantidad.
- El panel abre una RPC por símbolo (máx. 100, en lotes de 5). Si un usuario
  importa 100 símbolos en un plan gratis, son 100 llamadas; se puede cachear
  más adelante si molesta.
- No se corrió `npx next build` (regla del worktree). La verificación completa
  la hace el orquestador.
