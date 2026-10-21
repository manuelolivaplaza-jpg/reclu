# F59 — Migración 051 de noticias e impacto

## Hecho

- `supabase/migrations/051_noticias_impacto.sql` (idempotente, con bloque
  `-- ROLLBACK` comentado al final):
  - `news_items`: `id`, `source` (`sec_8k` | `cmf_hechos`), `url`, `title`,
    `summary` (máx. 500 caracteres, nunca el texto completo), `published_at`,
    `lang`, `hash unique` y `created_at`. RLS de lectura pública. Por grants de
    columna, `anon`/`authenticated` solo leen `id, source, url, title,
    published_at`; `summary` queda fuera (mismo patrón que el bloque de
    `alerts.summary` de la 048). Escritura solo `service_role`.
  - `news_tickers`: FK a `news_items` con `on delete cascade`, `symbol`,
    `relation` (`direct` | `sector` | `supplier` | `competitor` | `macro`),
    `confidence numeric` 0..1 y PK `(news_id, symbol, relation)`. Lectura
    pública; escritura solo `service_role`.
  - `ticker_profile`: `symbol` PK, `sector`, `industry`, `country`,
    `peers text[]`, `suppliers text[]`, `macro_factors text[]` y
    `updated_at` (trigger `set_updated_at()` del esquema base). Lectura
    pública; escritura solo `service_role`.
  - `ai_impact_cache`: PK `(news_id, symbol, prompt_version)`, `model`,
    `analysis jsonb` y `created_at`. **Sin `user_id`**. RLS sin policies y
    `revoke` total a `anon`/`authenticated`: solo `service_role`.
  - `user_impact_requests`: `id`, `user_id` (FK a `auth.users` con
    `on delete cascade`), `news_id` (FK a `news_items`), `created_at` y
    `delivered_via` (`web` | `email` | `telegram`). RLS solo del dueño para
    `select` e `insert`; `anon` no tiene grants.
  - `public.purge_old_impact_requests()`: borra solicitudes de más de 90 días;
    `security definer`, `set search_path = ''`, ejecutable solo por
    `service_role`.
  - Índices `news_tickers(symbol)` y `news_items(published_at desc)` (además de
    uno de apoyo `user_impact_requests(user_id, created_at desc)`).
- `scrapers/tests/test_migracion_051.py`: 7 tests que leen el SQL como texto
  (grants de columna, ausencia de `user_id` en la caché, purga de 90 días con
  `search_path = ''`, RLS del dueño, índices y rollback).
- Verificado: `npm run lint`, `npm run typecheck`, `npm test` (732 tests) y
  `uv run ... pytest -q tests/test_migracion_051.py` (7 passed).

## Variables de entorno

No se agregaron variables nuevas. La migración es solo de esquema y no enciende
ninguna funcionalidad en runtime. Los flags `MY_PORTFOLIO_ENABLED` y
`NEWS_IMPACT_ENABLED` siguen apagados por defecto y no se tocaron aquí (sus
consumidores llegarán en F62/F70-F73).

## Pendiente / deudas

- Registrar la 051 en `supabase/migrations/README.md` cuando la 050 (F58) esté
  fusionada, para no dejar un hueco de numeración en este worktree.
- `news_items.summary` se sirve con `service_role` (o una RPC futura); si el
  front anónimo necesita resúmenes, definir una vista/RPC con recorte por plan
  como en la 048.
- Los scrapers de SEC 8-K y CMF (F64/F65) todavía no escriben en estas tablas.
- `ticker_profile` no tiene seed: lo llenará F67.
- El cupo real de consultas de impacto (F71) todavía no usa
  `user_impact_requests`; la purga debe agendarse con `service_role` (cron).

## Cómo probar

```powershell
cd C:\reclu-work\f14
npm run lint
npm run typecheck
npm test

cd scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_migracion_051.py
```

No correr la migración contra Supabase real. En un entorno de prueba, aplicar
`supabase/migrations/051_noticias_impacto.sql` después de la 048 y reejecutarla
para comprobar la idempotencia.
