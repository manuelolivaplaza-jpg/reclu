# F64 — Noticias desde los 8-K de la SEC (EDGAR)

Rama `v2/f64-noticias-edgar` (desde `mejoras/integracion`). Fecha: 2026-10-20.

## Hecho

1. **`scrapers/news_edgar.py`**
   - Lee el feed Atom oficial y gratis de 8-K:
     `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom`.
   - Usa `sec13f.USER_AGENT` (`reclu research admin@reclu.cl`) y pausa de
     0,15 s entre requests, igual que los demás scrapers de la SEC.
   - `parse_atom_feed`: acepta solo 8-K y 8-K/A, extrae accession, CIK,
     emisor, URL del índice y `published_at` (UTC, desde `updated`; la fecha
     `Filed:` queda como respaldo). Deduplica por accession.
   - `parse_company_tickers` de `buybacks.py` mapea CIK → ticker principal.
     Los emisores sin ticker se omiten (no se pueden asociar a una posición)
     y se cuentan en `skipped_no_ticker`.
   - Para el resumen se lee el documento principal (índice `index.json` +
     `.htm`) y se extraen los ítems oficiales del 8-K con
     `parse_8k_items` (`Item 2.02`, `5.02`, `8.01`, `9.01`, etc.).
     `summarize_items` arma un texto propio, corto y con tope de 500
     caracteres, por ejemplo:
     `8-K: Item 2.02 Results of Operations and Financial Condition; Item 9.01 Financial Statements and Exhibits`.
     Nunca se guarda el cuerpo del filing. Si no hay ítems, el resumen es
     `8-K: presentación ante la SEC (sin ítems detectados)`.
   - Escribe en `news_items` con `source='sec_8k'`, `url`, `title`,
     `summary`, `published_at`, `lang='en'` y
     `hash = sha256(url)`; el upsert es por `hash` (constraint único de la
     051). En `news_tickers` guarda la relación `direct` con
     `confidence=1.0`. No usa APIs pagadas.
   - Los fallos de red o de un filing puntual se registran como warning y no
     tumban la corrida. `--limit` acota los filings del feed y `--no-items`
     evita descargar el documento principal.
   - `--dry-run` lee la red y no escribe nada en Supabase.

2. **`scrapers/stages/news_edgar.py`**
   - Etapa `news_edgar`, opcional (`critical=False`), descubierta
     automáticamente por `run_all.py` antes de `radar_ia`.
   - Apagada por defecto: solo corre con `NEWS_IMPACT_ENABLED=true`
     (valor exacto). Sin el flag devuelve
     `{"source": "news_edgar", "status": "skipped", ...}` y no toca la red ni
     la base.

3. **Fixture y tests**
   - `scrapers/tests/fixtures/edgar_8k/atom_2026-10-20.xml`: feed sintético
     con 8-K, 8-K/A, un 10-Q que debe ignorarse y un emisor sin ticker.
   - `scrapers/tests/fixtures/edgar_8k/primary_apple.htm`: documento
     principal con ítems 2.02 y 9.01 repetidos, un 99.01 falso y `&nbsp;`.
   - `scrapers/tests/test_news_edgar.py` (19 tests): parseo del feed,
     normalización UTC, deduplicación, ítems y resumen, hash, selección del
     documento principal, flag, dry-run con base trampa y escritura con base
     falsa (upsert por `hash`, relación `direct`/1.0), feed caído y
     descubrimiento de la etapa. Toda la red está mockeada.

4. **`.env.example`**
   - Documenta `NEWS_IMPACT_ENABLED="false"` (apagado por defecto, solo el
     valor exacto `true` lo enciende).

No se tocó Supabase real, no se corrieron migraciones y no se levantó el
servidor.

## Verificación

```powershell
cd C:\reclu-work\f26\scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_news_edgar.py
# 19 passed

uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_stages_discovery.py tests/test_stages_smoke.py
# 33 passed

uv run --with pytest --with-requirements requirements.txt pytest -q tests/
# 335 passed, 1 skipped
```

Desde la raíz:

- `npm run lint`: OK.
- `npm test`: 65 archivos, 778 tests, OK.
- `npm run typecheck`: falla solo con
  `src/app/layout.tsx(63,50): error TS2304: Cannot find name 'LayoutProps'`.
  Es el error conocido de Next 16: `LayoutProps` es un tipo global que genera
  el build (ver `AGENTS.md`); no viene de esta tarea y no hay cambios en
  `src/`.

## Cómo probar a mano (sin Supabase real)

Con la red mockeada en los tests. Para una corrida real de lectura, exportar
`NEWS_IMPACT_ENABLED=true` y usar siempre `--dry-run`:

```powershell
cd C:\reclu-work\f26\scrapers
$env:NEWS_IMPACT_ENABLED = "true"
uv run --with-requirements requirements.txt python news_edgar.py --dry-run --limit 10
```

Sin `NEWS_IMPACT_ENABLED=true` el comando (y la etapa) se niega a correr.
Para una escritura real hace falta `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` y la migración 051 aplicada.

## Pendiente / deudas

- El resumen depende de que el documento principal sea HTML; si un 8-K trae
  solo XML, se guarda la noticia sin ítems (el fallback sigue siendo válido).
- Cada filing con ticker consume 2 requests (índice + documento). El feed
  trae hasta 100; `--limit` permite acotar la corrida.
- La relación es solo `direct` (el CIK es del emisor). Sector, proveedores,
  competidores y macro quedan para F67/F68.
- `MY_PORTFOLIO_ENABLED` no se usa en esta tarea: el feed todavía no tiene UI
  (F72). No se creó `src/lib/portfolio-flags.ts` porque no existía en la base
  y F64 es solo scraper.
- No se agregó `news_edgar` a `docs/sources.md` para no ampliar el alcance;
  conviene documentarlo cuando se revise el estado de las fuentes.
