# F26 — ETFs de congresistas NANC y GOP

Rama: `v2/f26-etf-nanc-gop` (worktree `C:\reclu-work\f26`, base `mejoras/integracion`).
Sin push. Sin escrituras en Supabase.

## Qué se hizo

- `scrapers/etfs.py`
  - `fetch_subversive(slug)` lee el N-PORT oficial en EDGAR (CIK 1742912,
    Tidal Trust I), no la web del emisor (403 + holdings por JS).
  - Series identificadas en vivo el 2026-10-19:
    - NANC = `S000088363` · Unusual Whales Subversive Democratic Trading ETF
    - GOP = `S000088364` · Unusual Whales Subversive Republican Trading ETF
  - `parse_nport_holdings()` usa `pctVal` como peso (ya viene en %), toma
    `repPdDate` como `as_of`, ignora filas sin ticker (efectivo/derivados) y
    descarta pesos <= 0 o > 100. Si falta `pctVal`, calcula el peso con
    `valUSD / netAssets`.
  - `_latest_nport_doc()` busca el N-PORT más nuevo de cada serie en el feed
    de submissions de EDGAR y cachea los documentos por proceso (NANC y GOP
    comparten la mayoría de las peticiones).
  - Si no hay N-PORT para una serie, lanza `ValueError`; el orquestador lo
    muestra como `WARNING` y sigue. No inventa holdings.
  - Se extrajo `save_holdings()` para reutilizar el upsert.
- `scrapers/stages/etfs_subversive.py` (etapa nueva descubierta por F16):
  `etfs_subversive`, opcional, corre NANC/GOP con `--dry-run` o escribe.
- `supabase/migrations/026_etf_politicos.sql`: crea `nanc-etf` y `gop-etf`
  (`category = political_us`, `source = nport_subversive`, `country = US`).
  Solo portafolios; los holdings los carga el scraper. Idempotente con
  `on conflict (slug) do nothing`.
  - **Corregido en F26B:** ambos son `premium = true` y el conflicto hace
    `do update set premium = true`. Son un ETF (producto comercial) con
    holdings del N-PORT, no PTR oficiales; el muro es decisión de producto.
- `src/lib/public-disclosure.ts`: en F26 se agregó `nport_subversive` a las
  fuentes públicas. **Revertido en F26B:** las fuentes exentas vuelven a ser
  solo `oge_278t`, `house_ptr` y `senate_ptr` (5 U.S.C. § 13107).
- `scrapers/tests/test_subversive.py` + fixture
  `scrapers/tests/fixtures/nport_subversive_sintetico.xml` (rotulado como
  SINTÉTICO, sin datos reales).
- `scrapers/run_all.py`: el resumen usaba `✓/✗` y crasheaba en consolas
  Windows cp1252; ahora reconfigura stdout a UTF-8. No cambia la lógica.
- `scrapers/tests/test_stages_discovery.py`: el test de "sin etapas" ahora
  usa un directorio temporal vacío (el repo ya trae una etapa descubierta).

## Variables de entorno

Ninguna nueva. No se tocó `.env*` ni `.env.example`.

## Verificación

- `uv run --with httpx python -m py_compile scrapers/etfs.py scrapers/stages/etfs_subversive.py scrapers/tests/test_subversive.py` → OK.
- `uv run --with httpx --with pytest python -m pytest scrapers/tests/test_subversive.py scrapers/tests/test_stages_discovery.py -q` → 14 passed.
- `uv run --with httpx --with supabase python scrapers/run_all.py --list` → muestra `etfs_subversive  opcional  ETFs NANC/GOP (Subversive, N-PORT EDGAR)`.
- `uv run --with httpx --with supabase python scrapers/run_all.py --only etfs_subversive --dry-run` → GOP 139 holdings, NANC 105 holdings, sin DB.
- `uv run --with httpx --with supabase --with openpyxl python scrapers/run_all.py --only etfs --dry-run` → 14/14 ETFs, sin escribir nada.
- `npm run lint` → OK.
- `npm test` → 22 archivos, 230 tests passed.
- `npm run typecheck` → falla solo por el error conocido de Next 16
  `Cannot find name 'LayoutProps'` en `src/app/layout.tsx` (tipo global
  generado en build; AGENTS.md ya lo documenta). No hay errores nuevos.

Nota: en esta máquina `python` no está en PATH; se usó `uv run ... python`.

## Deudas / pendientes

- `supabase/migrations/018_inverse_cramer.sql` no está en la base
  `mejoras/integracion` (F12 no fusionada). F26 no depende de esa migración;
  se deja constancia como hizo F30. Las migraciones 008, 009, 014–017 y
  019–021 sí están.
- Los holdings NANC/GOP recién se pueblan al correr `etfs_subversive` sin
  `--dry-run` (o `etfs.py` sin `--dry-run`) contra Supabase. La migración no
  siembra pesos para no congelar datos que cambian.
- Para usar NANC/GOP como benchmark visible en la UI falta poblar
  `benchmark_prices` con sus precios y permitir elegir el benchmark en
  `performance-queries.ts` / la página de portafolio. F26 los deja como
  portafolios comparables; no se tocó la selección de benchmark (fuera del
  alcance de archivos listado).
- El N-PORT de EDGAR es trimestral (el último disponible al 2026-10-19 es
  `repPdDate = 2026-06-30`). Entre reportes el scraper reutiliza el mismo
  documento; no hay todavía aviso de "dato con desfase" específico.

## Cómo probar

```powershell
cd C:\reclu-work\f26
uv run --with httpx --with pytest python -m pytest scrapers/tests/test_subversive.py -q
uv run --with httpx --with supabase python scrapers/run_all.py --list
uv run --with httpx --with supabase python scrapers/run_all.py --only etfs_subversive --dry-run
npm run lint
npm test
```

Para revisar la migración sin ejecutarla:

```powershell
Get-Content supabase/migrations/026_etf_politicos.sql
```
