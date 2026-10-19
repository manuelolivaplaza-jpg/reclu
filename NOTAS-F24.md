# NOTAS-F24 — Consenso de corredoras CL

Rama local `v2/f24-consenso-corredoras` (worktree `C:\reclu-work\f23`, base
`mejoras/integracion`). Sin push, como pide el orquestador.

## Qué se hizo

### 1. Migración `supabase/migrations/024_consenso_corredoras.sql`
- Crea tres portafolios `broker_cl`, `country=CL`, `premium=false`,
  `followers=0`, `return_ytd=null`:
  - `bice-acciones-destacadas` (`source=bice_cartera`)
  - `mbi-acciones-recomendadas` (`source=mbi_cartera`)
  - `consenso-corredoras-cl` (`source=corredoras_cl`)
- Holdings semilla del corte **2026-10-05**, tomados de
  `scrapers/data/v2/F23/carteras_oct_2026.json`:
  - BICE: 7 posiciones (suma 100%).
  - MBI: 5 posiciones al 20% (suma 100%).
  - Consenso: 10 posiciones, promedio simple BICE + MBI (suma 100%).
- Todos con `previous_weight=0`, `currency=CLP`, `exchange=BCS`,
  `asset_class=equity`.
- Idempotente:
  - BICE y MBI: `on conflict (slug) do nothing` (mismos valores que la 044);
  - consenso: `on conflict (slug) do update` solo de `description` y
    `source` (nunca pisa `followers` ni `return_ytd`);
  - holdings: `insert ... select` con
    `on conflict (portfolio_id, symbol, as_of) do nothing`.
- No se ejecutó contra Supabase real. Revisado a mano buscando
  `on conflict`, `do nothing` y ausencia de `drop ... cascade`.

### 2. `scrapers/corredoras_cl.py`
- `cargar_carteras(ruta=None)`: lee la fotografía JSON (por defecto
  `scrapers/data/v2/F23/carteras_oct_2026.json`).
- `build_consenso(carteras=None)`: promedio simple **solo** de las carteras
  con `completa=true`. Un símbolo ausente en una completa cuenta como 0%.
  No renormaliza. Las parciales (Itaú, Credicorp) no entran.
- `referencia_parciales(carteras=None)`: devuelve Itaú y Credicorp con sus
  pesos parciales, fuente y nota, para mostrarlos como referencia.
- `CORREDORAS_FUERA_DEL_CONSENSO = ("renta4", "btg")`: Renta 4 y BTG no
  entran hasta verificar que sus pesos sigan vigentes (sus etapas actuales
  tienen otras fechas de corte).
- `build_consenso` acepta lista, dict del JSON, `Path` o `str`.

### 3. UI `src/components/source-panels/corredoras-cl.tsx`
- Tabla **corredora × acción**: BICE, MBI y Consenso.
- Cabecera con fecha de corte y enlace al PDF público de cada corredora.
- Bloque aparte “Referencia: carteras parciales (no entran al consenso)” con
  Itaú y Credicorp y enlace a la fuente de prensa.
- `<LegalNotice kind="fintec" />` al pie (Ley Fintec: información, no
  ejecución de órdenes ni recomendación personalizada).
- Los pesos se leen de Supabase (`getPortfolioBySlug` + `getHoldings`) y, si
  la migración 024 no está aplicada o el sitio está en modo demo, cae al
  corte de octubre 2026 embebido.
- `src/components/source-panels/index.tsx` registra el panel para
  `corredoras_cl`, `bice_cartera` y `mbi_cartera`.

### 4. Tests `scrapers/tests/test_consenso.py`
9 tests, sin red y sin Supabase:
- promedio exacto BICE + MBI (suma 100%);
- las parciales no alteran el promedio ni aportan símbolos;
- sin carteras completas el consenso es vacío;
- `referencia_parciales` lista solo las incompletas;
- Renta 4 y BTG quedan fuera aunque se marquen completas;
- orden por peso y alias de nombres.

## Variables de entorno nuevas
Ninguna.

## Verificación (2026-10-19)
- `npm run lint`: verde.
- `npm run typecheck`: verde después de `npx next typegen` (genera el tipo
  global `LayoutProps` de Next 16; sin ese paso, `tsc` aislado marca el error
  conocido documentado en `AGENTS.md`, no relacionado con F24).
- `npm test`: **344 passed** (31 suites), incluidas las 9 nuevas de Python no
  aplican aquí; todos los tests previos siguen verdes.
- `python -m py_compile scrapers/corredoras_cl.py scrapers/tests/test_consenso.py`: OK
  (ejecutado con `uv run`, porque `python` es el alias de la Microsoft Store).
- `pytest scrapers/tests/test_consenso.py`: **9 passed**.
- `pytest test_corredoras_cl.py test_migracion_044.py test_consenso.py`:
  **21 passed** (no se rompió F23/M44).
- `run_all.py --list`: muestra `corredoras_cl` (opcional) antes de `radar_ia`.
- `run_all.py --only corredoras_cl --dry-run`: 7 holdings BICE + 5 MBI
  informados, **nada escrito**, exit 0. En Windows hay que exportar
  `PYTHONIOENCODING=utf-8`; sin eso el `✓` del resumen rompe la consola
  cp1252 (problema previo de `run_all.py`, no de esta tarea).

## Deudas / pendientes
1. ~~**Slugs duplicados con la 044 (M44).**~~ **Resuelto en F24-B** (rama
   `v2/f24b-unificar-slugs`): los slugs oficiales son los de la 044
   (`bice-acciones-destacadas` y `mbi-acciones-recomendadas`). La 024 ahora
   inserta esas dos filas con los mismos valores que la 044 y
   `on conflict (slug) do nothing`, así el orden de aplicación no importa.
   Los holdings semilla, el panel y los tests usan esos slugs. El parser ya
   los usaba. Ver `NOTAS-F24B.md`.
2. **Consenso no se reescribe solo.** `build_consenso` está listo, pero la
   etapa `corredoras_cl` sigue devolviendo solo los dos adaptadores BICE/MBI.
   La 024 deja el consenso como foto de octubre 2026. Para actualizarlo en
   cada corrida hay que agregar un adaptador `consenso-corredoras-cl` a la
   etapa.
3. **Altas y bajas.** `detect-changes` ya genera `new_trade` cuando llega una
   fila con `previous_weight=0` y `weight_change`/`sold_trade` cuando cambia o
   llega a 0. La base actual no escribe filas `weight=0` para acciones que
   desaparecen del PDF, así que una **baja** todavía no genera alerta. Falta
   que el adaptador cierre las posiciones que ya no aparecen (insertar
   `weight=0` con `previous_weight` anterior).
4. Las carteras parciales (Itaú, Credicorp) no tienen PDF original; se
   muestran solo con la fuente de prensa.
5. No se agregó la fila de la 024 a `supabase/migrations/README.md` porque ese
   archivo lo une F57 (regla del orquestador).

## Cómo probar
```powershell
# Tests Python (usar uv; python es alias de la Store)
uv run --with pytest --with httpx --with supabase --with pypdf python -m pytest scrapers/tests/test_consenso.py
uv run --with pytest --with httpx --with supabase --with pypdf python -m py_compile scrapers/corredoras_cl.py

# Etapa y listado
uv run --with httpx --with supabase --with pypdf python scrapers/run_all.py --list
$env:PYTHONIOENCODING='utf-8'
uv run --with httpx --with supabase --with pypdf python scrapers/run_all.py --only corredoras_cl --dry-run

# Front
npm run lint
npx next typegen
npm run typecheck
npm test
```

Para ver la migración en un Supabase de prueba: aplicar `024` dos veces
seguidas; la segunda no debe fallar ni duplicar filas.

## Commits
- `feat: add broker consensus portfolio data and aggregation`
- `feat: add broker consensus source panel`
- `fix: compute panel consensus from loaded holdings`
- `docs: document F24 consensus and verification`
- `docs: note next typegen for typecheck`
