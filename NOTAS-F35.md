# NOTAS-F35 — Flujos de ETFs ("dónde entra la plata")

Rama: `v2/f35-etf-flujos` · Worktree: `C:\reclu-work\f9` · Base: `mejoras/integracion` (F2, F4, F8–F15 y F26 ya presentes)

## Qué se hizo

Flujo diario de los ETFs de iShares: `Δ acciones en circulación × NAV por acción`.

Un ETF emite acciones nuevas cuando entra demanda de compra (y las destruye
cuando hayVentas). Si el patrimonio del fondo y el NAV por acción se mueven,
el flujo diario estimado es `(acciones_hoy - acciones_ayer) × NAV`.

### Archivos

| Archivo | Qué hace |
|---|---|
| `scrapers/etfs.py` (modificado) | `parse_ishares_csv()` nuevo: parsea el CSV oficial de iShares y devuelve `(holdings, cabecera)`. La cabecera trae `shares_outstanding`, `as_of`, `inception_date`, `net_assets_usd`, `net_assets_metodo` y `nav`. `fetch_ishares(slug, with_header=True)` devuelve `(rows, cabecera)`; sin el flag se comporta igual que antes (lista de holdings), así que `fetch_etf()` y la etapa `etfs` no cambian. |
| `scrapers/etf_flows.py` (nuevo) | Lógica de flujos: `fetch_flow_data()`, `calcular_flujo()`, `acciones_previas()`, `upsert_flujos()`, `collect()` y `main()` con `--dry-run`. |
| `scrapers/stages/etf_flows.py` (nuevo) | Etapa del orquestador. `STAGE = ("etf_flows", "Flujos de ETFs iShares (Δ acciones en circulación × NAV)", False)`. Se autodescubre: aparece en `run_all.py --list` entre `corredoras_cl` y `etfs_subversive` (orden alfabético, antes de `radar_ia`). |
| `supabase/migrations/035_flujos_etf.sql` (nuevo) | Tabla `etf_flows` + índices + RLS + trigger `updated_at`. |
| `scrapers/tests/test_etf_flows.py` (nuevo) | 17 tests: parseo de cabecera, matemática del flujo, contrato de la etapa, dry-run sin Supabase y contenido idempotente de la 035. |
| `scrapers/data/v2/F35/` | Datos de la tarea (README + cabecera real del CSV de ECH). |

### La cabecera de ECH

El fixture `scrapers/tests/fixtures/F35/ech_csv_cabecera.txt` es la cabecera
real del CSV de iShares del ECH al "Oct 15, 2026":

```
Shares Outstanding,"24,700,000.00"
```

`parse_ishares_csv()` lo devuelve como `24_700_000.0` (el test lo verifica).

### Cómo se estima el NAV

El CSV de iShares no publica el NAV por acción, solo el `Market Value` de cada
posición y su `Weight (%)`. Como el peso es el porcentaje del patrimonio
total, `Market Value / (Weight/100)` es el patrimonio estimado. Se toma la
**mediana** de las posiciones para que la estimación no dependa de que el CSV
venga completo (`net_assets_metodo = 'peso_por_posicion'`). Respaldo: la suma
de los `Market Value` (`'suma_market_value'`), y `None` si no hay dato.

`nav = net_assets_usd / shares_outstanding`.

Verificado en vivo contra iShares (2026-10-19):

| ETF | Acciones | Patrimonio est. | NAV est. |
|---|---:|---:|---:|
| ECH | 24.200.000 | 890.826.786 | 36,8110 |
| EWW | 20.100.000 | 1.513.244.657 | 75,2858 |
| EWZ | 328.550.000 | 13.756.115.196 | 41,8692 |
| IBIT | 1.418.480.000 | 66.409.390.565 | 46,8173 |

### La tabla `etf_flows`

```sql
etf_flows(id, symbol, fecha, acciones, nav, flujo_usd, fuente, source_url, created_at, updated_at)
  unique (symbol, fecha)
```

- `symbol` = ticker en mayúsculas (como en la tabla `prices`): ECH, EWW, EWZ, IBIT.
- `acciones` = acciones en circulación de la cabecera del CSV.
- `nav` = valor liquidativo por acción estimado.
- `flujo_usd` = `(acciones_hoy - acciones_lectura_anterior) × NAV`. **0** si no
  hay lectura anterior (primera corrida) o si no hay NAV.
- `fuente` = `'ishares'`.
- RLS: lectura pública (`anon`, `authenticated`), escritura solo service role.
- Trigger `set_etf_flows_updated_at` (reutiliza `public.set_updated_at()` de `schema.sql`).

### La etapa

`run_all.py --only etf_flows` corre la etapa; con `--dry-run` no escribe
nada y ni siquiera lee Supabase (`acciones_previas` se salta en dry-run).

El flujo se calcula contra la fila anterior más reciente del mismo símbolo
con `fecha < fecha_actual` (`.lt("fecha", fecha)`), así que reejecutar el
mismo día no se compara consigo mismo y es idempotente.

## Variables nuevas

Ninguna. No se agregan variables de entorno: la etapa solo usa la URL pública
de iShares que ya está en `scrapers/etfs.py` (`ISHARES_HOLDINGS`) y escribe
con el service role que ya usa el resto de los scrapers.

## Deudas / pendientes

1. **Migración 035 sin ejecutar.** No se corrió contra Supabase real (por
   regla de la tarea). Manu la corre en el SQL Editor. Es idempotente:
   `create table if not exists`, `create index if not exists`,
   `drop policy if exists` + `create policy`, `drop trigger if exists` +
   `create trigger`.
2. **La primera corrida deja `flujo_usd = 0`** en todos los fondos: no hay
   lectura anterior con la que comparar. El flujo real aparece desde la
   segunda corrida diaria. Para sembrar historial hay que correr la etapa
   dos días seguidos (o cargar las filas a mano).
3. **Solo iShares.** ARK, Global X y VanEck no publican acciones en
   circulación en un archivo oficial estable (ver `scrapers/data/v2/F35/README.md`).
   Si aparece una fuente, se suma al `TICKER_POR_SLUG` de `scrapers/etf_flows.py`.
4. **El patrimonio es una estimación**, no el AUM oficial: sale de los pesos
   del propio CSV. Sirve para dimensionar el flujo, no para contabilidad.
5. **El flujo es un delta de creación/redención de acciones**, no dinero que
   entra a Chile. Es "dónde entra la plata" en sentido de creación de demanda,
   no de flujo de caja entre países.
6. **Sin UI en esta fase.** La tabla queda lista para que otra fase la
   pinte (gráfico de barras divergentes verde/rojo, como manda
   `docs/hermes-diseno.md`).
7. **El orquestador corre `etf_flows` después de `prices`** en el orden
   canónico (orden alfabético dentro de `stages/`), así que el NAV estimado
   ya tiene contraparte de precio si en el futuro se cruza con la tabla
   `prices`.

## Cómo probar

Desde `C:\reclu-work\f9`:

```bash
# 1. Tests de F35 (17 tests)
cd scrapers
uv run --with pytest --with-requirements requirements.txt python -m pytest tests/test_etf_flows.py -q

# 2. Toda la suite de scrapers (294 passed, 1 skipped)
uv run --with pytest --with-requirements requirements.txt python -m pytest tests/ -q

# 3. La etapa aparece en el orquestador
uv run --with-requirements requirements.txt python run_all.py --list | grep etf

# 4. Dry-run real contra iShares: NO escribe nada
uv run --with-requirements requirements.txt python run_all.py --only etf_flows --dry-run
```

Salida esperada del dry-run (2026-10-19):

```
[etf_flows] DRY-RUN ECH: acciones 24,200,000 @ NAV 36.8110 (2026-10-19) - sin escribir
[etf_flows] DRY-RUN EWW: acciones 20,100,000 @ NAV 75.2858 (2026-10-19) - sin escribir
[etf_flows] DRY-RUN EWZ: acciones 328,550,000 @ NAV 41.8692 (2026-10-19) - sin escribir
[etf_flows] DRY-RUN IBIT: acciones 1,418,480,000 @ NAV 46.8173 (2026-10-19) - sin escribir
```

Y del proyecto Node (sin cambios en `src/`, pero se verifica igual):

```bash
npm run lint && npm run typecheck && npm test
```

## Commits

```
318a391 feat: parse iShares header for shares outstanding
d7fa1eb feat: compute daily ETF flows from shares outstanding delta
e893a82 feat: add etf_flows table migration
0a0c45a test: cover iShares header parsing and ETF flow math
ce93e64 chore: add F35 source data
```

Rama `v2/f35-etf-flujos`, sin push.
