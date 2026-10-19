# NOTAS F27 — Activistas (Schedule 13D)

Rama: `v2/f27-activistas-13d` (worktree real: `C:\reclu-work\f25`, sin push).
Base verificada: `mejoras/integracion` con `008`, `009`, `014`–`021` presentes.

## Qué se hizo

- `scrapers/activists_13d.py`
  - EFTS (`https://efts.sec.gov/LATEST/search-index`) con `forms=SCHEDULE 13D`,
    rango de 90 días y paginación de 100 en 100 (máximo 10 páginas = 1.000
    filings por corrida).
  - `User-Agent` importado de `sec13f.USER_AGENT`; pausa de 0,12 s entre
    requests (menos de 10 por segundo). `sec13f.py` no se modificó.
  - Parseo de `primary_doc.xml` (schedule13D, namespace-agnóstico): emisor,
    CIK, filer, `percentOfClass`, `dateOfEvent` y URL del filing.
  - El ticker sale de `display_names` de EFTS (el XML no lo trae).
  - Sin direcciones, teléfonos ni personas autorizadas en el modelo.
  - Portafolio `activistas-13d`: una posición igual-pesada por emisor con
    ticker entre los 13D de los últimos 90 días.
  - Alertas `new_trade` con `payload.source_url` al filing. Se alerta solo lo
    presentado en los últimos 7 días para no inundar en la primera corrida
    (la tabla y el portafolio sí cubren 90 días).
- `scrapers/stages/activists_13d.py`: etapa opcional (no crítica),
  descubierta por `run_all.py` antes de `radar_ia`.
- `supabase/migrations/027_activistas.sql`:
  - `public.activist_filings` con `accession` único, RLS y lectura pública
    (`anon`, `authenticated`); escritura solo service role.
  - Portafolio `activistas-13d` ("Activistas: últimos 90 días", categoría
    `public_disclosure`, source `sec_schedule_13d`).
  - Idempotente: `create ... if not exists`, `drop policy if exists`,
    `on conflict (slug) do nothing`. No se ejecutó contra Supabase real.
- `scrapers/tests/fixtures/efts_13D_2026-10.json` (copia de
  `scrapers/data/v2/F27/efts_13D_2026-10.json`).
- `scrapers/tests/test_activists_13d.py`: 14 tests sin red ni Supabase
  (fixture EFTS, XML inline real, dedupe, tickers, holdings, alertas,
  paginación y etapa).

## Variables nuevas

Ninguna. Se reutiliza `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y el
`User-Agent` de `sec13f.py`. No se tocó `.env.example`.

## Deudas / límites conocidos

- La primera corrida de escritura descarga hasta 1.000 `primary_doc.xml`
  (~5–10 min a 10 req/s). Después solo baja los accessions nuevos.
- EFTS se corta a 10 páginas; si un trimestre supera 1.000 filings, quedan
  fuera los más antiguos (los más recientes entran primero por el orden de
  EFTS).
- `percentOfClass` se toma del primer `reportingPersonInfo` (no del máximo del
  grupo). Si el primer filer reporta 0,0 % en una enmienda, la fila se guarda
  pero no genera alerta (`MIN_PERCENT = 5`).
- Sin UI ni seed de holdings: la canasta se arma en la primera corrida real.
  El aviso legal visible corresponde al componente de F16.
- No se ejecutó `027_activistas.sql`; la idempotencia se revisó por lectura y
  se cubre con un test estático.
- `npm run typecheck` falla solo por `LayoutProps` en `src/app/layout.tsx`
  (error preexistente documentado en `AGENTS.md`; el build real lo genera).
  `npm run lint` y `npm test` pasan.

## Cómo probar

```powershell
# tests Python (sin red; usa httpx/pytest/supabase vía uv)
uv run --python 3.11 --with httpx --with pytest --with supabase `
  python -m pytest scrapers/tests/test_activists_13d.py -q

# compilación
uv run --python 3.11 python -m py_compile `
  scrapers/activists_13d.py scrapers/stages/activists_13d.py `
  scrapers/tests/test_activists_13d.py

# etapa visible
uv run --python 3.11 --with httpx --with supabase python scrapers/run_all.py --list

# dry-run real (no escribe; lee EFTS y una muestra de 20 XML)
$env:PYTHONIOENCODING="utf-8"
uv run --python 3.11 --with httpx --with supabase `
  python scrapers/run_all.py --only activists_13d --dry-run
```

`PYTHONIOENCODING=utf-8` evita que el resumen de `run_all.py` falle en consolas
Windows cp1252 al imprimir el check.

## Estado de verificación

- `py_compile`: OK.
- `pytest scrapers/tests` (todos): 83 passed, 2 skipped.
- `pytest scrapers/tests/test_activists_13d.py`: 14 passed.
- `npm run lint`: OK.
- `npm test`: 294 passed (27 archivos).
- `npm run typecheck`: falla solo por `LayoutProps` preexistente.
- `run_all.py --list`: muestra `activists_13d` antes de `radar_ia`.
- `run_all.py --only activists_13d --dry-run`: OK, 1.000 filings, 20 XML
  leídos, 17 holdings de muestra, sin escrituras.
