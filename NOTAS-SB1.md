# NOTAS SB1 — Endurecer migraciones (M1, M3, B1, 037)

Rama: `v2/sb1-migraciones-endurecer` (desde `mejoras/integracion`).
Origen de los hallazgos: `docs/revision-seguridad-2026-10-20.md`.

## Hecho (3 commits)

1. **M1** — `chore: move 043 rollback out of migrations dir (M1)`
   - `git mv supabase/migrations/043_ocultar_demos_down.sql`
     → `supabase/rollback/043_ocultar_demos_down.sql` (carpeta nueva).
   - Referencias actualizadas: `supabase/migrations/README.md` (sección 043)
     y el comentario de reversión dentro de `043_ocultar_demos.sql`.
     Las NOTAS-*.md de tareas viejas son registros históricos: no se tocaron.
2. **B1 + fila 037 + M3** — `feat: add migration 046 hardening permissions`
   - Nueva `supabase/migrations/046_endurecer_permisos.sql`, idempotente:
     - **B1:** `revoke insert, update, delete` a `anon, authenticated` en las
       9 tablas (`activist_filings`, `spinoffs`, `buybacks`, `cl_dividends`,
       `cl_material_events`, `cl_top_shareholders`, `cl_mutual_funds`,
       `cl_mutual_fund_holdings`, `sponsorships`), cada una dentro de un
       `do $$ ... if to_regclass('public.<tabla>') is not null`.
     - **Fila 037:** `revoke execute on function
       public.enforce_alert_rule_limits() from public, anon, authenticated`,
       con guarda `to_regprocedure(...) is not null`.
     - **M3:** `public.anonimizar_accionista()` (`security definer`,
       `set search_path = ''`, con `revoke execute`) + trigger
       `anonimizar_accionista` `BEFORE INSERT OR UPDATE` en
       `cl_top_shareholders`. Regex societario copiado EXACTO de la 045
       (límites de palabra `(^|[^[:alnum:]])(...)([^[:alnum:]]|$)`); si
       `NEW.accionista` no calza → `Persona natural (#ranking)` +
       `es_persona_natural = true`. Si ya empieza con
       `Persona natural (#`, lo deja (idempotente). Fallo cerrado.
   - README de migraciones: fila 19 en la tabla de orden + sección 046
     completa con reversión.
3. **Test** — `scrapers/tests/test_migracion_046.py` (mismo commit que la 046):
   - Verifica por texto que el regex de la 046 es IDENTICO al de la 045.
   - Verifica las 9 tablas con guarda `to_regclass` + revoke, y que hay
     exactamente 9 revokes de tabla.
   - Verifica revoke de `enforce_alert_rule_limits()`, la función M3
     (`security definer`, `search_path`, revoke, trigger BEFORE INSERT OR
     UPDATE, texto de reemplazo con ranking, idempotencia del
     `Persona natural (#%`) y el comentario de rollback.
   - 5 tests, corren con pytest o directo con `python` (fallback `__main__`).

## Pendiente (fuera del alcance de SB1)

- **M2** (aplicar 045 junto a 033 y revisar filas existentes) es tarea de
  despliegue de Manu en Supabase real, no de esta rama.
- La 037 declara en comentario que "no se revoca EXECUTE"; la 046 lo revoca
  de todos modos (el comentario histórico de la 037 no se tocó — la 046 es
  quien manda).
- `cl_mutual_funds_ranking` (034) no está en la lista de las 9 tablas del
  hallazgo B1; quedó con solo `grant select` como venía.

## Cómo probar

```bash
cd C:/reclu-work/f13
python scrapers/tests/test_migracion_046.py      # 5/5 ok (o con pytest si está)
npm run lint && npm test && npm run typecheck     # 499 tests Vitest OK
git log --oneline -3                              # los 3 commits de arriba
ls supabase/rollback/                             # 043_ocultar_demos_down.sql
ls supabase/migrations/046_endurecer_permisos.sql
```

Verificación ya corrida en esta rama: lint OK, 499/499 Vitest OK,
typecheck OK. No se corrió `npx next build` (lo corre el orquestador) ni se
tocó Supabase real. Sin push.
