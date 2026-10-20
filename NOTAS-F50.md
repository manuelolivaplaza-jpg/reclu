# F50 — Comunidad de creadores: páginas públicas

## Estado

Completado. Rama `v2/f50-comunidad-ui` (worktree `C:\reclu-work\f9`), sin push.

Al empezar ya existía `src/app/creadores/page.tsx` en el commit wip de la lane.
Se conservó, se le añadió manejo de error de Supabase y se completó la página
de detalle.

## Qué se hizo

- `src/app/creadores/page.tsx` (catálogo público)
  - Solo existe con `COMMUNITY_ENABLED === "true"`; si no, `notFound()`.
  - Lista únicamente perfiles `verificado = true` agrupados desde carteras
    `approved`, con alias, bio, conflicto de interés declarado y número de
    carteras.
  - Aviso visible de contenido de terceros + `LegalNotice kind="fintec"`.
  - Errores de Supabase se muestran con un aviso; no rompen la página.
- `src/app/creadores/[alias]/page.tsx` (perfil público)
  - Mismo gate por bandera. Alias inválido (fuera de
    `CREATOR_ALIAS_PATTERN`) devuelve 404 sin tocar la base.
  - Solo publica perfiles verificados; perfil inexistente o no verificado
    devuelve 404.
  - Consulta carteras con `creator_id` + `estado = "approved"`. Una cartera
    `pending` o `rejected` nunca se renderiza.
  - Normalización defensiva: `creatorPortfolioSchema` (F49-A) valida título,
    descripción y holdings; filas corruptas se descartan.
  - Muestra bio, conflicto de interés declarado, fecha, holdings con pesos y
    total declarado. Aviso explícito de que los pesos los declara el creador.
  - Aviso de "Contenido de terceros, no asesoría" + `LegalNotice fintec`
    (Ley 21.521). No hay recomendaciones, órdenes ni enlaces de ejecución.
  - `generateMetadata` no indexa con la comunidad apagada y usa canonical
    `/creadores/[alias]` cuando está encendida.
  - `instant = false` + `await connection()` según Next 16.
- `tests/community-ui.test.ts` (11 tests)
  - Bandera apagada ⇒ 404 en ambas páginas sin consultar Supabase.
  - Alias inválido ⇒ 404 sin consultar la base.
  - Perfil no verificado / inexistente ⇒ 404.
  - Catálogo filtra perfiles no verificados.
  - Detalle renderiza holdings y excluye carteras rechazadas.
  - Error de Supabase ⇒ aviso, sin filtrar datos.
  - Normalizadores rechazan perfiles/portafolios inválidos.

## Variables de entorno

No se agregaron variables nuevas. Se usa la ya existente de F49-A:

- `COMMUNITY_ENABLED=true` — única forma de encender `/creadores` y
  `/creadores/[alias]`. Cualquier otro valor (incluido `TRUE`, `1`, `" true"`)
  mantiene la comunidad apagada.

## Deudas / pendientes

- Enlaces de entrada a `/creadores` en header, footer y sitemap: no se tocaron
  porque son archivos de registro que une F57.
- Sin datos demo de creadores: con Supabase sin configurar y la bandera
  encendida, el catálogo muestra el aviso de error; no se inventan perfiles.
- Sin paginación más allá de 500 carteras en el catálogo y 100 en el detalle.
- Sin botón de seguir/reportar creador (no estaba en el alcance de F50).
- No se corrió `next build` (lo hace el orquestador y la RAM es limitada).
  Sí corrieron `typecheck`, `lint` y los 646 tests.

## Cómo probar

```bash
cd C:\reclu-work\f9

# 1. Sin la bandera, ambas rutas deben dar 404.
npx vitest run --maxWorkers=1 tests/community-ui.test.ts

# 2. Suite completa y estáticos
npm run typecheck
npm run lint
npx vitest run --maxWorkers=1
```

Prueba manual (servidor local, solo si el orquestador lo permite):

1. `COMMUNITY_ENABLED=true npm run dev`.
2. Sembrar en Supabase un `creator_profiles` con `verificado = true` y al menos
   un `creator_portfolios` con `estado = 'approved'` (migración
   `038_comunidad.sql`).
3. Abrir `/creadores` y `/creadores/<alias>`.
4. Apagar la bandera (o dejarla sin definir) y confirmar 404 en ambas.

## Commits

- `feat: add public creator profile page`
- `test: cover public creator pages`
