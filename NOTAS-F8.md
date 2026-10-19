# NOTAS F8 — Portafolio "Trump dice" (sesión A: tests y limpieza)

Rama: `mejoras/f8-trump-dice` · Migración: `supabase/migrations/014_trump_dice.sql`

## Hecho

- Tests sin red en `scrapers/tests/test_trump_dice.py`: pesos que suman 100 sobre las 15 menciones del JSON, cash-out de X a `USD-CASH` (US$55), Dell x5 que suma unidades, entrada al lunes si el dicho cae en sábado, `pendiente` que no genera holding ni alerta, JSON sin `source_urls` que se rechaza, y una mención verificada nueva que inserta exactamente una alerta `mention` y no se repite en la corrida siguiente (mock de db).
- `uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests -q` → 15 passed. No hizo falta cambiar `scrapers/trump_dice.py`.
- `scrapers/run_all.py --list` muestra `trump_dice` (opcional), después de `performance` y antes de `radar_ia`. En `--dry-run` del orquestador la etapa se omite, igual que `radar_ia` (no escribe ni lee Supabase). Los pesos se imprimen con `python scrapers/trump_dice.py --dry-run` (no se corrió aquí: pide precios a Yahoo).
- Limpieza: `git rm` de `data/trump/` (copias del orquestador que el código no lee). La fuente de verdad sigue en `scrapers/data/trump_dice_menciones.json` y la metodología en `docs/trump-dice-metodologia.md`.
- Migración 014 revisada:
  - Idempotente tras agregar `on conflict (external_id) do nothing` al insert de M01–M06 (el de M07–M15 ya lo tenía). Tabla, índices, portafolio y holdings semilla ya usaban `if not exists` / `on conflict do nothing`. La policy se dropea y se recrea.
  - RLS: una sola policy, `for select using (status = 'verificada')`. No hay policies de insert, update ni delete (escritura solo service role, igual que `benchmark_prices` en la 011).
  - Fila 014 (y 013) agregada a `supabase/migrations/README.md`.
- El slug de la 013 ya estaba corregido a `defensa-aeroespacial` (insert y select). No se tocó en esta sesión.
- `trump-trades` y `trump-truth-signals` no se modificaron.

## Pendiente para sesión B (UI en portfolio/[slug], aviso, /metodologia)

- En `src/app/portfolio/[slug]/page.tsx`, solo si `portfolio.source === 'trump_mentions'`: bloque "Menciones" (fecha, ticker con enlace a `/accion/[symbol]`, cita, tipo, enlace "Fuente" a `source_urls[0]`).
- Componente nuevo `src/components/mentions-list.tsx` y consulta propia (por ejemplo `getMentions` en `src/lib/mentions-queries.ts`, sin tocar `queries.ts`), con fallback demo rotulado `isDemo`.
- Aviso fijo: "Simulación histórica con fines informativos. No es recomendación de inversión."
- Enlace a `/metodologia` y ahí una sección corta "Trump dice" copiada de `docs/trump-dice-metodologia.md`.
- `tests/mentions-list.test.ts` si queda lógica pura en TS.
- Correr `npm run lint`, `npm test`, `npm run build` (esta sesión no tocó TypeScript).

## Qué debe hacer Manu

1. Aplicar `supabase/migrations/014_trump_dice.sql` en el SQL Editor (idempotente; se puede correr dos veces). No se ejecutó contra Supabase real.
2. Decidir si desactiva `trump-trades` y `trump-truth-signals` (`is_active=false`) cuando "Trump dice" tenga datos reales. No borrarlos.
3. `USD-CASH`: `prices.py` no pide Yahoo para ese símbolo (lista fija, no está). `compute_returns.py` no distingue `asset_class='cash'`: si no hay precio, avisa y salta ese holding, sin tumbar la corrida. No se cambió ninguno de los dos archivos. El adapter de Trump dice no manda X a Yahoo; lo valoriza a US$55.

## Verificación de esta sesión

- Pytest de scrapers: 15/15 OK.
- `run_all.py --list`: `trump_dice` presente. `run_all.py` sigue en LF.
- No se levantó servidor, no se hizo `git push`, no se abrió `.env*`.
