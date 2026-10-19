# NOTAS F31 — Cliente CMF (WAF) y dividendos chilenos

Rama `v2/f31-cmf-cliente-dividendos` (worktree `C:\reclu-work\f12`). Base
`mejoras/integracion` con F2, F4 y F8–F15 verificadas: existen
`supabase/migrations/008_planes_alertas.sql`, `009_pagos_suscripciones.sql` y
`014`–`021`. Sin push (regla del orquestador).

## Qué se hizo

1. **Fixtures reales capturados** (`scrapers/tests/fixtures/cmf/`), el 2026-10-19
   desde IP residencial. El WAF de la CMF bloquea datacenters, pero el sitio
   respondió bien por GET:
   - `acc_dividendos_index.html` — formulario `f1`.
   - `acc_dividendos1grid_2026.html` — grilla real 2026 (`sociedad[]=0`),
     219 columnas de dividendo / 201 registros únicos.
   - `acc_dividendos1grid_empty.html` — caso "No se encuentran datos".
   - `cmf_blocked_blocked_synthetic.html` — **sintético** para probar el bloqueo
     (deuda: reemplazar por una captura real si el WAF nos vuelve a bloquear).
   - `README.md` con la procedencia.

2. **`scrapers/cmf_client.py`** — cliente CMF:
   - `curl_cffi` con `impersonate="chrome"`; si falta, `RuntimeError` claro.
   - `User-Agent` de Chrome + firma `reclu-scraper/1.0`, `Accept-Language: es-CL`.
   - límite de **1 solicitud por segundo** por cliente.
   - reintentos con **backoff exponencial** ante errores de red, 5xx y 429.
   - `_is_blocked()` detecta la página de bloqueo por marca
     (`web page blocked`, `request rejected`, …) o por estado
     `{401, 403, 406, 451}`; entonces lanza **`CmfBlocked`** (sin reintentar).
   - `get(url, params)`, `post(...)`, `build_url(path, params)` y un `get()`
     de módulo con cliente por defecto. Pensado para reuso de F32–F34.

3. **`scrapers/cmf_dividendos.py`** — parser + adaptador del calendario:
   - `parse_dividendos(html)` invierte la grilla transpuesta de
     `acc_dividendos1grid.php` (`cols`/`rows` de `dataAsJson`): nemo, razón
     social, RUT emisor, número de dividendo, serie, tipo, fechas (acuerdo,
     cierre, límite, pago), moneda, monto por acción.
   - tipos 1/2/3 → `provisorio` / `definitivo` / `adicional`.
   - `dedupe_dividendos` por `(nemo, fecha_pago, numero_dividendo, serie)`.
   - `CmfDividendosAdapter` con `fetch_raw/normalize/run`, `dry_run` que **no
     escribe**, y upsert idempotente (`on_conflict` +
     `ignore_duplicates=True`) con `source_url`.
   - CLI: `--dry-run`, `--anio`, `--html <archivo>` (parseo offline).

4. **`scrapers/stages/cmf_dividendos.py`** — etapa autodescubierta
   (`STAGE = ("cmf_dividendos", ..., False)`). Ante `CmfBlocked` registra un
   `scraper_error` (`severity=low`, `is_published=false`) sobre el portafolio
   `dividendos-cl` y **sigue** con `status: "blocked"`. En `--dry-run` no
   toca Supabase.

5. **`supabase/migrations/031_dividendos_cl.sql`** — tabla `public.cl_dividends`
   (emisor + número + serie + pago, con `unique`), índice por fecha, **lectura
   pública** (`policy ... using (true)` + `grant select to anon, authenticated`)
   y un `insert ... on conflict (slug) do update` del portafolio
   `dividendos-cl` (hospeda el calendario y los `scraper_error`).
   Idempotente: `create table/index if not exists`, `drop policy if exists`,
   upsert del portafolio; no reescribe `followers`/`return_ytd`.

6. **`scrapers/tests/test_cmf_dividendos.py`** — 21 tests sin red ni Supabase:
   parser (219 crudos / 201 únicos, SANTAMARIA, HABITAT, series, vacío),
   `dedupe`, params/URL, detección de WAF (`CmfBlocked` con 200-bloqueo y 403,
   reintento en 503/red, 404 = error), adaptador `dry_run`/upsert/`CmfBlocked`,
   etapa con `scraper_error` vía db falsa y la 031.

## Variables de entorno nuevas

**Ninguna.** La CMF es pública y sin login. No se tocó `.env.example`
(lo une F57).

## Privacidad y legal

- Leyes 19.628 / 21.719: `cl_dividends` no guarda datos personales (solo
  emisor, nemotécnico, RUT de la sociedad y montos por acción).
- Ley Fintec: dato informativo; no ejecuta órdenes, no enruta y no es
  recomendación. Sin UI en esta tarea (la tabla queda con lectura pública para
  que la use una tarea posterior).
- 5 U.S.C. § 13107 no aplica (fuente chilena).

## Verificación (todo en verde)

```bash
# con venv local (uv venv .venv --python 3.11 && uv pip install -r scrapers/requirements.txt pytest)
python -m py_compile scrapers/cmf_client.py scrapers/cmf_dividendos.py \
    scrapers/stages/cmf_dividendos.py scrapers/tests/test_cmf_dividendos.py
python -m pytest scrapers/tests/test_cmf_dividendos.py -q   # 21 passed
python -m pytest scrapers/tests -q                          # 125 passed, 1 skipped
python scrapers/run_all.py --list                           # incluye cmf_dividendos
python scrapers/run_all.py --only cmf_dividendos --dry-run  # OK, 201 dividendos, no escribe
npm run typecheck && npm run lint && npm test               # 380 tests
```

Live: `run_all.py --only cmf_dividendos --dry-run` devolvió
`{'source':'cmf_dividendos','anio':2026,'dividendos':201,'status':'ok','dry_run':True}`.

## Pendientes / deudas

- Sustituir el fixture de bloqueo sintético por una captura real del WAF.
- La 031 solo crea datos; **no hay UI** para el calendario (tarea posterior).
  No se tocaron los archivos de registro de F57.
- Si el WAF empieza a bloquear también IPs residenciales, la etapa dejará
  `scraper_error` y `status: "blocked"`: revisar desde GitHub Actions.
- `fecha_pago` es `NOT NULL`: los dividendos sin fecha de pago se descartan
  (en la grilla real siempre viene).
- El DST de `--anio` por defecto es el año en curso; repetir con `--anio` para
  históricos.

## Commits

- `test(f31): capture live CMF dividendos fixtures`
- `feat(f31): add CMF client, dividends calendar and migration`
