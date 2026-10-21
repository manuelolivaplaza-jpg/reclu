# F63 — Precios para las tenencias de usuarios

Rama: `v2/f63-precios-usuarios` (desde `mejoras/integracion`). Sin push.

## Hecho

- `scrapers/prices.py`
  - `PRICE_SYMBOLS` pasa a ser el basket base (con `DEFAULT_SYMBOLS` como alias
    histórico para no romper imports).
  - `normalize_symbol(symbol, market)`: mayúsculas, limpia espacios y agrega el
    sufijo `.SN` a los tickers con `market='CL'` (sin duplicarlo si ya viene).
  - `merge_price_symbols(base, extra)`: une listas sin duplicados conservando
    el orden.
  - `symbols_from_user_holdings(db, limit=500)`: lee `symbol, market` de
    `user_holdings` con el cliente service role recibido, deduplica y devuelve
    **solo** los tickers (sin `user_id`, cantidades ni pesos).
  - `user_holdings_prices_enabled()`: flag `USER_HOLDINGS_PRICES_ENABLED`,
    apagado por defecto y encendido solo con el valor exacto `true`.
  - `collect_price_symbols(db)`: base + tenencias, y cuenta cuántos símbolos
    nuevos aporta `user_holdings`.
  - `main()`: usa el basket mergeado; en `--dry-run` con el flag encendido solo
    lee la DB (nunca escribe) para imprimir cuántos símbolos agregaría.
- `scrapers/run_all.py`
  - `run_prices()` usa `collect_price_symbols`; en `--dry-run` registra
    `[prices] DRY-RUN: N símbolos de user_holdings se agregarían (M en total)`
    y no escribe en Supabase.
- `scrapers/tests/test_prices_user_holdings.py` (8 tests, DB fake, sin red ni
  Supabase real): normalización `.SN`, merge sin duplicados, solo tickers,
  límite, flag apagado por defecto, merge con flag encendido y dry-run sin
  escrituras.

## Pendiente / notas

- No existe `scrapers/data/v2/F63/` en este worktree; el test no necesitó
  fixtures y usa un `FakeDB`.
- No se tocó `supabase/` (la tabla `user_holdings` de la migración 050 ya tiene
  `symbol` y `market`).
- La lectura de `user_holdings` en dry-run requiere service role; sin
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` el dry-run avisa con un warning y
  sigue con el basket base.

## Cómo probar

```bash
cd scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q \
  tests/test_prices_user_holdings.py
```

Verificación del repo (ya corrida en esta rama):

```bash
npm run lint        # OK
npm run typecheck   # OK
npm test            # 65 archivos, 778 tests OK
```

Ejemplo manual (solo dry-run, nunca contra Supabase real):

```bash
USER_HOLDINGS_PRICES_ENABLED=true PRICE_SYMBOLS="NVDA" \
  uv run --with-requirements requirements.txt python prices.py --dry-run
```
