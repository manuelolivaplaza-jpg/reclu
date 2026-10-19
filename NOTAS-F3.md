# NOTAS-F3 — Datos que se actualizan solos (rama `mejoras/f3-datos`)

> Notas redactadas por el orquestador a partir de los commits de Hermes: la sesión de Hermes se cortó dos veces por falta de respuesta del proveedor (NVIDIA NIM) antes de escribirlas. El código lo escribió Hermes; revisión del orquestador: lint, test, build y typecheck OK.

## Qué se hizo
- **Cron de Vercel arreglado** (`src/app/api/run-pipeline/route.ts`, `vercel.json`): el GET con `Authorization: Bearer ${CRON_SECRET}` (formato de Vercel Cron) ahora ejecuta el pipeline real (edge functions `detect-changes` + `send-alerts`). `CRON_SECRET` es obligatorio: sin él responde 503 y no corre nada; con secreto incorrecto, 401. Comparación en tiempo constante. POST con la misma protección.
- **Orquestador de scrapers por etapas** (`scrapers/run_all.py`, `scrapers/base.py`): etapas House, Senado, Renta 4, BTG, InfoProbidad, 13F, ETFs, precios y rendimientos; opciones `--only`, `--skip` y `--dry-run` (no escribe en Supabase). Etapas críticas (House, Renta 4, BTG): solo si fallan sale con error; el resto se reporta sin tumbar la corrida. Capitol Trades fuera del default (obsoleto) y Trump quitado de House.
- **Senado de EE.UU.** (`scrapers/senate_disclosure.py`, nuevo): flujo de aceptación del aviso de efdsearch, búsqueda de PTR, parseo de reportes electrónicos (los PDF escaneados se omiten y se registran). Senadores en `scrapers/politicians.py`.
- **InfoProbidad** reescrito con la fuente pública SPARQL (`scrapers/infoprobidad.py`).
- **Más fondos y ETFs:** 4 fondos 13F nuevos (`sec13f.py`, `load_13f.py`) y fuentes de ETFs iShares y VanEck además de ARK y Global X (`etfs.py`).
- **Migración** `supabase/migrations/010_nuevas_fuentes.sql`: alta idempotente de los portafolios nuevos (senadores, fondos, ETFs).
- **Workflow diario** `.github/workflows/scrapers.yml`: lunes a viernes 11:00 UTC + `workflow_dispatch` (con opción dry run), Python 3.12, sube log como artifact y, si `APP_URL` está configurado, llama a `/api/run-pipeline` con `CRON_SECRET`. (Corregido: no usa `secrets.*` dentro de `if:`.)
- **Pruebas de parseo offline** en `scrapers/tests/test_parsers_f3.py`; `docs/sources.md` actualizado con el estado real de cada fuente.

## Pendiente / no verificado
- Los parsers (Senado, InfoProbidad, ETFs nuevos) se probaron solo con datos de ejemplo/offline; falta una corrida real con `--dry-run` contra las fuentes.
- No se ejecutó ningún scraper contra la base real (por regla).
- El `APP_URL` de ejemplo en el workflow apunta a `https://reclu.cl`, que hoy es otro proyecto: usar la URL real de la app.

## Qué debe hacer Manu
1. Aplicar `supabase/migrations/010_nuevas_fuentes.sql` en Supabase (en orden, ver `supabase/migrations/README.md`).
2. En Vercel: variable `CRON_SECRET` (un valor largo y aleatorio).
3. En GitHub → Settings → Secrets and variables → Actions: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (el mismo de Vercel) y `APP_URL` (URL pública de la app; si se omite, el workflow no llama al pipeline).
4. Probar primero con `python scrapers/run_all.py --dry-run` (o el botón "Run workflow" con dry run) antes de dejar el cron activo.
