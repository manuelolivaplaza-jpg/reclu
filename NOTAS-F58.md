# NOTAS F58 — Migración 050 de Mi portafolio

Rama `v2/f58-migracion-mi-portafolio` (desde `mejoras/integracion`). Fecha: 2026-10-20.

## Qué se hizo

1. **`supabase/migrations/050_mi_portafolio.sql`** (idempotente, estilo 048):
   - `user_holdings`:
     - `quantity numeric(20,6)` con check `>= 0` (nullable).
     - `avg_cost numeric(20,6)` con check `>= 0` (nullable).
     - `currency text not null default 'USD'` con check `USD`/`CLP`.
     - `market text` con check `US`/`CL` (nullable).
     - `broker text` con check de largo máximo 60.
     - `source`: se recrea `user_holdings_source_check` con
       `('csv','manual','cartola')` (`drop constraint if exists` + `add`).
     - Se mantienen `weight` y la RLS `"own holdings all"`
       (`auth.uid() = user_id`). `revoke all` a `anon`; sin vistas públicas.
   - `user_portfolio_settings`:
     - `user_id uuid` PK → `auth.users(id) on delete cascade`.
     - `auto_alerts boolean not null default false` (**opt-in**: parte apagada).
     - `min_relevance numeric(4,3) not null default 0.5` con check `0..1`.
     - `alert_channel text not null default 'email'` con check
       `email`/`telegram`/`both`.
     - `consent_at timestamptz` (null = sin consentimiento), `created_at`,
       `updated_at` + trigger `set_user_portfolio_settings_updated_at`
       (usa `public.set_updated_at()` del esquema base).
     - RLS con cuatro policies (select/insert/update/delete) solo para el
       dueño; `revoke all` a `public, anon`; grants de tabla solo a
       `authenticated` y `service_role`.
   - Función `public.delete_my_portfolio()`:
     - `security invoker`, `set search_path = ''`, `language plpgsql`.
     - Borra `user_holdings` y `user_portfolio_settings` de `auth.uid()` y
       devuelve el total de filas borradas (`get diagnostics row_count`).
     - Si no hay sesión devuelve 0.
     - `revoke` a `public` y `anon`; `grant execute` solo a `authenticated`.
   - Bloque `-- ROLLBACK` comentado al final.

2. **`scrapers/tests/test_migracion_050.py`** (estilo `test_migracion_048.py`):
   8 tests que leen el SQL como texto y verifican `if not exists`, el default
   `false` de `auto_alerts`, la RLS del dueño, los revokes/grants, el
   `search_path = ''`, `security invoker`, que no haya vistas públicas y el
   rollback. No usa red ni base de datos.

3. **`supabase/migrations/README.md`**: fila 44 para la 050 y rango
   `041-050`.

## Variables de entorno

Esta tarea **no agrega ni usa variables nuevas**. Las flags de la tarea
(`MY_PORTFOLIO_ENABLED`, `NEWS_IMPACT_ENABLED`) todavía no existen en el
código; corresponden a las tareas de UI/API (F62, F71+). Cuando se agreguen,
deben quedar apagadas por defecto y encenderse solo con `"true"` exacto.

## Cómo probar

```bash
# desde la raíz
cd scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_migracion_050.py

# verificación general del repo
npm run lint
npm run typecheck
npm test
```

La migración **no se aplicó** contra Supabase real (regla de la tarea). Para
probarla en un proyecto de prueba: ejecutar
`supabase/migrations/050_mi_portafolio.sql` en el SQL Editor después de
`schema.sql`; dos ejecuciones seguidas no deben fallar.

## Pendientes / deudas

- Las columnas nuevas son nullable (`quantity`, `avg_cost`, `market`,
  `broker`): las filas viejas siguen válidas. La validación de obligatoriedad
  por tipo de carga queda para `src/lib/validation.ts` (F60).
- `weight` convive con `quantity`/`avg_cost` hasta que la UI calcule el peso
  desde precios (F62); no se elimina para no romper `/compare` ni
  `src/lib/alignment.ts`.
- El nombre `user_holdings_source_check` asume el nombre autogenerado por
  Postgres para el check inline del `schema.sql`. Si el proyecto de destino
  lo creó con otro nombre, el `drop constraint if exists` no lo encuentra y
  quedaría el check viejo (que solo permite `csv`/`manual`), bloqueando
  `cartola`: revisar `\d user_holdings` antes de aplicar.
- `delete_my_portfolio()` no borra otros datos del usuario (cuenta, follows,
  alert_rules): es solo "borrar mi cartera", como pide la tarea.
- Falta el test de la app (Vitest) para el borrado; llega con la pantalla de
  ajustes (F75).
- Sin `next build` ni `npm run dev` (regla de la tarea): los corre el
  orquestador.
