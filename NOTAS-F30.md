# F30 — Grandes apuestas de Polymarket (política y economía)

Rama `v2/f30-polymarket` (worktree `C:\reclu-work\f30`, base `mejoras/integracion`).
Sin push. Sin tocar Supabase real, sin `.env*`, sin `npm install`.

## Qué se hizo

1. **`scrapers/polymarket.py`** (nuevo)
   - Lee `https://data-api.polymarket.com/trades?filterType=CASH&filterAmount=10000`
     y `https://data-api.polymarket.com/v1/leaderboard`.
   - El feed de trades no trae categoría: se resuelve con los tags del evento en
     la Gamma API (`https://gamma-api.polymarket.com/events?slug=...`, lotes de 20).
   - `category_for_tags()` descarta primero cualquier tag deportivo
     (`sports`, `tennis`, `soccer`, `games`, ...) y luego clasifica en
     `politics` o `economy`. Sin deportes, verificado en vivo.
   - Solo apuestas ≥ US$10.000 (`value_usd = size * price`).
   - Privacidad: guarda billetera seudónima (`proxyWallet` en minúsculas) y el
     alias público (`userName` / `name`, evitando el nombre autogenerado
     `0x...-timestamp`; si no hay, `pseudonym`). No guarda `bio`,
     `profileImage`, `xUsername`, email ni direcciones. `trade_record()` rechaza
     columnas con esos nombres.
   - Escribe `prediction_trades`, hace upsert de `prediction_leaderboard`,
     sincroniza holdings y **no** genera alertas repetidas.
   - Alertas `type = "threshold"`, título fijo **"Apuesta grande en Polymarket"**
     (nunca "insider"), resumen con el monto/mercado y la frase
     "no es recomendación de inversión". `is_published = true`.

2. **`scrapers/stages/polymarket.py`** (nuevo): etapa `polymarket`, no crítica,
   descubierta por `run_all` antes de `radar_ia`.

3. **`supabase/migrations/030_polymarket.sql`** (nuevo, idempotente)
   - `public.prediction_trades` (RLS, lectura pública, escritura solo service role).
   - `public.prediction_leaderboard` (snapshot actual del leaderboard público;
     se añadió además de lo pedido para poder mostrar el ranking).
   - Portafolio `polymarket-ballenas`, `category = 'model'`, `source = 'polymarket'`,
     `country = 'Global'`, `premium = false` (fuera del muro).
   - Convenciones de idempotencia: `create table/index if not exists`,
     `drop policy if exists` + `create policy`, `insert ... on conflict (slug) do update`.

4. **`scrapers/tests/test_polymarket.py`** (nuevo) + fixtures copiados a
   `scrapers/tests/fixtures/polymarket/` (`pm_trades_10k.json`,
   `pm_leaderboard.json`). 12 tests: parseo, monto, privacidad, clasificación,
   filtro sin deportes, dedupe, leaderboard, alertas, holdings, dry-run sin DB y
   lectura estática de la idempotencia del SQL.

5. **`scrapers/tests/test_stages_discovery.py`** (editado, 1 línea):
   `test_sin_etapas_el_orden_no_cambia` asumía `discover_stages() == []`, que dejó
   de ser cierto al existir la primera etapa real. Ahora verifica con un
   directorio temporal vacío (`tmp_path`). Es el único archivo preexistente tocado.

## Variables de entorno nuevas

Ninguna. Polymarket no requiere clave. (No se tocó `.env.example`, lo une F57.)

## Datos de entrada

`scrapers/data/v2/F30/` queda **sin commitear** (insumo del orquestador). Los
fixtures que usan los tests están versionados en `scrapers/tests/fixtures/polymarket/`.

## Cómo probar

```powershell
$env:PYTHONIOENCODING="utf-8"   # consola cp1252: evita el crash del resumen de run_all
uv run --no-project --with pytest --with-requirements scrapers/requirements.txt `
    python -m pytest scrapers/tests -q
uv run --no-project --with-requirements scrapers/requirements.txt python scrapers/run_all.py --list
uv run --no-project --with-requirements scrapers/requirements.txt python scrapers/run_all.py --only polymarket --dry-run
```

Resultados locales: `58 passed, 1 skipped`; `--list` muestra `polymarket`;
el dry-run lee ~40 apuestas de política/economía y 50 billeteras y **no escribe**.

## Nota sobre la base

Están `008`, `009`, `014`–`017` y `019`–`021`. **`018` no existe** en ninguna
rama (salto de numeración por F9, al parecer descartada); no bloquea F30 porque
`030` no depende de ella.

## Pendiente / deudas

- UI: no se agregó vista de `prediction_trades` ni enlace a perfiles. Sólo
  scraper + migración, como pedía la tarea.
- El dry-run sí hace red (API pública) para poder verificar el filtro; no
  escribe nada.
- Deportes se detecta por slug de tag. Si Polymarket agrega un tag deportivo
  nuevo, hay que sumarlo a `SPORTS_TAGS`.
- La tabla `prediction_leaderboard` es un extra respecto del enunciado (solo
  nombraba `prediction_trades`); se justifica por el objetivo de "seguir el
  leaderboard".
- Verificación TypeScript/Next: no aplica (no se tocó `src/`). El orquestador
  debe correr `npm run typecheck && npm run lint && npm test && npx next build`
  si quiere el gate completo.
