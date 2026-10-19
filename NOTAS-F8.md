# NOTAS F8 — Portafolio "Trump dice" (sesiones A y B)

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

## Hecho en sesión B (UI)

- En `src/app/portfolio/[slug]/page.tsx`, solo si `portfolio.source === 'trump_mentions'`, se monta `TrumpMentionsList`. `getMentions` arranca antes del perfil y de las holdings.
- Componente `src/components/trump-mentions-list.tsx` (el pedido de la sesión B usa este nombre). Consulta en `src/lib/mentions-queries.ts` (`getMentions`). No se tocó `queries.ts`.
- Lee `public.mentions` con `status = 'verificada'`. Sin Supabase: las 15 menciones de la 014, con `isDemo` y `DemoBadge`. Con Supabase vacío o si la consulta falla: lista vacía (no se disfrazan de demo).
- Cada fila: fecha (día del texto ISO), ticker con enlace a `/accion/[symbol]`, empresa, tipo, frase de hasta 80 caracteres y enlace "Fuente" a la primera URL http(s).
- Aviso fijo: "Simulación histórica con fines informativos. No es recomendación de inversión." Enlace a `/metodologia#trump-dice`.
- `/metodologia`: sección 7 "Trump dice", resumen de `docs/trump-dice-metodologia.md`.
- Demo: portafolio `trump-dice` (`d47`, `source` `trump_mentions`, followers 0, `return_ytd` null) y los 8 holdings semilla. En demo `previous_weight` es null para no pintar un salto; en la 014 sigue en 0 para `new_trade`.
- `trump-trades` y `trump-truth-signals` no se modificaron.
- Lógica pura cubierta en `tests/mentions-list.test.ts`.

## Pendiente

Nada de la UI de esta tarea. Sigue pendiente lo de Manu (migración en el SQL Editor y decidir si desactiva los otros dos portafolios de Trump).

## Qué debe hacer Manu

1. Aplicar `supabase/migrations/014_trump_dice.sql` en el SQL Editor (idempotente; se puede correr dos veces). No se ejecutó contra Supabase real.
2. Decidir si desactiva `trump-trades` y `trump-truth-signals` (`is_active=false`) cuando "Trump dice" tenga datos reales. No borrarlos.
3. `USD-CASH`: `prices.py` no pide Yahoo para ese símbolo (lista fija, no está). `compute_returns.py` no distingue `asset_class='cash'`: si no hay precio, avisa y salta ese holding, sin tumbar la corrida. No se cambió ninguno de los dos archivos. El adapter de Trump dice no manda X a Yahoo; lo valoriza a US$55.

## Verificación

- Sesión A: pytest de scrapers 15/15. `run_all.py --list` muestra `trump_dice`. `run_all.py` sigue en LF.
- Sesión B: `npm run lint` OK. `npm test` 124 tests (12 archivos) OK. `npm run build` OK (el typecheck de Next, dentro del build, también). `npm run typecheck` OK después de ese build: un `tsc` aislado, antes de que Next genere `LayoutProps`, falla solo en `src/app/layout.tsx` (conocido, no es de esta UI).
- No se levantó servidor, no se hizo `git push`, no se abrió `.env*`. No se pudo revisar la página en el navegador.
