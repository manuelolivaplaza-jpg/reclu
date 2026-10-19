# NOTAS F41 — "Copiar en mi corredora": lista de compras sin ejecutar

Rama: `v2/f41-lista-replicar` (worktree `C:\reclu-work\f48`). Commit local, sin push.

## Qué se hizo

- **`src/lib/replicate.ts`** (nuevo, puro): `buildShoppingList(holdings, monto, moneda, fx, { fracciones })`.
  - Reparte el monto proporcionalmente al peso de las posiciones **visibles**
    (si el rol ve solo el top 5, replica ese top 5 con el monto total).
  - Convierte CLP↔USD con `fx` (pesos por dólar). Precio: `price_current` y,
    si falta, `price_at_disclosure`.
  - `fracciones: true` (default) redondea a **4 decimales**; `false` compra
    acciones enteras (`Math.floor`) y deja `restante`.
  - Posiciones sin precio o en `EUR` quedan marcadas con `warning` y sin acciones.
  - Expone `BROKER_MINIMUMS` (Racional: fracciones desde $5.000; Fintual: 10
    órdenes/mes gratis) y `MINIMUM_NOTICE`.
  - `shoppingListToCsv(list)` genera el CSV (cabecera + filas).
- **`src/components/replicate-list.tsx`** (nuevo, cliente): tabla con montos,
  botones **Copiar** (clipboard) y **Descargar CSV**, inputs de monto/moneda/
  tipo de cambio y toggle de fracciones. `<LegalNotice kind="fintec" />` arriba
  del cierre, texto "lista informativa". Sin enlaces que ejecuten órdenes.
- **`src/components/portfolio-tools.tsx`** (modificado): botón
  "Copiar en mi corredora" que abre/cierra `ReplicateList`. No se tocó
  `src/app/portfolio/[slug]/page.tsx` (los holdings llegan ya recortados por rol).
- **`tests/replicate.test.ts`** (nuevo, 12 tests): reparto por peso, normalización
  de pesos visibles, conversión CLP/USD, redondeo a 4 decimales, modo sin
  fracciones, sin precio, `price_at_disclosure`, EUR, validaciones, lista vacía y CSV.

## Legal

- Nada ejecuta, enruta ni recomienda órdenes: solo lista informativa (Ley 21.521).
- Se respeta el recorte por rol: se usan solo las posiciones ya entregadas por el
  servidor (`src/lib/access.ts`). Portafolios de divulgación pública de EE.UU. no
  se ven afectados (siguen sin muro).
- El aviso `fintec` aparece dentro del componente; el texto de páginas legales no
  se reescribe, solo se enlaza.

## Variables de entorno

- **Ninguna nueva.** El tipo de cambio lo ingresa el usuario en la UI (no se
  consulta al Banco Central ni se usa un dólar de ejemplo). No se tocó `.env*`.

## Deudas / pendientes

- No existe un precio USD/CLP de servidor; el usuario escribe el tipo de cambio.
  Si más adelante hay un `fx` real, pasarlo como prop/valor por defecto.
- Activos en `EUR` no se valoran (no hay tasa EUR↔CLP/USD). Se marcan como
  "Moneda sin tipo de cambio".
- La carpeta `scrapers/data/v2/F41/` no vino en este worktree; no hizo falta
  (todo es lógica pura con datos de ejemplo en los tests).

## Cómo probar

```bash
npm install          # si falta
npm run typecheck
npm run lint
npm test             # incluye tests/replicate.test.ts
# build lo corre el orquestador: npx next build
```

En la UI: `/portfolio/<slug>` (con retorno YTD) → bloque "Simulador + exportación"
→ botón **Copiar en mi corredora**.
