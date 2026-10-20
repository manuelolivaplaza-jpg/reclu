# F57-B — Cierre de registros, navegación y metodología (parte 2)

Rama `v2/f57b-cierre-nav` (worktree `C:\reclu-work\f14`, desde
`mejoras/integracion`). Sin push. Sin migraciones ejecutadas. Sin Supabase
real. No se leyó ni tocó `.env` / `.env.local`. No se levantó `npm run dev`
ni se corrió `next build` (lo hace el orquestador).

## Hecho

### 1. `supabase/migrations/README.md`

- Fila nueva **`040_api_claves.sql`** (F53) en el orden, con su sección
  “040 — Claves de API (F53)”: `api_keys` (prefijo + `sha256`, plan,
  revocación, `last_used_at`), `api_usage` (`key_id`, `day` UTC, `count`),
  RPC `consume_api_usage`, RLS de solo lectura del dueño, datos mínimos y
  nota de 5 U.S.C. § 13107 para la API.
- Se renumeraron las filas ordinales siguientes (`041` → 35 … `049` → 43).
- **F54 no trajo migraciones nuevas** (`NOTAS-F54.md` lo dice y
  `git show --stat ba94756` no toca `supabase/migrations/`). No hubo fila que
  agregar por F54.
- Huecos de numeración: ahora solo `026` y `035`. La `040` ya no se declara
  inexistente.
- **048 actualizada con `get_alert`** (SD2-C): fila de la tabla y detalle de
  la sección M7, más el grant de las cuatro RPC. Se aclara que
  `/api/explain-alert` usa la RPC y responde 404 si no hay fila.

### 2. `.env.example`

- Bloque nuevo “API pública de datos (F53/F54) — APAGADA por defecto” con
  `API_PUBLIC_ENABLED="false"` y comentario: solo el valor exacto `true`
  enciende `/api/v1/*` y la creación de claves; cualquier otro valor (o su
  ausencia) responde 503; las declaraciones de funcionarios de EE.UU. nunca
  se exponen por la API.
- No había más variables nuevas de F53/F54 (F54 reutiliza la misma flag).

### 3. `tests/env-example.test.ts`

- `API_PUBLIC_ENABLED` agregada a `REQUIRED_KEYS` y a `DISABLED_FLAGS`
  (debe valer `false` en la plantilla). Sigue leyendo solo `.env.example`.

### 4. `src/app/sitemap.ts` + `tests/sitemap.test.ts`

- Rutas nuevas, solo las que existen en `src/app`:
  - `/ranking`
  - `/aprende` y todas las fichas de `FICHAS_APRENDE`
  - `/herramientas`, `/herramientas/backtest`, `/herramientas/impuestos`
  - `/medios`
- Condicionadas por flag (falla cerrado, solo `"true"` exacto):
  - `/creadores` con `COMMUNITY_ENABLED === "true"`.
  - `/api-docs` con `API_PUBLIC_ENABLED === "true"`.
- Se mantienen home, explore, auth, legales, tickers y portafolios.
- `tests/sitemap.test.ts` (7 tests): rutas editoriales, portafolios sin
  duplicados, apagado por defecto, cada flag por separado, ambos encendidos y
  valores distintos de `"true"` (`TRUE`, `1`, `yes`, vacío) no encienden nada.
  Mockea `getPortfolios` (sin red ni Supabase).

### 5. Navegación

- `src/components/site-header.tsx`: enlaces **Ranking**, **Aprende** y
  **Herramientas** (además de Portafolios, Cómo funciona y Precios).
  Como ahora son seis enlaces, el nav de escritorio pasa de `md` a `lg`
  (con `gap-5`/`xl:gap-8`); bajo `lg` se usa el menú móvil de siempre. No se
  cambió el diseño: mismos 14px, mismo hover, mismo CTA.
- `src/components/site-footer.tsx`: columna **Recursos** con Ranking, Aprende
  y Herramientas. La grilla de `lg` pasa a cinco columnas.
- **`src/app/herramientas/page.tsx` (nuevo)**: no existía un índice
  `/herramientas` (solo `backtest` e `impuestos`), así que el enlace habría
  dado 404. Se agregó un hub mínimo en el estilo del sitio (filetes, sin
  tarjetas ni sombras) que lista las dos herramientas. También se sumó
  `/herramientas` al sitemap y al test.

### 6. `src/components/sections/source-line.tsx`

- Lista actualizada con las fuentes vivas de `docs/sources.md`: House
  Disclosure, Senate eFD, OGE 278-T, SEC EDGAR (13F, Form 4, 13D, 10-12B,
  XBRL), ARK, Global X, iShares, VanEck, Renta 4, BTG, BICE, MBI, CMF,
  Superintendencia de Pensiones, InfoProbidad, Polymarket, Truth Social,
  X (@elonmusk) y CNBC.
- Se quitaron **Capitol Trades** y **LarrainVial**: `docs/sources.md` las
  marca como login wall / obsoletas y no deben anunciarse como fuentes.

### 7. `src/app/metodologia/page.tsx`

Cuatro secciones breves nuevas, con anclas en el índice de la página:

- **7. Ranking honesto**: benchmark por país (S&P 500/SPY, IPSA/ECH en CLP),
  orden por exceso de retorno o Sharpe, todos los portafolios con métricas
  (incluidos los que pierden), sin ceros donde falta historia.
- **8. Muro de pago: 90 días de historial gratis**: Gratis ve los últimos 90
  días de la serie en portafolios no premium; Pro/Elite ven la serie completa;
  los premium son solo para planes pagos; topes de alertas 3/10/plan y resumen
  AI solo pago. Aclara que no es una prueba con vencimiento ni tarjeta.
- **9. Datos públicos de funcionarios, fuera del muro**: PTR Cámara/Senado y
  OGE 278-T completos y gratis por 5 U.S.C. § 13107; excluidos de la API
  pública; montos por rango y rezago de 30/45 días.
- **10. Anonimización de personas naturales**: `Persona natural (#ranking)`,
  sin nombre ni RUT, conservando porcentaje/acciones/ranking; trigger en cada
  carga; Leyes 19.628 y 21.719.
- Se renumeraron Trump dice (11) y Elon Musk dice (12) y se amplió la
  descripción de metadata.

## Verificación

```text
npx vitest run --maxWorkers=1 tests/env-example.test.ts   # 4 passed
npx vitest run --maxWorkers=1 tests/sitemap.test.ts       # 7 passed
npm run lint                                             # OK
npm run typecheck                                        # OK
npm test                                                 # 62 files, 725 tests passed
```

No se corrió `next build` ni `npm run dev`. No se aplicó ninguna migración.

## Pendiente / notas

- **`/creadores/[alias]`** no se lista en el sitemap: los alias viven en la
  base y el sitemap no consulta esa tabla. Cuando la comunidad se encienda,
  conviene generarlos desde `creator_profiles` (o dejarlos solo con enlaces
  internos).
- **`how-it-works.tsx`** (home) todavía dice “Revisamos Capitol Trades”. Es
  copy fuera del alcance de F57-B; conviene cambiarlo a “declaraciones
  públicas, corredoras y filings” en una próxima pasada.
- Términos de CMF y corredoras siguen pendientes de revisión legal (F54).
- `api_usage` necesita limpieza periódica (>90 días) cuando la API se encienda.
- El hub `/herramientas` se agregó solo para que el enlace pedido no dé 404;
  no tiene lógica ni datos.

## Cómo probar

```powershell
cd C:\reclu-work\f14
npx vitest run --maxWorkers=1 tests/sitemap.test.ts
npx vitest run --maxWorkers=1 tests/env-example.test.ts
npm run lint
npm run typecheck
npm test
```

Revisión manual (sin servidor): abrir `src/app/sitemap.ts`, poner
`API_PUBLIC_ENABLED="true"` / `COMMUNITY_ENABLED="true"` en el entorno y
volver a correr el test del sitemap; solo entonces deben aparecer
`/api-docs` y `/creadores`.
