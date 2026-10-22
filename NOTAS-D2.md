# NOTAS-D2 — Lista de portafolios en el inicio (T3)

**Rama:** `v2/d2-lista-portafolios` (desde `mejoras/integracion`)
**Worktree:** `C:\reclu-work\f48`
**Fecha:** 21-10-2026

---

## Qué se hizo

Bloque nuevo en la home: dos columnas con **datos reales** de la base.

### Archivos nuevos

| Archivo | Qué es |
|---|---|
| `src/lib/portfolio-rankings.ts` | Lógica pura + loader de servidor |
| `src/components/sections/portfolio-rankings.tsx` | Componente cliente (selector de período) |
| `tests/portfolio-rankings.test.ts` | 15 tests de la lógica pura |

### Archivo modificado

- `src/app/page.tsx` — se reemplaza `<PortfolioStage />` por `<PortfolioRankings data={rankings} />`.
  La home ahora es async: `await connection()` + `export const instant = false` (Next 16 con
  `cacheComponents: true`, porque el ranking lee la cookie de sesión para el muro de pago).

### Lógica pura (`src/lib/portfolio-rankings.ts`)

- `RANKING_PERIODS` — los 6 períodos del selector con su ventana en días:
  1S=7, 1M=30, 3M=91, 6M=182, 1A=365, 2A=730.
- `periodReturn(series, days)` — retorno (%) de la ventana. La serie se espera en **niveles**
  (índice base 100). El corte es el último punto con fecha ≤ último − `days`; si ese punto no
  existe, la serie no cubre el período y devuelve `null` (no se estima ni se completa).
- `topByReturn(entries, limit=5)` — orden por retorno desc; los que no tienen dato quedan fuera;
  desempate por seguidores y luego por nombre.
- `topByFollowers(entries, limit=5)` — orden por seguidores desc.
- `filterPremium(list, paid)` — **muro de pago**: los premium solo se rankean para quien paga.
- `formatReturnPct(value)` — formato chileno: `+12,3%` / `-4,6%` / `0,0%` / `—` (sin dato).
- `initialsOf(name)` — iniciales para los avatares.

### Loader de servidor

`getPortfolioRankings()`:

1. `getProfile()` + `isPaidPlan()` → define el rol (anon / free / paid).
2. `getPortfolios()` de `@/lib/queries` → catálogo activo.
3. `filterPremium()` → los premium quedan fuera por completo para quien no paga
   (ni aparecen en "Populares": no se filtran cifras, se filtran portafolios).
4. Se toman los **primeros 30 por seguidores** y a cada uno se le pide la serie con
   `getPerformance()` de `@/lib/queries` (RPC con recorte por plan, jamás lectura directa de tablas).
5. `fromPctToLevel()` convierte `value_pct` a nivel; `periodReturn()` mide cada ventana.
6. Se arma el payload: top 5 por período + top 5 por seguidores, con `hasData` por período.

### Componente cliente

- Dos columnas en `md:grid-cols-2` (una en móvil): **Mejor rendimiento** y **Populares**.
- Selector de período en píldoras con `role="tablist"` / `role="tab"` / `role="tabpanel"`.
  Activa `bg-neutral-950 text-white rounded-full`; inactiva gris. Sin datos → `aria-disabled`,
  `disabled` y el texto **"Sin datos"**.
- Fila: portada cuadrada 64px `rounded-2xl` con `next/image` (`/covers/${cover_image}`) y
  fallback a iniciales sobre `bg-neutral-100`; pastilla de retorno arriba
  (`bg-green-50 text-green-700` / roja si negativo); nombre en negrita; debajo el `manager` con
  mini avatar de iniciales de 16px; a la derecha la métrica real **"N seguidores"** (nunca un
  "monto invertido" inventado); `ChevronRight` de `lucide-react`.
- Filetes `divide-y divide-neutral-200/70`, `hover:bg-neutral-50`, toda la fila es un `Link` a
  `/portfolio/${slug}` con foco visible (`focus-visible:ring-2 ring-offset-2 ring-neutral-950`).
- Iconos con `aria-hidden` cuando son decorativos; `prefers-reduced-motion` respetado en la
  transición del chevron.

---

## Decisiones

1. **Se reemplaza `<PortfolioStage />` en vez de insertar después de `<Hero />`.**
   La tarea permite ambas; `PortfolioStage` mostraba cifras ilustrativas (31,4%, 42,8%…) y la
   sección nueva muestra datos reales. Dos bloques de portafolios con cifras distintas en la misma
   pantalla se contradicen. Además, otra sesión edita el Hero en `page.tsx`: tocar la línea del
   `<Hero />` habría generado conflicto de merge en esa zona.
   *Pendiente para el orquestador:* `src/components/sections/portfolio-stage.tsx` queda sin uso en
   la home (el archivo sigue en el repo, no se borró).

2. **`periodReturn` opera sobre niveles, no sobre `value_pct`.** `portfolio_performance.value_pct`
   es un porcentaje acumulado desde la base (0 = base), así que el retorno de una ventana NO es la
   resta simple de dos `value_pct`: es una razón de niveles. Se convierte con `fromPctToLevel()`
   (de `@/lib/performance`) y recién ahí se mide.

3. **Sin datos = píldora deshabilitada, no un 0%.** Un período que ninguna serie cubre devuelve
   `null` en todas las filas, la columna queda vacía y su píldora se deshabilita con "Sin datos".
   No se rellena con ceros ni se extrapola.

4. **El muro se aplica sobre el catálogo, no solo sobre las cifras.** Un portafolio premium no
   aparece en ninguna de las dos columnas para quien no paga. Además, `getPerformance()` ya
   recorta la serie a 90 días para anon/free (migración 048) y las declaraciones públicas
   (`house_ptr`, `senate_ptr`, `oge_278t`) conservan su historia completa.

5. **Sin pagar, el selector queda reducido.** Con el recorte de 90 días, 3M/6M/1A/2A no tienen
   datos para anon/free salvo en las declaraciones públicas: sus píldoras aparecen deshabilitadas.
   Es el comportamiento honesto del muro, no un bug.

6. **Métrica de la derecha: "N seguidores".** No existe un "monto invertido" en la base y no se
   inventa.

7. **Modo demo.** Sin Supabase configurado, `getPerformance()` devuelve `[]`; en ese caso se usa
   `demoPerformance()` (misma serie ilustrativa determinista que ya usa `/portfolio/[slug]`) y la
   sección rotula **"Datos de ejemplo: sin conexión con la base real."**

8. **Tono de la cola del ranking.** `text-red-700` sobre `bg-red-50` en vez de `text-red-600`:
   con 12px, `red-600` sobre `red-50` queda en ~4:1 y no alcanza AA. El resto de la paleta sigue
   la guía (verde `#16a34a` vía `green-600/700`, grises `neutral-*`).

---

## Muro de pago — qué se respetó

- Los datos salen **siempre** por `getPerformance()` (RPC con recorte por plan). Nunca se lee
  `portfolio_performance` ni `portfolios` directo.
- `getProfile()` + `isPaidPlan()` + `roleFor()` determinan el rol; `filterPremium()` saca los
  premium del catálogo para anon/free.
- El descargos legal existente se conserva: la sección cierra con la nota de que las
  rentabilidades pasadas no garantizan resultados futuros y de que Reclu entrega información, no
  asesoría de inversión.

---

## Cómo probar

```bash
cd C:/reclu-work/f48
npm run lint          # 0 errores, 0 warnings
npx tsc --noEmit      # sin errores
npx vitest run --maxWorkers=1 tests/portfolio-rankings.test.ts   # 15/15
npx vitest run --maxWorkers=1                                    # suite completa: 97 archivos / 1144 tests
npm run build         # lo corre el orquestador (no lo corrí yo)
```

En la app (con Supabase configurado):

1. `/` → la sección **"Portafolios que puedes seguir hoy"** aparece entre `SourceLine` y
   `Statement`, en dos columnas.
2. **Mejor rendimiento**: se selecciona 1S / 1M / 3M / 6M / 1A / 2A y la lista se reordena.
   Los períodos sin cobertura salen deshabilitados con "Sin datos".
3. **Populares**: las 5 carteras con más seguidores, con la misma pastilla del período elegido.
4. Con sesión Pro/Elite aparecen además los portafolios premium; sin sesión, no aparecen.
5. Cada fila lleva a `/portfolio/{slug}`; la portada usa `/covers/{cover_image}` y, si no hay
   imagen o falla la carga, sale el avatar de iniciales.
6. Modo demo (sin `.env.local` con Supabase): la sección muestra el aviso "Datos de ejemplo".

---

## Pendientes

- `src/components/sections/portfolio-stage.tsx` quedó sin uso en la home (no se borró; decisión del
  orquestador junto con la sesión que edita el Hero).
- El loader pide la serie de **30 portafolios** por render de la home (una RPC por portafolio, en
  paralelo). Si en producción eso se nota en el tiempo de respuesta, la salida natural es un
  agregado precalculado (tabla `portfolio_metrics` / vista materializada) en vez de 30 RPC.
- No se creó ninguna migración: no hacía falta.
- `docs/hermes-diseno.md` describe el sistema de diseño anterior (gris `ink-*`, radio 0). La
  sección nueva sigue la guía de la tarea (rediseño tipo joinautopilot: `neutral-*`,
  `rounded-2xl`, `rounded-full`, `font-sans`). Conviene que D1 alinee el resto de la home con esa
  misma guía.
