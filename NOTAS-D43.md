# D43 — Ocultar portafolios con cifras inventadas (reversible)

Rama `v2/d43-demos-ocultos` (desde `mejoras/integracion`). Sin push.

## Hecho

1. **Migración `supabase/migrations/043_ocultar_demos.sql`** (idempotente)
   - Agrega `portfolios.replaced_by_slug` y `portfolios.hidden_reason`.
   - Marca `is_active = false` + `hidden_reason = 'cifras_inventadas'` en:
     - `elon-doge-tracker` → `musk-dice`
     - `trump-truth-signals` → `trump-dice`
     - `afp-consenso-chile` → `afp-modelo-acciones-cl`
     - `inverse-cramer` (oculto siempre; `replaced_by_slug` solo si
       `inverse-cramer-real` existe y está activa, si no lo limpia).
   - No borra filas ni toca holdings/alerts.
   - **Reversión:** `supabase/migrations/043_ocultar_demos_down.sql`
     (NO se aplica en el flujo normal; reactiva y limpia metadatos).
   - `supabase/migrations/README.md` documenta la 043, el `_down` y el dato de
     que las RPC 011/012/015/019 ya filtran `is_active = true` (no re-exponen
     ocultos) y que RLS `portfolios public read` solo deja leer activos.

2. **App**
   - `src/lib/queries.ts`: `getPortfolios` (demo) y el fallback demo excluyen
     los ocultos; nueva `getPortfolioRedirect(slug)` (cliente anónimo, con el
     mapa estático como respaldo porque RLS no deja leer filas inactivas).
   - `src/app/portfolio/[slug]/page.tsx`: si `getPortfolioBySlug` da null y hay
     redirección → `permanentRedirect('/portfolio/<real>')` (308); si no,
     `notFound()` como antes. `generateMetadata` sigue sin listar ocultos.
   - `src/app/sitemap.ts`: sin cambios; usa `getPortfolios`, que ya los excluye.
   - `src/lib/demo-data.ts`: nuevo `HIDDEN_DEMO_SLUGS`, `isHiddenSlug` y
     `demoRedirectTarget`; `demoPortfolioBySlug` devuelve null para ocultos.
     No se borró ningún dato demo.

3. **Scraper `scrapers/load_thematic.py`**
   - `HIDDEN_SLUGS` + `is_hidden()`: salta esos slugs (no recarga holdings ni
     reactiva filas con `hidden_reason`).
   - Nuevo flag `--dry-run` (no escribe en la DB).

4. **Tests**
   - `tests/hidden-demos.test.ts` (Vitest, 8 casos): mapa demo, exclusión de
     listados/`getPortfolioBySlug`, redirect (real disponible → redirige; real
     inexistente → null) y `getPortfolioRedirect` en modo demo.
   - `scrapers/tests/test_load_thematic.py` (pytest): ocultos identificados,
     `inverse-cramer` no se carga, `--dry-run` no escribe.

## Verificación

- `npx tsc --noEmit` → OK (0 errores)
- `npx eslint .` → 0 errores (1 warning preexistente en
  `tests/ticker-queries.test.ts`, no es de esta tarea)
- `npx vitest run` → 28 archivos, 302 tests, todos pasan
- `python -m pytest` → **NO ejecutado**: en este entorno no hay Python real
  (solo el stub de Microsoft Store). El test queda listo para correrlo donde
  haya Python 3.11+.

## Pendiente / a decidir por Manu

- En **modo demo** `afp-consenso-chile` no redirige porque
  `afp-modelo-acciones-cl` no existe en `demo-data.ts` (regla: redirigir solo
  si el real está disponible). En vivo sí redirige (la 020 lo crea activo).
  Si Manu quiere que en demo también redirija, hay que agregar el portafolio
  `afp-modelo-acciones-cl` a los datos demo (no se hizo para no cambiar
  conteos/listados).
- Orden de aplicación de la 043: es independiente; puede ir después de la 021
  y antes o después de las migraciones v2 (022-042).
- Para revertir: correr a mano `043_ocultar_demos_down.sql`.

## Cómo probar

```bash
npm run lint && npm test && npm run typecheck   # NO npm run build (lo corre el orquestador)
cd scrapers && python -m pytest tests/test_load_thematic.py
python load_thematic.py --dry-run               # no escribe; salta los slugs ocultos
```

En Supabase (si se quiere): aplicar `043_ocultar_demos.sql` y visitar
`/portfolio/elon-doge-tracker` → 308 a `/portfolio/musk-dice`.
