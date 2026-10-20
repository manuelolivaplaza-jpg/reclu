# F29 — Recompras de acciones (XBRL frames de la SEC)

## Hecho

- `scrapers/buybacks.py`
  - Fuente: XBRL frames públicos de la SEC, sin clave:
    `https://data.sec.gov/api/xbrl/frames/us-gaap/PaymentsForRepurchaseOfCommonStock/USD/CY{año}Q{n}.json`
    (verificado en vivo 2026-10-19; CY2026Q2 trae 134 empresas, 114 con monto
    positivo).
  - CIK → ticker con `https://www.sec.gov/files/company_tickers.json`
    (verificado en vivo). El archivo repite un CIK para clases o instrumentos
    relacionados (TMUSZ, TMUSI, TMUSL); `parse_company_tickers` conserva la
    primera aparición, que es el ticker principal.
  - `select_period`: trimestres candidatos desde el más reciente; elige el
    primero con ≥ 50 filas (el trimestre en curso suele estar incompleto).
  - `parse_frame`: filas con monto positivo; conserva CIK, nombre, período,
    fechas, monto y URL pública del filing (`-index.htm` por accession).
  - `rank_buybacks`: ordena por monto descendente; con `require_ticker=True`
    solo entran empresas con ticker identificable (sirve para el portafolio);
    `top_n=0` devuelve todas (para guardar el frame completo en la tabla).
  - % de capitalización: acciones `dei:EntityCommonStockSharesOutstanding`
    (companyconcept por CIK, último valor) × precio de cierre de
    `prices.fetch_eod` (Yahoo). Aproximación pública y educativa, no un
    buyback yield exacto; si falta un insumo, la columna queda en `null`.
  - `holdings_from_buybacks`: canasta igual-pesada con el top; un holding por
    ticker (deduplicado).
  - `BuybackAdapter`: User-Agent de `sec13f.USER_AGENT` y pausa de 0,12 s
    entre requests (< 10/s, política SEC). `--dry-run` hace fetch + parse +
    ranking completo y no escribe nada; el modo escritura upsertea
    `public.buybacks` por `(cik, period)` y sincroniza los holdings del
    portafolio con `previous_weight` (insert/update/delete).
  - Sin datos personales: CIK, ticker, nombre del emisor, período, monto,
    acciones, precio, market cap y URL del filing.
- `scrapers/stages/buybacks.py`: etapa autodescubierta `buybacks`, opcional
  (un frame caído no tumba la corrida).
- `supabase/migrations/029_recompras.sql`
  - Tabla `public.buybacks`: una fila por empresa y trimestre calendario;
    unique `(cik, period)`; índices por `(period, amount_usd desc)` y ticker.
  - RLS con lectura pública (`using (true)`) y escritura solo por service
    role (sin políticas de insert/update/delete).
  - Portafolio `recompras-top20` (“Top 20 recompras”), categoría
    `public_disclosure`, source `sec_xbrl_frames`.
  - Idempotente: `create table/index if not exists`, `drop policy if exists` +
    create, `on conflict (slug) do nothing`, `create extension if not exists`.
    Revisado leyendo el SQL; no se ejecutó contra Supabase real.
- `scrapers/tests/test_buybacks.py` + fixture
  `scrapers/tests/fixtures/frames_buybacks_CY2026Q2.json` (idéntico al de
  `scrapers/data/v2/F29/`). 11 tests, sin red ni Supabase: parseo del frame
  (114 filas positivas), top 3 = Netflix / McKesson / T-Mobile con tickers y
  montos, URL del filing, ticker principal vs. clases, trimestres candidatos,
  market cap y % de capitalización, filas sin precio/acciones en `null`,
  top 20 igual-pesado, ranking sin tope y registro de tabla; dry-run con una
  base que explota si la toca.

## Verificación

```
python -m py_compile scrapers/buybacks.py scrapers/stages/buybacks.py \
  scrapers/tests/test_buybacks.py                    # OK

uv run --no-project --with pytest --with httpx --with supabase \
  python -m pytest scrapers/tests/test_buybacks.py -q        # 11 passed

uv run --no-project --with pytest --with httpx --with supabase \
  python -m pytest scrapers/tests -q                  # 137 passed, 2 skipped

uv run --no-project --with httpx --with supabase \
  python scrapers/run_all.py --list                   # muestra buybacks (opcional)

uv run --no-project --with httpx --with supabase \
  python scrapers/run_all.py --only buybacks --dry-run
# 114 empresas, 20 en el top, 20 holdings, 15 con % cap, status ok, sin escrituras
```

`npm run lint` OK. `npm test` OK (39 archivos, 425 tests). `npm run typecheck`
falla solo por el `LayoutProps` global de `src/app/layout.tsx`, error conocido
de tsc aislado documentado en `AGENTS.md`; el build real lo genera.

## Variables nuevas

Ninguna. Se reutilizan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y el
User-Agent de `sec13f.USER_AGENT`. No se tocó `.env.example` (lo une F57).

## Deudas / notas

- `pct_capitalization` mezcla el monto del trimestre con la capitalización
  del último dato disponible; es una aproximación educativa, no un buyback
  yield exacto. Queda documentado en la migración y en el scraper.
- El ranking guarda el frame completo (todas las empresas con monto positivo,
  tenga o no ticker) en `buybacks`; el portafolio usa solo las top 20 con
  ticker identificable. Las empresas sin ticker no entran al portafolio pero
  sí quedan registradas.
- Sin UI en esta tarea. El aviso legal corresponde a F16
  (`legal-notice.tsx`); el portafolio no promete sobrerrendimiento ni es
  asesoría. Datos de la SEC: gratuitos y fuera del muro (5 U.S.C. § 13107).
- No se registró la etapa en `docs/sources.md` ni en el README de migraciones:
  esos archivos los une F57.
- `scrapers/data/v2/F29/` queda commiteado (dato de entrada del orquestador
  con el README de verificación de la fuente); el fixture del test es idéntico.
- Sobre Python: este host no tiene `python3.11` en PATH y el Python 3.14 del
  sistema no trae pytest; los tests se corrieron con `uv run --no-project`
  (ver comandos arriba), que aísla las dependencias del entorno global.
