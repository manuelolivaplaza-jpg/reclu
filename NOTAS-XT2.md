# XT2 — humo de etapas de scrapers en dry-run

Rama: v2/xt2-tests-scrapers. Commit: cadf837.

## Hecho

- `scrapers/tests/test_stages_smoke.py` (nuevo, 21 tests):
  - `test_contrato_del_modulo` (parametrizado, 10 modulos): cada
    `scrapers/stages/*.py` expone lo que `discover_stages()` espera:
    `STAGE = (id, desc, critical)` con id == nombre del archivo, desc no
    vacia, critical bool, y `run(db, dry_run)` callable.
  - `test_discover_stages_ve_todos_en_orden_alfabetico`: `discover_stages()`
    encuentra los 10 modulos, sin ids duplicados, en orden alfabetico.
  - `test_dry_run_no_toca_supabase` (parametrizado, 10 modulos): `run(db, True)`
    con red bloqueada nunca accede a la base. La db es un mock trampa
    (`__getattr__` lanza AssertionError en cualquier metodo, incluido
    select); `base.get_db` tambien esta parcheado para reventar.
- Sin red: monkeypatch de `httpx.Client.send` y de
  `curl_cffi.requests.Session.request` (devuelve respuesta "Web Page
  Blocked" 403, el camino documentado de la CMF en docs/sources.md).
  `time.sleep` parcheado a no-op para que no haya esperas.
- Los fallos de RED son esperados y no fallan el test (los adapters lanzan
  httpx/curl_cffi/CmfBlocked); solo tocar Supabase lo hace fallar.

## Resultado

- `pytest tests/test_stages_smoke.py -q` → 21 passed in 4.42s
- Suite completa desde scrapers/ → 250 passed, 1 skipped
- `npm run lint` && `npm test` && `npm run typecheck` → OK

## Bugs encontrados

Ninguno: todos los stages pasaron el humo. No hubo que marcar nada
`pytest.mark.xfail`.

## Detalle de diseno

- El mock CMF responde 403 "Web Page Blocked" en vez de reventar, porque es
  el comportamiento real desde datacenter: asi `cmf_hechos`/`cmf_dividendos`
  devuelven status "blocked" (camino feliz) en vez de error de red, igual que
  en produccion.
- `polymarket.py` (stage) importa `polymarket` del raiz de scrapers dentro
  de `run()`; el smoke bloquea red con httpx y el adapter revienta en
  fetch_raw → camino "error de red esperado", no toca db.

## Como probar

Desde scrapers/:

  uv run --with pytest --with-requirements requirements.txt pytest tests/test_stages_smoke.py -q

Suite completa:

  uv run --with pytest --with-requirements requirements.txt pytest -q

## Pendiente

- Nada de XT2. La carpeta `scrapers/data/v2/XT2/` no existia (solo F25);
  los tests usan los modulos reales de `scrapers/stages/`.
