# F32 — Hechos esenciales CMF con clasificación

Rama: `v2/f32-cmf-hechos-esenciales` (worktree `C:\reclu-work\f13`, desde
`mejoras/integracion` post-Fase 0). Sin push. Sin Supabase real (dry-run
solamente).

## Qué se hizo

1. **`scrapers/cmf_hechos.py`** (NUEVO): adaptador CMF de hechos esenciales.
   - Fuente usada: `https://www.cmfchile.cl/institucional/hechos/hechos_portada.php`
     — portada pública "Hechos Esenciales recibidos en los últimos 7 días",
     SIN captcha (verificada en vivo 2026-10-19: 71 hechos de 5 días).
   - Por qué no el buscador oficial `hechos2.php`: exige captcha validado del
     lado servidor (probado en vivo: texto falso → 302 de vuelta). La portada
     trae las mismas 4 columnas: Fecha-Hora, Nº Documento (link al PDF),
     Entidad y Materia. Correr 1 vez al día alcanza para no perder hechos
     (ventana de 7 días).
   - `classify(materia)`: función PURA por palabras clave, sin red ni IA.
     Categorías: `opa`, `aumento_capital`, `dividendo`, `cambio_control`,
     `compra_venta_acciones`, `colocacion`, `fusion`, `junta_accionistas`,
     `otro`. Normaliza tildes/mayúsculas antes de matchear.
   - `parse_hechos(html)` + `dedupe_hechos` (clave: nº de documento CMF, no se
     repite). El link `ver_sgd.php?s567=...` es permanente y sin sesión
     (s567 = base64 triple del nº de documento); verificado en vivo.
   - Alertas `mention`: solo para categorías RELEVANTES (opa,
     aumento_capital, dividendo, cambio_control, compra_venta_acciones) y
     solo para hechos NUEVOS (los que no estaban en `cl_material_events`
     antes del upsert). `payload.source_url` apunta al documento CMF.
     `summary: None` → la IA (OpenRouter, edge detect-changes) lo completa
     después; la IA NO participa en la clasificación.
   - `rut_map_from_dividendos` + `match_rut`: helpers opcionales para
     enriquecer el RUT del emisor desde `cl_dividends` (F31); vacío si no
     hay match. No se usan en la etapa (deuda, ver abajo).
2. **`scrapers/stages/cmf_hechos.py`** (NUEVO): etapa opcional (no crítica).
   Igual patrón que `cmf_dividendos`: ante `CmfBlocked` registra un
   `scraper_error` (is_published=false) en el portafolio `hechos-esenciales-cl`
   y sigue sin tumbar la corrida.
3. **`supabase/migrations/032_hechos_esenciales.sql`** (NUEVO): tabla
   `public.cl_material_events` (id, fecha, numero_documento, emisor,
   rut_emisor, materia, categoria con CHECK, titulo, url, created_at).
   Unique por `numero_documento`. Índices por fecha desc y (emisor, fecha).
   RLS on + policy pública de SELECT + grant a anon/authenticated. Upsert del
   portafolio `hechos-esenciales-cl` con `on conflict (slug) do update`.
   **Idempotente**: create table/index if not exists, drop policy if exists +
   create, on conflict do update.
4. **`scrapers/tests/test_cmf_hechos.py`** (NUEVO): 23 tests, sin red ni
   Supabase. Cubren classify (pura, tildes, relevancia), parser con fixture
   real en vivo (`fixtures/cmf/hechos_portada_2026.html`, 71 hechos), dedupe,
   RUT opcional, alertas mention (source_url, severity), adaptador dry-run /
   upsert / blocked, etapa (scraper_error, dry-run) e idempotencia de la
   migración por lectura del SQL.
5. **`scrapers/tests/fixtures/cmf/hechos_portada_2026.html`** (NUEVO): captura
   real de la portada CMF del 2026-10-19 (31 KB, 71 hechos).

## Variables nuevas

Ninguna. La etapa no necesita env vars propios (usa `cmf_client.py` de F31,
que a su vez usa las credenciales Supabase estándar del scraper). No se tocó
`.env.example` (lo une F57).

## Cómo probar

```bash
# 1. Compilación
python -m py_compile scrapers/cmf_hechos.py scrapers/stages/cmf_hechos.py

# 2. Tests de la etapa (23, en verde)
cd scrapers && uv run --no-project --with pytest --with-requirements requirements.txt \
    python -m pytest tests/test_cmf_hechos.py -q

# 3. La etapa aparece en el orquestador
python scrapers/run_all.py --list | grep cmf_hechos
#   cmf_hechos  opcional  Hechos esenciales CMF (OPA, capital, dividendos, control)

# 4. Dry-run en vivo (no escribe NADA en Supabase; verificado: 71 hechos,
#    13 alertables, exit 0)
cd scrapers && uv run --no-project --with-requirements requirements.txt \
    python run_all.py --only cmf_hechos --dry-run

# 5. Parsear el fixture sin red
python scrapers/cmf_hechos.py --html scrapers/tests/fixtures/cmf/hechos_portada_2026.html

# 6. Migración: idempotente por diseño (if not exists / drop policy if
#    exists / on conflict do update). NO ejecutar contra Supabase real:
#    la corre el usuario desde el SQL Editor cuando toque.
```

Verificación completa ejecutada: `npm run lint` OK, `npm run typecheck` OK,
`npm test` 437/437 OK, `python -m pytest scrapers/tests/test_cmf_hechos.py`
23/23 OK, `python -m py_compile` OK, `python scrapers/run_all.py --list`
muestra cmf_hechos, `--only cmf_hechos --dry-run` OK en vivo sin escribir.

## Deudas / pendiente

- **Enriquecer RUT**: `rut_map_from_dividendos`/`match_rut` están listos y
  testeables pero la etapa no los llama aún (la portada no trae RUT). Falta
  decidir si leer `cl_dividends` en `_run_write` (join por razón social) o
  dejar `rut_emisor` vacío hasta que otra fuente lo llene. La columna ya
  existe en la migración (`rut_emisor text not null default ''`).
- **Título del hecho**: el PDF de la CMF es imagen escaneada (sin capa de
  texto, verificado con pypdf), así que `titulo` = "{emisor}: {materia}".
  Si a futuro se quiere el título completo, habría que OCR o leer el
  detalle `hechos2.php` con captcha resuelto.
- **Captcha del buscador**: si algún día se necesita histórico >7 días, hay
  que resolver el captcha de `hechos2.php` (la imagen es un PNG 132x46
  legible por visión/OCR, probado manualmente). Por ahora la portada diaria
  basta para el objetivo de alertas.
- **Vincular con portafolios seguidos**: las alertas van al portafolio
  `hechos-esenciales-cl`. El cruce fino "emisores que siguen los usuarios"
  (match emisor ↔ holdings, ej. vía RUT o nemotécnico) queda para la etapa
  de digest/alertas del pipeline; hoy el flujo es el mismo de las demás
  etapas de eventos (trump_dice, insiders).
- Los archivos de registro (README de migraciones, sources.md, sitemap) los
  une F57; no se tocaron.

## Commits

- `8a39df6` feat: cmf_hechos parser and classifier for material events
- `40910bb` feat: cmf_hechos stage, migration 032 and tests
- `0e5ea45` chore: untrack pycache artifact (luego revertido)
- `5777aca` chore: restore pre-existing pycache tracking (árbol queda igual
  que la base: el .pyc ya estaba trackado antes de F32)
