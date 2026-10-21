# NOTAS F67 — ticker_profile (sector, peers y macro)

Rama `v2/f67-perfil-ticker` (desde `mejoras/integracion`). Sin push. No se
tocó Supabase real, no se abrió `.env` y no se levantó ningún servidor.

## Hecho

### 1. Curaduría: `scrapers/data/peers_manual.csv`
- 56 tickers: 32 de EE.UU. y 24 de Chile.
- Columnas exactas: `symbol,sector,industry,country,peers,suppliers,macro_factors`.
- Listas separadas por `|` (sin comas dentro de los campos).
- Vocabulario macro cerrado y usado de forma consistente: `tasas`, `cobre`,
  `litio`, `dolar_clp`, `petroleo`, `aranceles`, `consumo`, `tecnologia`,
  `credito`.
- Coherencia pedida: `SQM-B` es sector Materiales / industria "Litio y yodo",
  lleva `litio` (más `cobre`, `dolar_clp`, `aranceles`) y tiene `ALB` entre sus
  peers (`SQM-B` → `ALB|LAC|PUCOBRE`).
- EE.UU. incluye AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, JPM, XOM, CVX,
  JNJ, UNH, V, MA, WMT, COST, PG, KO, PEP, DIS, NFLX, AMD, AVGO, INTC, BA,
  CAT, PFE, MRK, LLY, BAC, ORCL y UBER.
- Chile incluye SQM-B, CHILE, BSANTANDER, BCI, ITAUCL, SECURITY, FALABELLA,
  CENCOSUD, RIPLEY, SMU, ANDINA-B, CONCHATORO, CCU, COPEC, CMPC, ENELAM,
  COLBUN, AGUAS-A, LTM, VAPORES, CAP, PUCOBRE, MALLPLAZA y ECL.

### 2. Carga: `scrapers/ticker_profile.py`
- `parse_profiles_csv` / `load_profiles`: CSV UTF-8 con BOM tolerado; valida
  columnas obligatorias, `symbol` con `clean_symbol` de `activists_13d`,
  país ISO de 2 letras, sector no vacío, peers como tickers, ausencia de
  auto-referencia y duplicados, y factores macro contra el vocabulario.
- `profile_record`: deja solo las columnas de `ticker_profile`.
- `TickerProfileAdapter.run`: upsert por `symbol` en lotes de 50 con el
  cliente service role (`on_conflict="symbol"`).
- `symbols_from_user_holdings`: lee **solo** `user_holdings.symbol` (sin
  `user_id`, cantidades ni pesos), deduplica y normaliza.
- `missing_from_profiles`: tickers de usuario sin perfil, ordenados.
- `--dry-run`: valida el CSV y muestra 10 perfiles; no lee ni escribe
  Supabase. Es el modo usado por `run_all.py --dry-run`.
- `--csv RUTA`: permite apuntar a otro archivo.
- `--missing`: lectura opcional de `user_holdings` para listar los símbolos
  sin perfil. Es el único caso que abre la base en dry-run, y solo porque se
  pidió explícitamente.
- `main`: un solo cliente Supabase; si el CSV no valida, sale con código 1.

### 3. Etapa: `scrapers/stages/ticker_profile.py`
- `STAGE = ("ticker_profile", "...", False)`, descubierta sola por
  `stages.discover_stages()`; no hizo falta tocar `run_all.py`.
- Apagada por defecto: solo corre con `NEWS_IMPACT_ENABLED=true` (mismo flag
  que `news_edgar`). Si está apagada devuelve `status: skipped` y no toca la
  base.
- Sin red: la fuente es el CSV local.

### 4. Tests: `scrapers/tests/test_ticker_profile.py`
17 tests, sin red ni Supabase real:
- CSV real: ≥50 perfiles, símbolos únicos, países US/CL.
- Macro válido en todas las filas, sector no vacío, peers sin espacios.
- `SQM-B` lleva `litio` y `ALB`.
- Parseo: normalización, deduplicación, BOM/encabezados.
- Errores: columnas faltantes, macro desconocida, symbol vacío/duplicado,
  peer inválido/auto-referente, país inválido.
- Dry-run con cliente trampa: jamás accede a la base.
- Escritura con base falsa: upsert por `symbol`, lotes de 50, reporte de
  faltantes y select únicamente de `symbol`.
- Etapa: flag exacto `true`, apagada no lee la base, encendida en dry-run
  tampoco.

## Verificación ejecutada

```bash
# desde scrapers/
uv run --with pytest --with-requirements requirements.txt pytest -q
# 370 passed, 1 skipped

uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_ticker_profile.py
# 17 passed

uv run --with-requirements requirements.txt python ticker_profile.py --dry-run
# 56 perfiles válidos; 10 en la muestra; 56 NO escritos

# desde la raíz
npm run lint        # ok
npm test            # 67 archivos, 813 tests passed
npm run typecheck   # ok
```

## Pendiente / notas para el orquestador

- No se hizo upsert real: requiere `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` y `NEWS_IMPACT_ENABLED=true`. La migración 051
  ya define `ticker_profile`; no se corrió ninguna migración.
- La lista de faltantes contra `user_holdings` real queda para la primera
  corrida con base (`python ticker_profile.py --missing`). Con 56 tickers
  curados es esperable que falten símbolos; ampliar el CSV con los que
  reporte esa corrida.
- F68 (matcher noticia→ticker) puede consumir directamente
  `ticker_profile.sector`, `peers`, `suppliers` y `macro_factors`; los
  sectores están en español y son consistentes entre filas (p. ej.
  "Financiero", "Materiales", "Tecnología").
- Los `suppliers` son nombres libres (no siempre tickers); los `peers` sí se
  validan como tickers.
- Commits locales: `feat: add curated ticker peer csv` y
  `feat: upsert curated ticker profiles`. Sin push.

## Cómo probar

```bash
cd scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_ticker_profile.py
uv run --with-requirements requirements.txt python ticker_profile.py --dry-run
# con base y flag (no ejecutado acá):
# NEWS_IMPACT_ENABLED=true uv run --with-requirements requirements.txt python ticker_profile.py
# uv run --with-requirements requirements.txt python ticker_profile.py --missing
```
