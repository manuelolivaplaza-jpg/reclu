# Tarea F8: portafolio "Trump dice" (para Hermes)

Rama: `mejoras/f8-trump-dice`, creada desde `mejoras/integracion`. Worktree sugerido: `C:\reclu-work\f8`.
Migración asignada: `supabase/migrations/014_trump_dice.sql` (la 013 es la última que existe).
Reglas de siempre: no ejecutar nada contra Supabase real, no abrir ni commitear `.env*`, solo `--dry-run`.
Al terminar, escribir `NOTAS-F8.md` siguiendo el formato de `NOTAS-F7.md`.

## Contexto (leído en `C:\reclu-work\integracion`)
- Tabla `public.portfolios` (`supabase/schema.sql`): `slug` único, `category` dentro de
  ('political_us','thematic','broker_cl','public_disclosure','hedge_fund','model'), `source` de texto libre,
  `country` dentro de ('US','CL','Global'), `premium`, `tags text[]`, `is_active`.
- Tabla `public.holdings`: índice único (portfolio_id, symbol, as_of); `asset_class` dentro de
  ('equity','fund','etf','cash','bond','other'). `previous_weight = 0` significa posición nueva:
  `supabase/functions/detect-changes/index.ts` crea la alerta `new_trade` y lo demás como `weight_change`.
- Tabla `public.alerts`: `type` ya admite `'mention'` (no hay que tocar el check). `send-alerts` solo envía
  alertas con `is_published = true`. `src/components/alerts-feed.tsx` ya tiene el filtro "Menciones" y
  destaca `type === 'mention'`.
- Patrón de scraper: `scrapers/base.py` (`SourceAdapter`: fetch_raw → normalize → run, con `--dry-run`).
  Ejemplo reciente: `scrapers/radar_ia.py`, registrado en `scrapers/run_all.py` (en `STAGES` y `RUNNERS`).
  Seeds con pesos editoriales: `scrapers/load_thematic.py`. Seed SQL idempotente: `supabase/migrations/013_portafolios_tematicos.sql`.
- Ya existen `trump-trades` (source `capitol_trades`, sin fuente real) y `trump-truth-signals`
  (migración 006, source `truth_social`, followers 19400 y return_ytd 36.40 inventados, premium).
  **No borrarlos ni modificarlos.** Anotar en NOTAS-F8 que Manu debe decidir si los desactiva
  (`is_active=false`) cuando "Trump dice" tenga datos reales.
- Muro de pago (`supabase/migrations/012_muro_pago.sql`): `holdings` ya no se lee en público; se usa
  `get_portfolio_holdings(p_slug)`. Respetarlo.
- OJO, bug en la 013, a corregir en esta rama con un cambio de una línea: el `select` busca
  `'defensa-aeroespacional'` y el slug real es `'defensa-aeroespacial'`. Por ese `return` temprano NO se
  insertan los holdings de NINGUNO de los 3 temáticos.

## Qué construir

### 1. Datos: `scrapers/data/trump_dice_menciones.json`
Copiar tal cual el archivo `menciones.json` que deja el orquestador en el worktree (15 menciones
verificadas, cada una con id, fecha, hora ET, fecha de entrada, ticker, cita, canal, tipo y fuentes, más
las excluidas). Es la fuente de verdad: no inventar ni agregar menciones sin URL.

### 2. Migración `supabase/migrations/014_trump_dice.sql` (idempotente)
- `create table if not exists public.mentions` con: `id uuid pk default uuid_generate_v4()`,
  `portfolio_id uuid references portfolios on delete cascade`, `speaker text not null`,
  `said_at timestamptz not null`, `entry_date date not null`, `symbol text not null`, `company text`,
  `kind text check (kind in ('compra_directa','compra_directa_mercado','elogio','elogio_accion','elogio_con_ticker','elogio_producto','elogio_acuerdo'))`,
  `channel text`, `quote text not null`, `source_urls text[] not null check (cardinality(source_urls) >= 1)`,
  `status text not null default 'verificada' check (status in ('pendiente','verificada','descartada'))`,
  `external_id text unique` (id de Truth Social o "M01".."M15"), `created_at timestamptz default now()`.
  Índices por (portfolio_id, said_at desc) y por symbol.
- RLS: lectura pública solo de `status='verificada'` (son dichos públicos con su fuente); sin políticas de
  escritura (solo service role), igual que `benchmark_prices` en la 011.
- `insert into public.portfolios ... on conflict (slug) do nothing`:
  slug `trump-dice`, name `Trump dice`, description "Compra simulada de US$1.000 al cierre cada vez que
  Donald Trump llama a comprar o elogia directamente una acción. Cada mención con su cita y su fuente.",
  category `political_us`, source `trump_mentions`, manager `Donald Trump`, country `US`, followers 0,
  return_ytd null, premium false, tags `{trump,menciones,truth-social,dichos}`.
- Insertar las 15 menciones (con `on conflict (external_id) do nothing`) usando los datos del JSON.
- Holdings semilla con `previous_weight = 0` y as_of = fecha de corte '2026-10-16'. Son pesos por valor
  de mercado al 16-10-2026 (compras de US$1.000 por mención, sumadas por ticker; suman 100):
  DELL 39.18, INTC 26.73, MU 8.84, AAPL 5.63, TSLA 5.52, PLTR 5.22, SPY 5.08 (asset_class 'etf'),
  y U.S. Steel deslistada → `symbol 'USD-CASH'`, name 'Efectivo (U.S. Steel, compra de Nippon a US$55)',
  asset_class 'cash', weight 3.80.
  Antes de usar `USD-CASH`, revisar cómo `scrapers/prices.py` y `scrapers/compute_returns.py` tratan
  `asset_class='cash'`. Si no lo saltan, saltarlo en el adapter nuevo, no en esos archivos, o anotarlo en NOTAS-F8.
- Agregar la fila 014 a `supabase/migrations/README.md`.

### 3. Scraper `scrapers/trump_dice.py` (patrón SourceAdapter, como radar_ia.py)
- `TrumpDiceAdapter(SourceAdapter)`, `name='trump_dice'`, `portfolio_slug='trump-dice'`.
- `fetch_raw()`: lee `scrapers/data/trump_dice_menciones.json` + precios de cierre ajustados (Yahoo, mismo
  método que `benchmarks.py`) desde la primera fecha de entrada.
- Lógica pura `build_trump_dice(menciones, precios, monto=1000)`, testeable sin red: unidades por
  mención = monto / cierre_entrada; valor actual = unidades × último cierre; peso por ticker = valor /
  total × 100, redondeado a 2 decimales para que sume 100. Los tickers deslistados con `cash_out`
  (X: 55.0 desde 2025-06-18) se valorizan a ese precio.
- `normalize()` → `Holding` por ticker con `as_of = date.today()`. Así `run()` deja `previous_weight` y
  detect-changes genera `new_trade` cuando entra un ticker nuevo.
- Alertas de mención (lo nuevo): por cada mención `verificada` que no esté en `public.mentions`
  (comparar por `external_id`), insertar la fila en `mentions` y una alerta:
  `type='mention'`, `severity='high'` si `kind` empieza con `compra_directa` y `'medium'` en los demás casos,
  `title = "Trump dice: {symbol} — \"{cita corta ≤80}\""`,
  `payload = {symbol, company, quote, said_at, entry_date, channel, kind, source_urls, speaker:'Donald Trump'}`,
  `is_published=true` (ya está verificada a mano). Con `--dry-run` solo se imprime.
- Detección de candidatas (opcional, flag `--detectar`): leer el feed público de trumpstruth.org o el
  archivo diario del American Presidency Project y marcar como `pendiente` los posts que contengan un
  ticker entre paréntesis o con `$`, o "buy" junto al nombre de una empresa del catálogo. Las `pendiente`
  NUNCA generan alerta ni holdings: se revisan a mano y se pasan a `verificada` en el JSON.
- Registrar la etapa en `scrapers/run_all.py`: agregar a `STAGES`
  `("trump_dice", "Trump dice: menciones verificadas", False)` después de `performance` y antes de
  `radar_ia`, y `"trump_dice": run_trump_dice` en `RUNNERS` (con dry-run igual que `run_radar_ia`).

### 4. UI mínima
- En `src/app/portfolio/[slug]/page.tsx`, solo si `portfolio.source === 'trump_mentions'`: un bloque
  "Menciones" que liste cada mención (fecha, ticker con enlace a `/accion/[symbol]`, cita, tipo, enlace
  "Fuente" a `source_urls[0]`). Va en un componente nuevo `src/components/mentions-list.tsx` con su
  consulta propia, por ejemplo `getMentions(portfolioId)` en un `src/lib/mentions-queries.ts` nuevo
  (no tocar `queries.ts`), con fallback de demo rotulado `isDemo` como hace `ticker-queries.ts`.
- Aviso fijo: "Simulación histórica con fines informativos. No es recomendación de inversión."
- Enlace a `/metodologia`. Agregar ahí una sección corta "Trump dice", copiando la metodología de
  `docs/trump-dice-metodologia.md` (copiar el METODOLOGIA.md del orquestador a esa ruta).

### 5. Tests
- `scrapers/tests/test_trump_dice.py`: pesos que suman 100, cash-out de X, mención repetida (Dell x5)
  que se suma, entrada al siguiente día hábil, `pendiente` que no genera alertas y JSON sin `source_urls`
  que se rechaza.
- `tests/mentions-list.test.ts` si se agrega lógica pura en TS.
- Correr `npm run lint`, `npm test`, `npm run build` y
  `uv run python -m py_compile scrapers/trump_dice.py`, más `python scrapers/trump_dice.py --dry-run`.

## Criterios de aceptación
- 014 idempotente (se puede correr dos veces sin error). 15 menciones, todas con fuente.
- `run_all.py --list` muestra `trump_dice`. `--dry-run` imprime pesos y menciones nuevas sin escribir.
- Una mención nueva verificada produce exactamente una alerta `mention`, y no la repite en la corrida siguiente.
- `trump-trades` y `trump-truth-signals` no se tocan. El bug de slug de la 013 queda corregido.
