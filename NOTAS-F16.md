# NOTAS F16 — Descargos legales y registros

## Qué se hizo

Base común para el resto de v2, en `v2/f16-base-legal-registros`.

- `src/lib/legal.ts`: textos de Ley Fintec (`FINTEC_NOTICE`), simulación (`SIMULATION_NOTICE`), declaraciones de EE.UU. gratis según 5 U.S.C. § 13107 (`US_DISCLOSURE_NOTICE` + `US_DISCLOSURE_SOURCES`), impuestos (`TAX_NOTICE`) y la etiqueta `SPONSORED_LABEL` ("Patrocinado"). `LEGAL_PAGE_LINKS` apunta a `/disclaimer`, `/terminos` y `/privacidad` sin copiar su texto.
- `src/components/legal/legal-notice.tsx`: `<LegalNotice kind="fintec|simulation|us_disclosure|tax|sponsored" />`. 12px, filete 1px, sin iconos. El tipo `us_disclosure` enlaza la Cámara (`disclosures-clerk.house.gov`) y el Senado (`efdsearch.senate.gov`).
- `scrapers/stages/`: convención `STAGE = (id, desc, critical)` y `run(db, dry_run) -> list[dict]`. `discover_stages()` importa cada `*.py` en orden alfabético (ignora `__init__.py` y `_*.py`). `run_all.py` las inserta antes de `radar_ia`. Con la carpeta vacía, `--list` sigue mostrando las 13 etapas de siempre.
- `src/components/source-panels/index.tsx`: `SOURCE_PANELS` vacío y `<SourcePanel />`. La página del portafolio lo renderiza y cierra con `<LegalNotice kind="fintec" />`. El párrafo de rentabilidades pasadas se dejó como estaba.

## Variables nuevas

Ninguna. No se tocó `.env.example` (lo une F57).

## Deudas

- Migraciones presentes: 008, 009, 014, 015 y 016. Faltan 017–021. El orquestador autorizó seguir sin ellas.
- `src/lib/public-disclosure.ts` (F13) no está en esta rama. El descargo de EE.UU. queda en `legal.ts` para cuando F13 lo use.
- No hay `oge-trades-panel` (F13) ni panel de InfoProbidad (F15). En `source-panels/index.tsx` quedó `TODO(F13/F15): registrar panel`. No se inventaron.
- `broker-affiliate.tsx` (F2) sigue con su propio texto. No se cambió: esta tarea no lo lista.
- `npx next build` compila TypeScript (incluye estos archivos) y después falla en `/accion/[symbol]` por `Date.now()` dentro de `timeAgo` al prerenderizar `/accion/nvda`. Esa ruta no se tocó. Tiene `export const instant = false` y no llama `await connection()` antes del reloj. `npm run typecheck` pasa después de que el build genera `.next/types` (`LayoutProps`). En un `tsc` aislado, sin esa carpeta, el error conocido de `LayoutProps` en `src/app/layout.tsx` reaparece.
- En este entorno `python` no está en el PATH (alias de la Microsoft Store). Los comandos se corrieron con `uv run`.
- `--dry-run` salió 0. El Senado falló por falta de `curl_cffi` (etapa opcional). House, Renta 4 y BTG quedaron vacíos porque no está `pypdf`. `smh` avisó que falta `openpyxl`. Nada de eso escribe en Supabase. No se agregaron etapas.

## Cómo probar

```bash
npm test
npm run lint
npm run typecheck
npx next build
uv run --with pytest python -m pytest scrapers/tests/test_stages_discovery.py
uv run --with httpx --with supabase python scrapers/run_all.py --list
uv run --with httpx --with supabase python scrapers/run_all.py --dry-run
```

Resultados de esta sesión (2026-10-19): Vitest 219/219, lint limpio, typecheck limpio tras el build, pytest de scrapers 26/26 (5 nuevos de descubrimiento), `--list` con las mismas 13 etapas, `--dry-run` 12/13 y exit 0. No se abrió el navegador: la sesión no permite levantar `npm run dev`.
