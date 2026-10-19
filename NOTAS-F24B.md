# NOTAS-F24B — Unificar slugs de corredoras con la 044

Rama `v2/f24b-unificar-slugs` (worktree `C:\reclu-work\f23`). Sin push.

## Qué se hizo

1. **Migración `supabase/migrations/024_consenso_corredoras.sql`**
   - Los dos portafolios de corredoras usan los slugs oficiales de la 044:
     `bice-acciones-destacadas` y `mbi-acciones-recomendadas`.
   - Se separó el insert en dos sentencias:
     - BICE y MBI: mismos valores que la 044 y
       `on conflict (slug) do nothing`. Aplicar 024 antes o después de 044
       deja el mismo estado y ninguna pisa a la otra.
     - Consenso: mantiene `consenso-corredoras-cl` y su
       `on conflict (slug) do update` de `description`/`source`.
   - Los holdings semilla (7 BICE + 5 MBI + 10 consenso) ahora apuntan a los
     slugs oficiales. Sigue el `on conflict (portfolio_id, symbol, as_of)
     do nothing`.

2. **Panel `src/components/source-panels/corredoras-cl.tsx`**
   - Los slugs de respaldo/consulta pasaron a
     `bice-acciones-destacadas` y `mbi-acciones-recomendadas`.

3. **Parser `scrapers/corredoras_cl.py`**
   - Ya usaba los slugs de la 044 (`BiceCarteraAdapter.portfolio_slug` y
     `MbiCarteraAdapter.portfolio_slug`). No requirió cambios.

4. **Tests**
   - Nuevo `scrapers/tests/test_migracion_024.py` (4 tests): la 024 usa los
     slugs de la 044 y no los viejos, BICE/MBI se insertan con
     `do nothing`, el consenso conserva su slug y todos los holdings semilla
     apuntan a slugs declarados.
   - `test_migracion_044.py`, `test_consenso.py` y `test_corredoras_cl.py`
     siguen pasando sin cambios.

5. **`NOTAS-F24.md`**: deuda 1 marcada como resuelta y datos de la 024
   actualizados a los slugs oficiales.

## Verificación

- `uv run --no-project --with pytest --with-requirements scrapers/requirements.txt pytest scrapers/tests/test_migracion_024.py scrapers/tests/test_migracion_044.py scrapers/tests/test_consenso.py scrapers/tests/test_corredoras_cl.py -q`:
  **25 passed**.
- Suite Python completa: **103 passed, 1 skipped, 1 failed**. El fallo es
  ajeno a esta tarea y ya venía de la base:
  `test_stages_discovery.py::test_corredoras_cl_aparece_antes_de_radar_ia`
  usa `tmp_path` sin recibirlo como fixture (`NameError`).
- `npm run lint`: verde.
- `npm test`: **344 passed** (31 suites).
- `npm run typecheck`: verde.

## Pendientes / notas

- No se ejecutó nada contra Supabase real (regla del orquestador).
- La carpeta `scrapers/data/v2/F24B/` no existía; no hizo falta: los datos
  son los de F24/F23 y la 044.
- Sigue vigente la deuda 2 de `NOTAS-F24.md` (el consenso no se reescribe
  solo en cada corrida) y la deuda 3 (bajas sin alerta).
- El fallo de `test_stages_discovery.py` no se tocó: queda para su tarea.

## Cómo probar

```powershell
# Tests Python relacionados
uv run --no-project --with pytest --with-requirements scrapers/requirements.txt pytest scrapers/tests/test_migracion_024.py scrapers/tests/test_migracion_044.py scrapers/tests/test_consenso.py scrapers/tests/test_corredoras_cl.py -q

# Front
npm run lint
npm test
npm run typecheck
```

Para Supabase de prueba: aplicar 024 y 044 en cualquier orden, dos veces
cada una. Deben quedar exactamente dos filas de corredoras
(`bice-acciones-destacadas`, `mbi-acciones-recomendadas`), una de consenso,
y ningún slug `*-cartera-recomendada`.

## Commit

- `fix: unify broker portfolio slugs with migration 044`
