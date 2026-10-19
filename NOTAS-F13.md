# NOTAS F13 — Trump compra (declaraciones OGE 278-T)

Rama: `mejoras/f13-trump-compra` · Migración asignada: `supabase/migrations/019_trump_compra.sql`

## Qué se hizo (por área)

### 1. Migración `019_trump_compra.sql`
- Tabla genérica `public.disclosure_trades` (filer, informe, fila, lado, fecha, tramo, estado).
- Único `(report_url, line_no)`. RLS: el público solo lee `status = 'verificada'`.
- Portafolio `trump-compra`: "Trump compra (OGE)", `political_us`, source `oge_278t`, manager Donald Trump, país US, `premium = false`, followers 0, `return_ytd` null, tags `{trump,oge,declaraciones}`.
- `get_portfolio_holdings` no recorta si `source` es `oge_278t`, `house_ptr` o `senate_ptr` (`LIMIT NULL`).
- `get_symbol_holders` se vuelve a crear al final, igual que la 015 (rank sobre toda la cartera vigente y filtro premium), sin límite si `source` es `oge_278t`, `house_ptr` o `senate_ptr`. Rollback: volver a correr la 015.
- No toca `trump-trades` ni `trump-truth-signals`.
- Fila en `supabase/migrations/README.md`. Si se reejecuta `012_muro_pago.sql` después, hay que volver a aplicar la 019: reemplaza la función del muro.

### 2. Scraper `scrapers/oge_trump.py`
- Índice PAS + PDF conocido en `scrapers/data/trump_oge/known_reports.json` (el índice de nominados no lista al presidente).
- Texto con `pdftotext -layout`; si no hay capa, pypdf y, al final, `pytesseract` (línea en `scrapers/requirements.txt`; hace falta el binario tesseract).
- `parse_278t`: fila, descripción, lado (OCR "lourchaso" → purchase), fecha y tramo oficial.
- Fecha que no cumple `\d{1,2}/\d{1,2}/2026` → `trans_date` null y `trans_date_uncertain = true`. No se guarda la fecha supuesta.
- Ticker en `scrapers/data/trump_oge/descripcion_ticker.json` (las 11 del CSV más variantes OCR). Sin ticker, `symbol` null y no entra a holdings.
- Todo se inserta `pendiente`. Solo una fila ya `verificada` arma holdings (punto medio del tramo, `previous_weight = 0`) y alerta `new_trade` con `payload.source_url`.
- `detect-changes` salta `oge_278t` para no duplicar esa alerta.
- Etapa en `scrapers/run_all.py`: `oge_trump`, después de `performance` y antes de `radar_ia`, no crítica.

### 3. UI
- `src/components/oge-trades-panel.tsx` en `/portfolio/trump-compra`: tramo, fecha de operación (o "Fecha dudosa"), fecha de publicación y enlace "PDF OGE".
- Avisos: atraso de hasta 45 días, rendimiento desde la publicación, y "Simulación histórica con fines informativos. No es recomendación de inversión."
- Fuera del muro visual: `locked` es falso si `isPublicDisclosureSource` (`src/lib/public-disclosure.ts`). En demo, `getHoldings` no recorta `trump-compra`. En vivo, el recorte lo hace la función SQL.
- En demo (sin Supabase) el panel muestra el borrador OCR de las 11 compras y dice que no genera alerta. No hay holdings de ejemplo.
- Fuente corta "OGE 278-T" en `src/components/sections/source-line.tsx` y fila en `docs/sources.md`.

### 4. Tests
- `scrapers/tests/test_oge_trump.py`: filas 381–386 del fixture (META US$5–25M; AT&T con fecha dudosa; COP, ABT, NFLX, CVX), OCR de lado, MSFT fila 57 incierta, y filas `pendiente` sin alerta ni holding.
- El parseo usa `scrapers/tests/fixtures/oge_trump_278t_2026-09-17.txt` (carátula y filas 57 y 381–386, menos de 50 KB). El PDF salió del repo (`scrapers/tests/fixtures/*.pdf` en `.gitignore`). `test_pdf_oficial_descarga` baja el PDF oficial a un temporal solo si `RECLU_OGE_ONLINE=1`.

## Verificación ejecutada
- `npm run lint` — OK.
- `npm run typecheck` — solo el error ya documentado de `LayoutProps` en `src/app/layout.tsx` (tipo global del build). `npm run build` compiló TypeScript sin ese error.
- `npm test` — 113/113 OK.
- `npm run build` — OK (Next 16.4, `/portfolio/[slug]` incluido).
- `uv run python -m py_compile scrapers/oge_trump.py scrapers/run_all.py` — OK.
- `uv run --with pytest --with pypdf python -m pytest scrapers/tests/test_oge_trump.py -q` — 4 passed.
- `uv run --with httpx --with supabase python scrapers/run_all.py --list` — `oge_trump` aparece como opcional.
- No se abrió el sitio en el navegador: esta sesión no puede levantar `npm run dev`.

## Pendiente / qué debe configurar Manu
1. **Migraciones, en el SQL Editor, en orden.** No se aplicó nada a la base real.
   - Previas, sobre todo `012_muro_pago.sql` (crea `current_user_plan` y `holdings_limit_for_plan`).
   - Después `supabase/migrations/019_trump_compra.sql` (idempotente).
   - Si más adelante se reejecuta la 012, reejecutar la 019.
   - La 014 es de F8 y la 015 queda reservada a F9. Si al integrar hay choque de número, se puede renumerar: el archivo es idempotente.
2. **Variables nuevas:** ninguna. El scraper usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, que ya existen. Sin service role no puede insertar filas `pendiente` (RLS solo permite leer `verificada`).
3. **Cuentas externas:** ninguna. El PDF de la OGE es público y no pide login.
4. **OCR en la máquina del cron:** `pdftotext` (poppler) o Tesseract. El fixture de septiembre 2026 ya trae capa de texto.
5. **Revisión manual antes de publicar.** El scraper no marca `verificada`.
   - Correr solo `--dry-run` la primera vez.
   - Contrastar a mano el PDF, en especial la fila 57 (MSFT, el OCR lee "8/1017026") y la 382 (AT&T, el OCR lee "Rhl/2026"). Páginas de esas filas.
   - Recién entonces, en el SQL Editor: `status = 'verificada'`, y si la fecha se confirmó, completar `trans_date` y bajar `trans_date_uncertain`.
   - La corrida siguiente (sin dry-run) crea holdings y la alerta. `send-alerts` solo manda `is_published = true`, y eso ocurre después de esa revisión.
6. **Abogado, antes de lanzar. No está cerrado.**
   - 5 U.S.C. § 13107(c)(1)(B) prohíbe obtener o usar un informe de declaración financiera con fin comercial, salvo medios de prensa que lo difunden al público. Multa de hasta US$10.000.
   - https://www.law.cornell.edu/uscode/text/5/13107
   - La misma regla cubre los PTR de Cámara y Senado que Reclu ya usa (`house_disclosure`, `senate_disclosure`).
   - Propuesta ya cableada, a confirmar: gratis, `premium = false`, excepción de `get_portfolio_holdings` para `oge_278t` / `house_ptr` / `senate_ptr`, enlace al PDF oficial, sin revender ni usar los datos para pedir dinero.
   - Los portafolios actuales de Cámara y Senado no usan esos `source`. Siguen en `capitol_trades`, `house_clerk` u otros. La excepción no los abre. No cambiarles el source hasta el visto del abogado.
7. **Números inventados que esta rama no tocó.**
   - `trump-trades`: en demo, 8300 seguidores y +18,2% YTD; el seed pone 8300 seguidores. Fuente `capitol_trades`, no el 278-T.
   - `trump-truth-signals` (migración 006): 19400 seguidores, +36,40% YTD, `premium = true`. Es editorial, no sale del formulario.
8. **Rendimiento de referencia** (`scrapers/data/trump_oge/trump_compra_resultados.json`, corte 2026-10-16). No está cargado como `return_ytd`.
   - Entrada el día de la operación: cartera −0,29% y SPY −0,45%.
   - Entrada el día de publicación (08-10-2026): cartera +2,06% y SPY −1,38%.
   - Son 6 días hábiles. No alcanzan para concluir nada.

## Decisiones
- La fecha dudosa queda vacía. El encargo sugería asumir 21-08 para AT&T y 10-08 para MSFT; eso no se escribe en la base. Quien verifica la fila pone la fecha.
- El bono de SpaceX y el resto de municipales no están en el mapa de tickers: quedan `pendiente`, sin símbolo, y fuera de holdings.
- El peso es el punto medio del tramo oficial, no un monto exacto. La tabla de la página muestra el tramo.
- La deduplicación de alertas es por símbolo + URL del informe. En este PDF las 11 compras son símbolos distintos.
- El tope de alertas del muro F6 (anónimo 3, free 10) sigue en la columna lateral. El difuminado está apagado y las posiciones no se cortan. La tabla OGE va fuera de `PaywallGate`.
