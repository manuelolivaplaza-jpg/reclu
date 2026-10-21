# F65 — Noticias desde hechos esenciales de la CMF

Rama: `v2/f65-noticias-cmf` (desde `mejoras/integracion`). Sin push.
Commits: `ae495e5` (ingesta) y `7ea10ec` (flag).

## Hecho

- `scrapers/news_cmf.py`: adaptador `CmfNewsAdapter`.
  - Lee `cl_material_events` (032) ordenado por `fecha` descendente, con tope
    `--limit` (200 por defecto).
  - Convierte cada hecho en `news_items`: `source='cmf_hechos'`, `url`,
    `title` = materia (o el título de la portada si falta), `published_at` =
    fecha, `lang='es'` y un resumen propio de máximo 500 caracteres.
  - `hash` = sha256 de la URL. El upsert usa `on_conflict='hash'` +
    `ignore_duplicates`, así que reingerir no duplica.
  - Deduplica también dentro del mismo lote (misma URL).
  - Hechos sin URL o sin fecha se omiten y se cuentan en `omitidos`.
- `news_tickers` con `relation='direct'`:
  - Coincidencia exacta contra los nombres verificados de
    `scrapers/data/infoprobidad/rut_nemotecnico.json` (se ignoran tildes,
    mayúsculas y sufijos S.A./SA/SPA/LTDA): `confidence=1.0`.
  - Si no hay alias exacto, se usa `resolve_tickers.resolve_name` (Yahoo,
    con caché): `confidence=0.7`.
  - Sin nemo, la noticia igual se guarda, sin fila en `news_tickers`.
  - `resolve_nemo()` acepta un `resolver` inyectable: los tests no tocan red.
- `scrapers/stages/news_cmf.py`: etapa autodescubierta por
  `run_all.py` (id `news_cmf`, no crítica). Reutiliza lo que ya bajó
  `cmf_hechos`; si la CMF bloqueó, simplemente no hay hechos nuevos.
- Flag: toda la etapa está apagada salvo `NEWS_IMPACT_ENABLED="true"`
  (solo ese valor exacto; `1`, `TRUE` en mayúsculas se acepta por
  `.lower()`, pero `1`/`yes` no). Apagada responde
  `{"status": "disabled"}` sin abrir Supabase. El CLI de escritura también
  respeta el flag; `--dry-run` y `--json` funcionan siempre.
- `--dry-run` no lee ni escribe Supabase (lo exige `test_stages_smoke.py`).
  Para previsualizar datos hay `--json archivo.json` o
  `adapter.run(None, eventos=[...])`.

## Tests

`scrapers/tests/test_news_cmf.py` (23 tests): hash estable, título/resumen,
omitidos, alias exacto 1.0, aproximado 0.7, sin nemo, dedupe por hash,
reingesta sin duplicados, dry-run con cliente trampa, CLI dry-run, contrato de
la etapa y flag.

Verificado desde `scrapers/`:

```bash
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_news_cmf.py
uv run --with pytest --with-requirements requirements.txt pytest -q tests/
```

Resultado: 23/23 y 339 passed, 1 skipped (suite completa de scrapers).
En la raíz: `npm run lint`, `npm run typecheck` y `npm test` (778 tests) OK.

## Notas / pendientes

- `scrapers/data/v2/F65/` no existía en el worktree; no se inventaron datos.
  Los tests usan hechos en memoria.
- El mapeo aproximado de Yahoo solo considera listados de EE.UU.
  (`resolve_tickers.pick_ticker`), así que para emisoras chilenas fuera del
  mapa verificado lo normal es que no haya nemo; la noticia se guarda sin
  ticker. Si se quiere cobertura BCS completa, ampliar
  `rut_nemotecnico.json` (es el camino de confianza 1.0).
- Falta poblar en Supabase real cuando el flag se encienda (no se corrió
  contra la base en esta tarea).
- El feed/UI y las alertas de noticias son F72/F73, fuera de F65.
- `news_items.published_at` se guarda como fecha ISO (`YYYY-MM-DD`);
  Postgres la interpreta como medianoche en la zona de la sesión.

## Cómo probar

```bash
# desde scrapers/
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_news_cmf.py
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_stages_smoke.py

# dry-run sin red ni base
uv run --with-requirements requirements.txt python news_cmf.py --dry-run

# previsualizar un JSON local de hechos (sin escrituras)
uv run --with-requirements requirements.txt python news_cmf.py --json hechos.json
```
