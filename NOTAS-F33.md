# F33 — 12 mayores accionistas (CMF) y "Quién compra Chile"

Rama `v2/f33-cmf-mayores-accionistas` (worktree `C:\reclu-work\f13`, base
`mejoras/integracion` con F2, F4 y F8–F15 fusionadas). Sin push.

## Qué se hizo

- `scrapers/cmf_accionistas.py` (nuevo)
  - Parser de la pestaña 5 de la ficha CMF (`entidad.php?...&pestania=5`):
    periodo (`09 / 2026` → `2026-09`), razón social y RUT del emisor, y la
    tabla de 12 filas (nombre, acciones suscritas, acciones pagadas, % de
    propiedad).
  - `%` con formato chileno `69,75%` → `69.75`; el `0` que publica la CMF
    se conserva como `0.0` (significa "no calculado o no significativo").
  - RUT normalizado a cuerpo sin puntos ni DV (`96.766.110-4` →
    `96766110`), la misma clave del mapa de F15.
  - Reutiliza el mapa verificado de F15
    (`scrapers/data/infoprobidad/rut_nemotecnico.json`) vía
    `infoprobidad.load_rut_map`; solo consulta emisoras con nemotécnico.
  - La ficha cambia de `tipoentidad` según el emisor (`RVEMI` para
    sociedades, `BANCO` para bancos, `RVSOC` en algunos casos). El
    adaptador prueba `RVEMI → BANCO → RVSOC` y conserva la primera
    respuesta que trae la tabla; la URL usada queda en `source_url`.
  - Periodo histórico por POST (`mm`, `aa`) al mismo `entidad.php`.
  - `--dry-run`, `--rut`, `--periodo YYYY-MM`, `--limit` y `--html local`.
- `scrapers/stages/cmf_accionistas.py` (nuevo): etapa opcional
  autodescubierta por `scrapers/stages/__init__.py`. Ante `CmfBlocked`
  devuelve `status=blocked` y termina sin error; un error puntual de una
  emisora se acumula en `errores` sin cortar las demás.
- `supabase/migrations/033_mayores_accionistas.sql` (nuevo): tabla
  `public.cl_top_shareholders` (`rut_emisor`, `nemo`, `razon_social`,
  `periodo`, `ranking`, `accionista`, `porcentaje_propiedad`,
  `acciones_suscritas`, `acciones_pagadas`, `fuente`, `source_url`).
  - Clave única `(rut_emisor, periodo, accionista)`;
    `periodo` con check `YYYY-MM` y mes 03/06/09/12; `%` entre 0 y 100;
    `ranking` 1–12.
  - Idempotente: `create table/index if not exists`, policy con
    `drop policy if exists` + `create policy`, `grant select` a
    `anon, authenticated`, RLS activo, sin policies de escritura.
  - **No ejecutada** contra Supabase real.
- `scrapers/tests/test_cmf_accionistas.py` (nuevo): 17 tests sin red
  (parser, dedupe, RUT/URL, periodo, fallback de tipo de entidad,
  `--dry-run`, POST histórico, upsert con cliente/DB falsos, descubrimiento
  de la etapa, `CmfBlocked` y chequeo idempotente de la 033 por texto).

## Verificación

```powershell
# Python (usar uv si no hay python en el PATH)
uv run --no-project --with pytest --with-requirements scrapers/requirements.txt `
  python -m py_compile scrapers/cmf_accionistas.py scrapers/stages/cmf_accionistas.py scrapers/tests/test_cmf_accionistas.py
uv run --no-project --with pytest --with-requirements scrapers/requirements.txt `
  python -m pytest scrapers/tests/test_cmf_accionistas.py -q      # 17 passed
uv run --no-project --with pytest --with-requirements scrapers/requirements.txt `
  python -m pytest scrapers/tests -q                             # 199 passed, 1 skipped
uv run --no-project --with pytest --with-requirements scrapers/requirements.txt `
  python scrapers/run_all.py --list                              # muestra cmf_accionistas

# Dry-run real (no escribe nada; ~15 s, 1 req/s a la CMF)
$env:PYTHONIOENCODING="utf-8"
uv run --no-project --with pytest --with-requirements scrapers/requirements.txt `
  python scrapers/run_all.py --only cmf_accionistas --dry-run
# verificado: 9 emisores, 7 con tabla (84 accionistas), 2 sin datos, status ok

# Next (no se tocó TS, igual corren limpios)
npm run lint ; npm run typecheck ; npm test   # eslint ok, tsc ok, 479 passed
```

`PYTHONIOENCODING=utf-8` solo hace falta en esta consola para que el
resumen de `run_all.py` imprima los iconos; no es un bug de la etapa.

## Variables de entorno nuevas

Ninguna. La etapa usa `cmf_client` (sin credenciales) y el mapa local de
F15. No se tocó `.env.example` (lo une F57).

## Deudas y notas

- El mapa de F15 trae **9 emisoras con nemotécnico** (LTM, CHILE, VAPORES,
  ENELGXCH, ENELAM, BSANTANDER, CMPC, SQM-B, CENCOSUD), no el IPSA
  completo. Ampliar el mapa (F15) suma emisoras sin cambiar la etapa.
- **Bancos**: para Banco de Chile (97004000) y Banco Santander-Chile
  (97036000) la CMF responde con `tipoentidad=BANCO` pero la pestaña 5
  viene "Sin datos para este periodo" / "No hay información para
  desplegar" en todos los periodos probados. La etapa los cuenta como
  `empty`; no se inventa data. Queda como deuda investigar si la CMF
  publica sus 12 mayores en otra ruta.
- Persona natural: desde F33-B se guarda como `Persona natural (#ranking)`,
  sin nombre ni RUT (ver sección F33-B); no se cruza con InfoProbidad ni
  otras bases (Leyes 19.628 y 21.719).
- `updated_at` de la tabla queda con `default now()` y no tiene trigger de
  actualización; el upsert con `ignore_duplicates` no pisa filas
  existentes, así que no se usó. Se puede agregar trigger en otra
  migración si se necesita.
- `RVSOC` se prueba como tercer tipo de entidad por robustez; en la
  muestra actual no aporta filas que `RVEMI`/`BANCO` no den.
- No se corrió nada contra Supabase real ni se ejecutó la 033.

## Legal

Datos públicos y oficiales de la CMF. Dato informativo: no ejecuta ni
enruta órdenes y no es recomendación personalizada (Ley Fintec). Sin
cruce de personas naturales con otras fuentes (Leyes 19.628 y 21.719).

## F33-B — Ocultar personas naturales (rama `v2/f33b-anonimizar-personas`)

Decisión de producto (Manu): las personas **jurídicas** se muestran con su
nombre; las personas **naturales** no guardan nombre ni RUT, solo su
porcentaje y acciones, como `Persona natural (#ranking)`. Ante la duda se
oculta (falla cerrado).

### Qué se hizo

- `scrapers/cmf_accionistas.py`
  - `es_persona_natural(nombre, rut=None)`: con RUT manda el umbral
    (`< 50.000.000` natural, `>= 50.000.000` jurídica). El RUT se usa solo
    para clasificar: nunca se guarda ni se loguea. Sin RUT se buscan
    marcadores societarios normalizados (sin tildes ni mayúsculas): S.A.,
    SpA, Ltda, Limitada, S.A.C., Inversiones, Sociedad, Fondo, AFP, Banco,
    Corredores, Administradora, Holding, Trust, Inc, LLC, Ltd, Fund,
    Custodia, Compañía, E.I.R.L., Fundación, Corporación, Agencia. Si no
    hay marcador, es persona natural.
  - `separar_rut()`: si la ficha trae el RUT pegado al nombre
    (`PEREZ JUAN 12.345.678-5`), se separa y se descarta antes de
    clasificar (tampoco queda en la fila).
  - En el parser, la persona natural se reemplaza por
    `Persona natural (#ranking)`; se conservan porcentaje, acciones y
    ranking. El ranking va en el texto porque la clave única es
    `(rut_emisor, periodo, accionista)`. La fila lleva
    `es_persona_natural` y el upsert la persiste.
- `supabase/migrations/045_accionistas_anonimizar.sql` (nuevo):
  - `alter table ... add column if not exists es_persona_natural boolean not null default false`.
  - Anonimiza las filas históricas sin marcador societario con el mismo
    criterio (`~*`) y marca `es_persona_natural = true`; las jurídicas
    quedan en `false`.
  - Idempotente, sin `delete`/`truncate`/`drop`. Comentario de rollback:
    los nombres/RUT originales **no se pueden recuperar** (intencional).
- `supabase/migrations/README.md`: fila 18 de la tabla y sección 045.
- Tests: 21 en `scrapers/tests/test_cmf_accionistas.py` (persona natural
  sin RUT, con RUT inline, jurídica por nombre y por RUT, RUT ausente del
  dict y del payload, migración 045 por texto).

### Verificación

```powershell
cd scrapers
uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_cmf_accionistas.py  # 21 passed
uv run --with pytest --with-requirements requirements.txt pytest -q                              # ver total abajo
cd ..
npm run lint ; npm run typecheck ; npm test
```

### Pendiente / notas

- La migración 045 **no se ejecutó** contra Supabase real (solo SQL local).
- El parser real de la CMF trae 4 celdas sin RUT de accionista; el soporte
  de RUT (umbral y RUT inline) queda listo para fuentes que sí lo traigan.
- Filas como "ILUSTRE MUNICIPALIDAD DE CASABLANCA" no son personas
  naturales, pero al no tener marcador societario se anonimizan (falla
  cerrado). Si se quiere distinguirlas, agregar el marcador a la lista.
- El `on_conflict` con `ignore_duplicates` no pisa filas ya guardadas: las
  personas naturales históricas solo se limpian al aplicar la 045.
