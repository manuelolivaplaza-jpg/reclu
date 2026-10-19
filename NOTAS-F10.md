# NOTAS F10 — Compras de ejecutivos (Formulario 4 de la SEC)

Rama: `mejoras/f10-insiders` · Migración asignada: `supabase/migrations/016_insiders.sql` · Worktree: `C:\reclu-work\f10`

Sesión A = backend. Sesión B = interfaz, fuente visible y cierre.
La 014 es de F8 (trump-dice) y la 015 queda reservada para F9 (fix-accion). Esta migración es la 016 y es idempotente.

## Hecho en sesión A

### 1. Migración
- `supabase/migrations/016_insiders.sql` — tabla `public.insider_trades`.
  - Clave única `(accession, symbol, owner_name, trans_date, code)`.
  - `code` solo `P` o `S`.
  - Sin columnas de dirección (`rptOwnerStreet1`, ciudad, estado, zip no existen).
  - RLS: lectura pública. No hay políticas de escritura (solo service role).
  - `grant select` a `anon` y `authenticated`.
- Portafolio `insiders-compras-1m`: nombre "Compras de ejecutivos", `category=public_disclosure`, `source=sec_form4`, `country=US`, followers 0, `return_ytd` null, premium false, tags `{insiders,form4,sec,ejecutivos}`. `on conflict (slug) do nothing`.
- La descripción del portafolio incluye el resultado honesto del backtest (1S-2026: −1,80% contra SPY +8,11%) y el aviso "Simulación histórica con fines informativos. No es recomendación de inversión."
- Fila agregada en `supabase/migrations/README.md` (y la reserva 014/015/016 en la tabla de frentes).

### 2. Scraper
- `scrapers/insiders_form4.py` — `InsidersForm4Adapter`, `name='insiders_form4'`, slug `insiders-compras-1m`.
- `fetch_raw()` lee el Atom de EDGAR (`count=100`), deduplica por accession (la SEC publica cada filing dos veces: Issuer y Reporting; se prefiere Issuer) y baja índice + XML con `time.sleep(0.15)` y el `USER_AGENT` de `scrapers/sec13f.py`.
- `parse_form4()` es puro. No copia la dirección del reporting owner.
- Entrada: código P y adquirido A, officer o director, se excluyen entidades (mismo regex del backtest: INC/LLC/LP/FUND/…) y códigos que no son compra en mercado (S, M, A de awards, F). Monto ≥ US$1M sumado por `(ticker, filed_at)`. Varias compras del mismo día se suman en una fila (precio = promedio ponderado).
- Holdings: peso igual entre los tickers con compra ≥ US$1M y `filed_at` en los últimos 90 días. `previous_weight=0` solo al insertar un ticker que no estaba. Un ticker ya presente conserva el peso anterior, así detect-changes no lo vuelve a marcar como `new_trade`.
- Alerta propia por evento nuevo: `type=new_trade`, `severity=high` si el monto es ≥ US$10M (si no, `medium`), `is_published=true`. Título `Insider: {cargo} de {symbol} compró US${monto}`. Payload: symbol, owner_name, owner_title, value_usd, trans_date, filed_at, source_url.
- La misma compra no genera dos alertas: no se vuelve a bajar un accession ya guardado, el upsert usa la clave única, y antes de insertar la alerta se busca un `new_trade` con el mismo symbol + filed_at + source_url.
- `--dry-run` imprime las compras y no abre Supabase (ni lee ni escribe).
- Registrado en `scrapers/run_all.py` después de `performance` y antes de `radar_ia`: `("insiders_form4", "Compras de ejecutivos (SEC Form 4)", False)`.

### 3. Tests
- `scrapers/tests/test_insiders_form4.py` (6 tests, sin red):
  - El fixture TTD (Jeff Green, CEO y director) se lee bien.
  - Suma las dos compras del 2026-03-02 y el evento completo da US$148.101.266.
  - Excluye ventas (S), ejercicios de opciones (M, en tabla derivada y no derivada) y entidades (LLC). Una compra chica no pasa el umbral de US$1M; dos de US$600.000 el mismo día sí.
  - Ningún record ni el log de dry-run contiene calle, ciudad o zip del fixture. Dry-run con un cliente que revienta si lo tocan no llama a la base.
  - La misma compra alerta una vez; la segunda pasada, con las claves ya guardadas, no alerta.
  - Pesos iguales (3 nombres → 33,33 / 33,33 / 33,34) y el Atom deduplica Issuer/Reporting.

## Verificación ejecutada
- `uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests -q` — 14/14 OK (8 previos + 6 nuevos).
- `python -m py_compile` de `scrapers/insiders_form4.py` y `scrapers/run_all.py` — OK.
- `python scrapers/run_all.py --list` — `insiders_form4` aparece como opcional, entre `performance` y `radar_ia`.
- `python scrapers/insiders_form4.py --dry-run` contra la SEC el 2026-10-19 04:26 (hora local): 100 entradas Atom → 50 filings únicos, 136 transacciones leídas, 0 compras ≥ US$1M en ese corte (el feed traía awards, ventas y ejercicios, no compras grandes). Resultado `dry_run: true`, `status: empty`. No se escribió nada.
- No se corrió nada contra Supabase real. No se aplicó la 016. No se hizo `npm run lint/test/build` (esta sesión no toca la UI).

## Hecho en sesión B

### 1. UI
- `src/lib/insider-queries.ts` — lee `insider_trades` (solo columnas de mercado, código P, últimas 20). No selecciona `*`. `toInsiderTrade` no copia calle, ciudad ni zip.
- El libro de la ficha sigue saliendo de `getHoldings` → `get_portfolio_holdings(p_slug)` (muro 012: anónimo 5, free 10, pago todo). Después, solo si `source==='sec_form4'`, `holdingsAtLatestAsOf` deja la fila de `as_of` más reciente de cada símbolo. No hay un `select` directo a `holdings`.
- `src/components/insider-trades-list.tsx`, montado en `src/app/portfolio/[slug]/page.tsx` solo si `source==='sec_form4'`.
  - Tabla: fecha de la compra, ticker, cargo (y nombre), monto, enlace "Filing SEC" (solo https).
  - Backtest 1S-2026 con corte de precios 16 oct 2026 y corrida 19 oct 2026. Cifras de `insiders_resumen.json`: 270 eventos, 112 excluidos, promedio −1,80% (mediana −5,45%) contra SPY +8,11%, 88 de 270 le ganaron al SPY, +0,04% a 1 semana, +1,03% a 1 mes, US$1.000 → US$265.131 contra US$291.908 en el SPY.
  - Aviso fijo visible, también con la tabla cerrada: "Simulación histórica con fines informativos. No es recomendación de inversión."
  - Texto: "Señal informativa, no una estrategia ganadora."
- La tabla de filings usa el mismo muro que la composición: un anónimo no recibe las filas (el servidor manda `[]`). El backtest y el aviso sí se ven. Con cuenta se ven las compras.
- Sin Supabase, `/portfolio/insiders-compras-1m` existe en `demo-data.ts` (`return_ytd` null, para no inventar un rendimiento). Las filas de la tabla llevan la etiqueta "Datos de ejemplo". El backtest no es de ejemplo: son las cifras reales del estudio.

### 2. Fuente visible
- Fila y sección en `docs/sources.md` (SEC Form 4, etapa no crítica entre `performance` y `radar_ia`).
- Nombre corto "SEC Form 4" en `src/components/sections/source-line.tsx` y en la ficha del portafolio.
- Las alertas ya llevaban `payload.source_url` desde la sesión A. No se tocó el scraper.

### 3. Verificación
- `npm run lint` — OK.
- `npm run typecheck` — OK después de `npm run build` (genera `LayoutProps`; el `tsc` aislado anterior al build marca `src/app/layout.tsx`, que no se tocó).
- `npm test` — 120/120 OK (incluye `tests/insider-queries.test.ts`).
- `npm run build` — OK. TypeScript del build en verde.
- No se abrió el navegador: esta sesión no levanta servidores y no hay herramienta de browser. No se corrió nada contra Supabase real.

## Cómo probar
1. Sin Supabase: `npm run dev` y abrir `/portfolio/insiders-compras-1m`. Sin cuenta se ve el backtest, el aviso y el muro. Con cuenta (o mirando el HTML de un rol que no sea anónimo) se ve la tabla de ejemplo con la etiqueta "Datos de ejemplo".
2. Con la 016 aplicada: la misma URL lee `insider_trades` y el libro vía `get_portfolio_holdings`. Si la tabla aún no existe, la ficha muestra el backtest y "Aún no hay compras…", sin caer al ejemplo.
3. Tests de la lógica pura: `npm test -- tests/insider-queries.test.ts`.

## Lo que tiene que hacer Manu
- Aplicar `supabase/migrations/016_insiders.sql` en el SQL Editor (se puede correr dos veces). Antes, 001–013 según lo que ya esté aplicado. 014 y 015 son de otros frentes.
- No hay variables de entorno nuevas. El scraper reusa el User-Agent de EDGAR.
- Probar en local con `python scrapers/insiders_form4.py --dry-run` antes de meterlo en el cron (`--only insiders_form4`). Sin `--dry-run` escribe con la service role: hace falta la 016 aplicada y el portafolio presente.
- `scrapers/data/insiders/backtest.py` es referencia. No corre en CI y no se ejecutó aquí (pide los TSV trimestrales y precios).
- No se hizo `git push` ni deploy.

## Decisiones documentadas
- El umbral de US$1M y el filtro de persona/entidad salen del backtest. El filtro de IPO (<45 días) y el de precio de transacción (0,5–2× el cierre de entrada) no están en el scraper: necesitan precios de mercado y el spec de la entrada los deja fuera de esta etapa.
- Un filing ya guardado no se vuelve a descargar. Si dos insiders del mismo ticker presentan el mismo día en corridas distintas, la segunda no se suma a la primera para reevaluar el umbral. Dentro de una misma corrida sí se suman por `(ticker, filed_at)`.
- Los símbolos que salen de la ventana de 90 días se borran de `holdings` de este portafolio solamente. Las filas de `insider_trades` no se borran.
- Al día siguiente, si el peso no cambió, `previous_weight` pasa a ser el peso anterior (ya no 0). La alerta propia del scraper ya quedó publicada; detect-changes no debe repetir un `new_trade`.
- El feed con `count=100` trae unas 100 entradas y ~50 filings únicos. No se sube el count: la spec pide 100.
- Dry-run no consulta la base, así que "compra nueva" ahí significa "califica en este feed", no "no está en la tabla".
