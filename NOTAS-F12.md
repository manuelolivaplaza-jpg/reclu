# NOTAS F12 — Inverse Cramer (real)

Rama: `mejoras/f12-inverse-cramer` · Migración: `supabase/migrations/018_inverse_cramer.sql`

## Qué se hizo (por área)

### 1. Migración 018 (idempotente, reusa `public.mentions`)
- No hay tabla nueva. Se dropea el check de `mentions.kind` (el nombre que tenga) y se vuelve a crear con los 7 tipos de F8 más `recomienda_compra` y `recomienda_venta`.
- Portafolio `inverse-cramer-real`: name "Inverse Cramer (real)", category `model`, source `cnbc_lightning_round`, manager "Jim Cramer (invertido)", country `US`, followers 0, `return_ytd` null, premium false, tags `{cramer,inverse,cnbc,menciones}`.
- 27 picks (2026-09-02 a 2026-10-15). `speaker = 'Jim Cramer'`. `external_id = fecha-ticker`. Cita de hasta 10 palabras y una URL. `on conflict do nothing`.
- Holdings semilla al 2026-10-16: 25 posiciones al 4,00% (suman 100). `previous_weight = 0` para que `detect-changes` emita `new_trade`. MTZ no está: el 6 oct Cramer vendió (Reclu compra) y el 13 oct compró (Reclu va corto); las dos seguían abiertas y se netean.
- El proxy `inverse-cramer` (SQQQ/PSQ en `scrapers/load_thematic.py` y en demo `d9`) no se modificó.

### 2. Scraper `scrapers/inverse_cramer.py`
- Etapa `inverse_cramer` en `run_all.py`, después de `trump_dice` y antes de `radar_ia`. No es crítica. El runner sigue el patrón de `run_infoprobidad` (respeta `--dry-run`, no escribe).
- `fetch_raw()` lee el RSS público de Mad Money (`id=15838459`), verificado en vivo el 2026-10-19. Si el RSS falla, sigue solo con `scrapers/data/cramer_picks.json`.
- Un artículo del RSS que no está en el JSON queda `pendiente`, sin cita y sin fila: no se copia el cuerpo de CNBC. En el dry-run del 2026-10-19 salieron 4 (7, 8, 9 y 14 de octubre).
- El clasificador automático (`classify_quote`) solo da compra o venta con frases inequívocas: compra = buy / buyer / own it / pull the trigger; venta = sell / don't want to own / not going to. "hold" y "wait" quedan pendiente. Si matchean los dos lados, pendiente.
- El JSON curado es la verificación manual (igual que las menciones de F8): con sentido compra/venta, URL de artículo y cita ≤ 10 palabras el pick es `verificada`, aunque la frase automática sea ambigua ("so great", "excellent", "negativo"). Un `status: pendiente` explícito no genera alerta ni posición.
- Entrada: cierre del día hábil siguiente. El viernes 2026-09-04 entra el martes 8 (el lunes 7 es Labor Day). Calendario fijo de feriados NYSE 2026, no un calendario eterno.
- Posición abierta 30 días hábiles desde la entrada, inclusive. Igual peso. El check `holdings.weight >= 0 and weight <= 100` (`schema.sql`) no admite cortos negativos: el peso es positivo y el nombre lleva prefijo `Corto: `.
- Alerta `mention`, `is_published=true`. Título "Inverse Cramer: corto {T}" o "Inverse Cramer: compra {T}". Payload `{symbol, quote, said_at, side, source_url}`.

### 3. URLs del JSON
Varias URLs del archivo original respondían 404. Se reemplazaron por el artículo que sí responde (misma fecha, mismo lightning round), sin copiar el texto:
- 2026-09-08 → `.../cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html`
- 2026-10-05 → `.../i-think-ciena-is-very-good.html`
- 2026-10-06 (venía incompleta, `https://www.cnbc.com/2026/10/06/`) → `.../enterprise-products-partners-is-a-really-well-run-company.html` (EPD y MTZ se insertan)
- 2026-10-12 → `.../i-like-blackberry-very-much.html`
- 2026-10-13 → `.../hold-on-to-element-solutions.html`

### 4. UI
- En `/portfolio/[slug]`, si `source === 'cnbc_lightning_round'`, se reusa `TrumpMentionsList` con `variant="cramer"`.
- Columna "Cramer dijo / Reclu hace". Aviso fijo de simulación, costo de préstamo de los cortos no descontado, y el antecedente de SJIM (NAV de liquidación US$19,78 contra US$25; +0,07% del inverso contra −0,44% del SPY al 2026-10-16).
- Demo: portafolio `d48` y los 25 holdings. `getMentions` en demo distingue Trump dice de Inverse Cramer. Sin Supabase real no se disfrazan datos de una cartera con los de la otra.
- `src/components/sections/source-line.tsx` suma "CNBC". Fila en `docs/sources.md`. Fila 018 en `supabase/migrations/README.md` (la 015 sigue reservada para F9).

### 5. Build de `/accion/[symbol]`
- El build fallaba al prerenderizar `/accion/msft`: `timeAgo` usa `Date.now()` y la página no llamaba `connection()`, aunque ya tenía `instant = false`. Se agregó `await connection()` al inicio del page, igual que el detalle de portafolio. No cambia la UI.

## Verificación ejecutada
- `uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests/test_inverse_cramer.py -q` → 11 passed.
- `uv run python -m py_compile scrapers/inverse_cramer.py scrapers/run_all.py` → OK.
- `uv run --with httpx --with supabase python scrapers/run_all.py --list` → `inverse_cramer` opcional, entre `trump_dice` y `radar_ia`.
- `python scrapers/inverse_cramer.py --dry-run` → RSS OK, 27 verificadas, 25 posiciones al 2026-10-16 (100%), 24 al 2026-10-19 (HWM ya cumplió 30 días hábiles; TRN absorbe el redondeo, 4,09%). No escribió en Supabase.
- `npm run lint` → OK.
- `npm test` → 209 passed (18 archivos).
- `npm run build` → OK. El typecheck de Next, dentro del build, también.
- `npm run typecheck` aislado, antes del build, falla solo en `LayoutProps` de `src/app/layout.tsx` (conocido).
- No se levantó servidor, no se hizo `git push`, no se abrió `.env*`. No se pudo revisar la página en el navegador.

## Pendiente / qué debe configurar Manu
1. Aplicar `supabase/migrations/018_inverse_cramer.sql` en el SQL Editor, después de la 014. Es idempotente. No se ejecutó contra Supabase real.
2. Revisar los términos de uso de CNBC antes de lanzar. El código no guarda el artículo: solo ticker, fecha, sentido, cita ≤ 10 palabras y enlace. Eso no reemplaza la revisión legal.
3. Propuesta: desactivar el proxy `inverse-cramer` (`is_active=false`) cuando `inverse-cramer-real` tenga datos. No borrarlo. Sigue cargado con SQQQ/PSQ en `load_thematic.py` y no refleja las recomendaciones.
4. Los 4 lightning round del RSS (7, 8, 9 y 14 de octubre de 2026) no tienen picks. Para publicarlos hay que agregar al JSON ticker, sentido, cita ≤ 10 palabras y la URL. Hasta entonces no generan alerta ni posición.
5. El calendario de hábiles es la lista fija `NYSE_HOLIDAYS` de 2026. Hay que extenderla para 2027.
6. `cramer_resultados.json` no se copió al worktree. Los números de la UI (+0,07% / −0,44% / SJIM) salen de la especificación, no de un archivo en el repo.

## Decisiones documentadas
- El JSON curado manda sobre el clasificador. Si no, "so great", "excellent" y "negativo" (ya etiquetados a mano) no entrarían al libro y la simulación dejaría fuera la mitad de la muestra.
- Corto = peso positivo + nombre `Corto: TICKER`. Un peso negativo no pasa el check de `holdings`.
- Dos lados abiertos del mismo ticker se netean a cero. Holdings es único por `(portfolio_id, symbol, as_of)`.
- La semilla SQL está congelada al 2026-10-16 (corte del estudio). Una corrida real escribe otro `as_of` (hoy). El 2026-10-19 HWM ya no está abierto.
- No se descuenta el costo de pedir prestadas las acciones. La UI lo dice.
- SJIM se liquidó. La muestra de seis semanas no alcanza para concluir que irle a Cramer funcione.
