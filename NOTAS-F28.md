# F28 — Spin-offs (Form 10-12B)

## Hecho

- `scrapers/spinoffs.py`
  - EFTS `forms=10-12B` (incluye enmiendas `10-12B/A`), ventana de 12 meses,
    paginado y User-Agent de `sec13f.USER_AGENT` con pausa de 0,12 s.
  - `parse_efts_payload`: deduplica por accession. El CIK y el nombre salen
    de `display_names` (`split_display_name` de F27); el ticker se toma de
    `display_names` cuando aparece.
  - `group_by_cik`: una fila por CIK; conserva el ticker visto en cualquier
    enmienda aunque la última no lo repita; calcula `first_filed_at`,
    `last_filed_at`, número de filings y `status`.
  - `status`: `cotizando` si hay ticker, `en curso` si aún no aparece.
    **Es una heurística pública**: el ticker puede asignarse antes del primer
    día de cotización; no se promete que ya transaccione.
  - `holdings_from_spinoffs`: canasta igual-pesada solo con spin-offs que
    tienen ticker y último filing dentro de 12 meses.
  - `SpinoffsAdapter`: `--dry-run` hace fetch + parse y no toca Supabase;
    el modo escritura hace upsert en `spinoffs` por `cik` y sincroniza los
    holdings del portafolio (insert/update/delete con `previous_weight`).
  - Sin alertas: el objetivo de F28 es registrar y mantener la cartera.
- `scrapers/stages/spinoffs.py`: etapa autodescubierta `spinoffs`, opcional,
  se inserta antes de `radar_ia`.
- `supabase/migrations/028_spinoffs.sql`
  - Tabla `public.spinoffs`: `cik` (unique), `name`, `ticker`,
    `first_filed_at`, `last_filed_at`, `status`, `source_url`, timestamps.
  - RLS con lectura pública y escritura solo por service role.
  - Portafolio `spinoffs-12m` (“Spin-offs de los últimos 12 meses”),
    categoría `public_disclosure`, source `sec_form_10_12b`.
  - Idempotente: `create table/index if not exists`, `drop policy if exists`,
    `on conflict (slug) do nothing`. Revisado leyendo el SQL; no se ejecutó.
- `scrapers/tests/test_spinoffs.py` + fixture
  `scrapers/tests/fixtures/efts_10-12B_2026H2.json` (copiado de
  `scrapers/data/v2/F28/`). 9 tests, sin red ni Supabase.

## Verificación

```
uv run --python 3.11 python -m py_compile \
  scrapers/spinoffs.py scrapers/stages/spinoffs.py scrapers/tests/test_spinoffs.py

uv run --python 3.11 --with httpx --with pytest --with supabase \
  python -m pytest scrapers/tests/test_spinoffs.py -q       # 9 passed

uv run --python 3.11 --with httpx --with pytest --with supabase --with pypdf \
  python -m pytest scrapers/tests -q                        # 114 passed, 1 skipped

uv run --python 3.11 --with httpx --with supabase \
  python scrapers/run_all.py --list                         # muestra spinoffs

$env:PYTHONIOENCODING='utf-8'
uv run --python 3.11 --with httpx --with supabase \
  python scrapers/run_all.py --only spinoffs --dry-run
# 55 filings, 24 spin-offs, 13 con ticker; sin escrituras (2026-10-19)
```

`npm run lint` OK y `npm test` OK (34 archivos, 380 tests). `npm run typecheck`
falla solo por el `LayoutProps` global de `src/app/layout.tsx`, error conocido
de tsc aislado documentado en `AGENTS.md`; el build real lo genera.

## Variables nuevas

Ninguna. Se reutilizan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y el
User-Agent de `sec13f.USER_AGENT` (contacto `admin@reclu.cl`).

## Deudas / notas

- El dry-run contra EFTS en vivo mostró que el fixture de julio–octubre 2026
  no incluye todos los filings del período (p. ej. Trinzic ya aparece con
  ticker `TZIC` y Honeywell Aerospace con `HONA`); los tests usan solo el
  fixture congelado, así que no dependen de la red.
- `run_all.py` en consola Windows cp1252 falla al imprimir el resumen con
  `✓`; con `PYTHONIOENCODING=utf-8` termina bien. Es un problema previo del
  orquestador, no de esta etapa.
- No hay UI ni backtest en esta tarea. Cuando existan datos de precios, el
  panel debe mostrar el backtest solo si hay historial suficiente y sin
  prometer sobrerrendimiento (HIPÓTESIS). El aviso legal corresponde a F16.
- No se registró la etapa en `docs/sources.md` ni en el README de migraciones:
  esos archivos los une F57.
- `scrapers/data/v2/F28/` y `F27/` quedan sin commitear: son datos de entrada
  del orquestador; el fixture usado por el test sí está versionado.
