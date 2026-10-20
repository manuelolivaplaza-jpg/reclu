# NOTAS-F36 — Funcionarios de EE.UU. (OGE 278-T)

Rama: `v2/f36-oge-funcionarios` (worktree `C:\reclu-work\f25`), desde
`mejoras/integracion`. Sin push.

## Qué se hizo

- **`scrapers/data/oge_officials.json`**: lista configurable con 3 secretarios
  del gabinete verificados en vivo el 2026-10-19 contra el índice público de la
  OGE (`extapps2.oge.gov/201/Presiden.nsf/API.xsp/v3/rest`):
  - Scott Bessent — Tesoro (`bessent-oge`)
  - Howard Lutnick — Comercio (`lutnick-oge`)
  - Pete Hegseth — Defensa (`hegseth-oge`)
  Cada entrada trae nombre, cargo, agencia, URL del índice y nombre del
  portafolio. **No hay Fed**: desde 2022 la FOMC prohíbe acciones individuales
  y un portafolio sería una señal falsa.
- **`scrapers/oge_officials.py`**: parser genérico `parse_278t_official()`
  sobre la base de F13 (`oge_trump`), sin tocar `oge_trump.py`:
  - acepta cualquier año (2025, 2026, …), no solo 2026;
  - extrae el ticker entre paréntesis (`iShares ... (EWG)`), habitual en los
    informes del gabinete;
  - evita falsos positivos con palabras como `Salesforce`;
  - reconstruye descripciones partidas en dos líneas por el PDF;
  - `status='pendiente'` por defecto: nada se publica sin revisión manual;
  - `holdings_for_trades()` usa compras verificadas con ticker y tramo mínimo
    de US$1.001; `alerts_for_trades()` alerta compras **y** ventas verificadas;
  - `OgeOfficialsAdapter` descubre los PDF 278-T, los descarga y guarda filas
    pendientes; con `db=None` o `--dry-run` no escribe nada.
- **`scrapers/stages/oge_officials.py`**: etapa autodescubierta
  `oge_officials`, opcional, antes de `radar_ia`.
- **`supabase/migrations/036_oge_funcionarios.sql`**: un portafolio por
  funcionario con `source='oge_278t'`, `premium=false`, `is_active=true`.
  Idempotente por `on conflict (slug) do update`; reutiliza
  `disclosure_trades` y las funciones públicas de la migración 019.
- **`scrapers/tests/test_oge_officials.py`**: configuración, parseo
  multi-año, tickers, descripciones partidas, pendientes sin holdings/alertas,
  ventas sin holding, filtrado del índice OGE y dry-run sin escritura.

Legal: 5 U.S.C. § 13107(c)(1)(B) — datos públicos, gratuitos y fuera del muro.
`src/lib/public-disclosure.ts` ya incluye `oge_278t`, así que no hizo falta
tocar UI ni paywall. Sin datos personales más allá de nombre, cargo y PDF
oficial (Leyes 19.628 / 21.719).

## Variables de entorno nuevas

Ninguna. No se editó `.env.example`.

## Verificación

```bash
uv run --python 3.11 python -m py_compile \
  scrapers/oge_officials.py scrapers/stages/oge_officials.py \
  scrapers/tests/test_oge_officials.py

uv run --python 3.11 --with httpx --with pypdf --with pytest \
  python -m pytest scrapers/tests/test_oge_officials.py \
  scrapers/tests/test_oge_trump.py -q
# 11 passed, 1 skipped (el test online de F13 queda skipped sin RECLU_OGE_ONLINE=1)

uv run --python 3.11 --with httpx --with supabase --with pypdf \
  python scrapers/run_all.py --list
# incluye: oge_officials  opcional  Funcionarios de EE.UU.: declaraciones OGE 278-T

# En Windows, la consola cp1252 no imprime el ✓ del resumen final:
$env:PYTHONIOENCODING='utf-8'
uv run --python 3.11 --with httpx --with supabase --with pypdf \
  python scrapers/run_all.py --only oge_officials --dry-run
# 3 funcionarios, 5 informes, 74 filas, 74 pendientes; holdings=0, alerts=0
```

`npm run lint` OK. `npm test` OK (455 tests). `npm run typecheck` falla solo
por el error conocido de Next 16 `LayoutProps` en `src/app/layout.tsx` (tipo
global generado en build; no hay cambios TS en esta tarea). El build real lo
corre el orquestador.

La migración no se ejecutó contra Supabase. Se revisó a mano: `on conflict
(slug) do update`, sin `create table` ni políticas duplicadas, y rollback
comentado. Dos ejecuciones seguidas no deberían fallar.

## Deudas / pendientes

- Los 278-T del gabinete suelen ser **ventas por desinversión**, así que los
  portafolios pueden quedar sin holdings hasta que aparezca una compra
  verificada. Las ventas sí generan alertas. Si se quiere mostrar actividad
  (no cartera), habría que añadir una vista específica en otra tarea.
- Las filas entran `pendiente`; falta el flujo de revisión/verificación manual
  (el mismo que ya usa `oge_trump`).
- El parser no interpreta montos `Over $50,000,000` (quedan sin tramo) ni
  notas al pie complejas; se descartan para holdings y se conservan como fila.
- No se agregó UI nueva: el detalle público ya funciona por `source=oge_278t`
  y `public-disclosure.ts`.
- El resumen de `run_all.py` requiere `PYTHONIOENCODING=utf-8` en Windows por
  un problema preexistente del checkmark, ajeno a esta tarea.

## Cómo probar

1. `python -m pytest scrapers/tests/test_oge_officials.py scrapers/tests/test_oge_trump.py -q`
2. `python scrapers/run_all.py --list` → debe aparecer `oge_officials`.
3. `python scrapers/run_all.py --only oge_officials --dry-run` → no escribe en
   Supabase y muestra el conteo por funcionario.
4. Revisar `scrapers/data/oge_officials.json` para agregar/quitar funcionarios
   (slug único por portafolio; crear su fila en la 036).
