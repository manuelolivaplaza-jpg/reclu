# NOTAS-M44 — Migración 044 (slugs F23: BICE y MBI)

## Hecho

1. `supabase/migrations/044_corredoras_cl.sql` (commit `1922339`).
   - Inserta `bice-acciones-destacadas` y `mbi-acciones-recomendadas`.
   - `category='broker_cl'`, `country='CL'`, `premium=false`, `followers=0`,
     `return_ytd=null`, `is_active=true`.
   - `source` = nombre del adaptador (`bice_cartera`, `mbi_cartera`), tal como
     reporta `corredoras_cl.py` en cada resultado.
   - `on conflict (slug) do update` toca SOLO `description` y `source`
     (nunca `followers` ni `return_ytd`).
   - Descripción con la URL pública: BICE usa su PDF fijo
     (`mercadosenlinea.biceinversiones.cl/reportes/cartera-inversiones-bice.pdf`);
     MBI enlaza el listado público `corredores.mbi.cl/publicaciones` porque su
     PDF cambia de nombre cada mes.
   - Sin holdings semilla.
2. `supabase/migrations/README.md`: fila 17 de la tabla + sección `## 044`.
   Dice aplicar después de `021_infoprobidad_agregado.sql` (y de la `043` si
   existe); independiente de `022-042`. En esta rama la `043` **no existe**.
3. `scrapers/tests/test_migracion_044.py` (commit `08e00b3`): 4 tests que
   leen el SQL como texto y verifican que los slugs y `source` del parser
   coinciden con la 044, que no hay slugs de más y que el `do update` no toca
   `followers`/`return_ytd`.

## Verificación

- `uv run --no-project --with pytest --with-requirements scrapers/requirements.txt pytest scrapers -q`
  → `75 passed, 1 skipped`.
- `npm run lint` → ok.
- `npm test` → 27 files, 294 tests passed.
- `npm run typecheck` → falla solo con `Cannot find name 'LayoutProps'` en
  `src/app/layout.tsx` (error conocido: tipo global generado en build, no es de
  esta tarea; `npx next build` lo resuelve).

## Pendiente / para el orquestador

- Nada más de esta tarea. Los slugs ya tienen fila, así que la etapa
  `corredoras_cl` puede correr sin `--dry-run` una vez aplicada la 044.
- No se corrió `npx next build` (lo hace el orquestador) ni se hizo push.
