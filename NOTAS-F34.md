# NOTAS F34 — Carteras de fondos mutuos chilenos (CMF, Circular 1333)

## Estado

Completada en la rama local `v2/f34-cmf-fondos-mutuos` (worktree
`C:\reclu-work\f13`). **Sin push**, como pide el orquestador.

## Qué se hizo

### 1. `scrapers/cmf_fondos.py`
Descarga la cartera nacional de la CMF y arma el ranking de fondos:

- `POST https://www.cmfchile.cl/institucional/estadisticas/ffm_download.php`
  con `mm`, `aa` y `cartera=NACI` (el formulario público de
  `ffm_cartera.php`). Verificado en vivo el 2026-10-20: responde un archivo
  `;` de ~3,5 MB.
- Parser de las 25 columnas de la Circular 1333. Las relevantes:
  - `0` RUN del fondo, `1` nombre abreviado, `2` nemotécnico.
  - `6` tipo de instrumento (`ACC` = acción).
  - `19` valorización al cierre en miles de pesos.
  - `24` porcentaje de los activos del fondo.
- Agrupa por RUN, calcula la cartera nacional de cada fondo y elige el top 5.
- Baja también el mes anterior (salvo `--sin-comparar`) y llena
  `previous_weight` por fondo + nemotécnico. Una posición nueva queda en `0`.
- Genera la cartera agregada del portafolio ponderando cada fondo por su
  tamaño relativo (suma de `peso × cartera / cartera total`). Solo acciones.
- `--dry-run` no escribe nada; `--archivo` parsea un texto local sin red.

**Criterio de selección (anotado también en el docstring):** el nombre
abreviado de la CMF debe contener un patrón de renta variable nacional
(`ACCIONES CHILE`, `ACCION CHILE`, `CHILE ACCION`, `ACCIONES CHILENAS`,
`ACCIONES NACIONAL`, `RENTA VARIABLE NAC`, `SELECCION ACCION`,
`SEL ACCIONES`, `SELECTAS CHILE`, `DIV ACC CH`, `CHILE EQUITIES`) y no debe
traer marcas extranjeras u otro tipo de fondo (`USA`, `EEUU`, `GLOBAL`,
`MUNDO`, `EUROPA`, `ASIA`, `LATAM`, `EMERGENTE`, `INTERNACIONAL`,
`ESTRUCTURADO`, `DEUDA`, `MIXTO`). Se ordena por la suma de valorizaciones
de la cartera nacional y se cortan los 5 primeros.

Top observado en la corrida real de **2026-09** (dry-run):

| # | RUN | Nombre CMF | Cartera nacional CLP |
|---|-----|-------------|----------------------|
| 1 | 8380 | FM BCH SEL ACCIONES | 670.669.735.000 |
| 2 | 8372 | SELECTAS CHILE | 328.452.510.000 |
| 3 | 8872 | ACCIONES NACIONALES | 271.878.843.000 |
| 4 | 8898 | CHILE ACCION | 261.810.442.000 |
| 5 | 8685 | SELECCION ACCION | 189.249.767.000 |

La corrida real reportó 148 posiciones en los 5 fondos y 46 nemotécnicos en
la cartera agregada.

### 2. `scrapers/stages/cmf_fondos.py`
Etapa `cmf_fondos`, **opcional** (`STAGE[2] = False`). Ante `CmfBlocked`
devuelve `status="blocked"` y no tumba la corrida, igual que
`cmf_accionistas`. Se autodescubre antes de `radar_ia`.

### 3. `supabase/migrations/034_fondos_mutuos.sql`
- `public.cl_mutual_funds`: ranking por fondo + periodo.
  `cartera_nacional_clp` (bigint), `posiciones`, `fuente`, `source_url`.
  Unique `(run, periodo)`.
- `public.cl_mutual_fund_holdings`: posiciones por fondo + periodo +
  nemotécnico. `weight`, `previous_weight`, `valorizacion_miles`,
  `currency`, FK a `cl_mutual_funds(run, periodo)` con `on delete cascade`.
  Unique `(fund_run, periodo, symbol)`.
- Vista `public.cl_mutual_funds_ranking` con `rank()` por periodo.
- RLS: lectura pública (`select`), escritura solo service role (sin policies
  de insert/update/delete). Grants a `anon` y `authenticated`.
- Trigger `set_cl_mutual_funds_updated_at` (reutiliza
  `public.set_updated_at()` de `schema.sql`).
- Portafolio `fondos-mutuos-acciones-cl` (`category = 'broker_cl'`,
  `source = 'cmf_fondos'`, `premium = false`) con `on conflict (slug) do
  update` que no toca `followers` ni `return_ytd`.
- Idempotente: `create table/index if not exists`, `drop policy if exists`,
  `drop view if exists` + `create view`, `on conflict (slug) do update`.

### 4. `scrapers/tests/test_cmf_fondos.py`
19 tests sin red: parser, criterio, ranking top 5, comparación mensual,
ponderación, dry-run, upserts contra un fake de Supabase, WAF, etapa y
texto de la migración.

## Variables nuevas

**Ninguna.** La etapa usa las variables existentes de `scrapers/base.py`
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) solo cuando corre sin
`--dry-run`. No se tocó `.env.example` (lo une F57).

## Deudas y notas

- **Patrimonio exacto:** la CMF publica patrimonio/rentabilidad/partícipes
  en otro archivo Excel (`fm.fm_bpr.php?...&out=excel`), que necesita un
  lector BIFF (`xlrd`) y no está en `requirements.txt`. Para no agregar una
  dependencia fuera del alcance de F34, el ranking usa la **suma de
  valorizaciones de la cartera nacional** como aproximación al patrimonio.
  Está documentado en el docstring y en la columna
  `cartera_nacional_clp`. Si se quiere patrimonio exacto, la deuda es
  agregar `xlrd` a `requirements.txt` y descargar ese Excel.
- **Nombres abreviados:** la CMF entrega nombres cortos (`FM BCH SEL
  ACCIONES`, `SELECTAS CHILE`). No se inventó un mapa a nombres
  comerciales completos.
- **Sin UI:** F34 entrega datos y portafolio. La pantalla que muestre el
  ranking y los cambios queda para una tarea de frontend.
- **Datos de la tarea:** `scrapers/data/v2/F34/` no existía en este
  worktree; se trabajó contra la fuente viva (solo `--dry-run`) y fixtures
  locales en el test.
- **Python no está en el PATH** de esta máquina. Todo se verificó con
  `uv run --python 3.11`.
- `python scrapers/run_all.py --dry-run` imprime un `✓` y en consola
  cp1252 falla al final con `UnicodeEncodeError`. Es un problema previo de
  `run_all.py` (no se tocó, no está en el alcance). Con
  `PYTHONIOENCODING=utf-8` funciona.
- La migración **no se ejecutó** contra Supabase real. La idempotencia se
  revisó por texto (`if not exists`, `on conflict do nothing/do update`,
  `drop policy if exists`, `drop view if exists`) y con un test.

## Cómo probar

```powershell
cd C:\reclu-work\f13

# Tests Python (19) y compilación
$env:UV_CACHE_DIR="C:\Users\manue\AppData\Local\uv\cache"
uv run --python 3.11 --with pytest python -m pytest scrapers/tests/test_cmf_fondos.py -q
uv run --python 3.11 python -m py_compile `
  scrapers/cmf_fondos.py scrapers/stages/cmf_fondos.py scrapers/tests/test_cmf_fondos.py

# La etapa aparece en el orquestador
uv run --python 3.11 --with httpx --with supabase python scrapers/run_all.py --list

# Dry-run real: no escribe en Supabase
$env:PYTHONIOENCODING="utf-8"
uv run --python 3.11 --with httpx --with supabase --with curl_cffi `
  python scrapers/run_all.py --only cmf_fondos --dry-run

# Un mes concreto / sin comparación / archivo local
uv run --python 3.11 --with curl_cffi python scrapers/cmf_fondos.py --dry-run --periodo 2026-09
uv run --python 3.11 --with curl_cffi python scrapers/cmf_fondos.py --dry-run --periodo 2026-09 --sin-comparar
uv run --python 3.11 python scrapers/cmf_fondos.py --archivo ruta\al\FFM_INV_NACI_202609.txt

# Verificación Next
npm run lint
npm test
npm run typecheck
```

## Archivos y commits

- `scrapers/cmf_fondos.py`
- `scrapers/stages/cmf_fondos.py`
- `supabase/migrations/034_fondos_mutuos.sql`
- `scrapers/tests/test_cmf_fondos.py`
- `NOTAS-F34.md`

Commits locales:

1. `feat: add CMF mutual funds scraper and stage`
2. `feat: add mutual funds migration`
3. `test: cover CMF mutual funds scraper`
4. `docs: F34 notes` (este archivo)
