# NOTAS F57-A — Registros y documentación de cierre (parte 1)

Rama `v2/f57a-registros-docs` (worktree `C:\reclu-work\f9`, desde
`mejoras/integracion`). Sin push. Sin migraciones ejecutadas. Sin tocar
`.env` ni `.env.local`. Sin servidores.

## Hecho

1. **`supabase/migrations/README.md`**
   - La tabla de orden ahora tiene columnas **Depende de** e **Idempotente**.
   - Una fila por cada archivo `022`–`049` presente hoy (25 migraciones):
     `022`, `023`, `024`, `025`, `027`, `028`, `029`, `030`, `031`, `032`,
     `033`, `034`, `036`, `037`, `038`, `039`, `041`, `042`, `043`, `044`,
     `045`, `046`, `047`, `048` y `049`.
   - Se agregó también la fila `021` (existía y faltaba en la tabla) para que
     las dependencias de `024` y `044` tengan referencia.
   - Cada fila resume tablas/funciones, portafolios, dependencias reales
     (`024` → `021`; `036` → `019`; `039` → `009`; `044` → `021`;
     `045` → `033`; `046` → `045`; `047` → `008`; `048` → `011` + `012`;
     `049` → `007` + `008`) y confirma idempotencia.
   - Se reemplazó la sección obsoleta “Migraciones que vendrán de otros
     frentes” por la nota del rango `007`–`020` ya fusionado y los huecos
     `026`, `035` y `040` (no existen; no hay que crearlos).
   - No se documentaron migraciones ni variables de F53/F54.

2. **`docs/sources.md`**
   - Nuevas filas en el resumen: Schedule 13D (EFTS), Form 10-12B
     (spinoffs), XBRL frames (recompras), Polymarket, CMF dividendos,
     CMF hechos esenciales, CMF 12 mayores accionistas, CMF fondos mutuos,
     BICE/MBI, OGE 278-T funcionarios, menciones de Trump y el bridge
     CongressInvests.
   - Cada fila indica estado, portafolio, política de acceso y términos de
     uso / privacidad según los `NOTAS-*.md`.
   - SEC 13F actualizado de 25 a 29 fondos (F25: Norges, SNB, Gates, Icahn).
   - Flujo de datos y lista de etapas de `run_all.py` actualizados con las
     etapas autodescubiertas de `scrapers/stages/`.
   - Cabecera con el rango real de verificación (2026-10-18 a 2026-10-20).

3. **`.env.example`**
   - Bloque de publicación: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`,
     `X_ACCESS_SECRET`, `X_BEARER_TOKEN`, `PUBLISH_MODE="preview"`,
     `PUBLISH_X_ENABLED="false"`, `PUBLISH_TELEGRAM_ENABLED="false"`,
     `PUBLISH_NEWSLETTER_ENABLED="false"`, `TELEGRAM_CHANNEL_ID`,
     `NEWSLETTER_FROM`.
   - Bloque de administración y funciones apagadas: `ADMIN_EMAILS`,
     `COMMUNITY_ENABLED="false"`, `REFERRALS_ENABLED="false"`,
     `SPONSORS_ENABLED="false"`.
   - Extra: `NEXT_PUBLIC_SPONSORS_ENABLED="false"`. El componente
     `src/components/sponsored-slot.tsx` lee esa variable pública, no
     `SPONSORS_ENABLED`; se dejaron las dos para que la plantilla funcione y
     para cumplir la lista pedida. No se leyó ni tocó `.env` / `.env.local`.
   - Todas las claves nuevas llevan comentario de una línea.

4. **`tests/env-example.test.ts`**
   - Lee solo `.env.example`.
   - Verifica las 15 claves pedidas, que los flags
     `PUBLISH_*_ENABLED`, `COMMUNITY_ENABLED`, `REFERRALS_ENABLED` y
     `SPONSORS_ENABLED` valgan `false`, que `PUBLISH_MODE` sea `preview` y que
     las credenciales de X queden vacías.

## Verificación

```
npx vitest run --maxWorkers=1 tests/env-example.test.ts  # 4 passed
npm run lint                                             # ok
npm run typecheck                                        # ok
npm test                                                 # 59 files, 671 tests passed
```

No se corrió `next build` ni `npm run dev` (los corre el orquestador).

## Pendiente para F57 (parte 2)

- **Sitemap**: revisar `src/app/sitemap.ts` y `robots.ts` con las rutas
  nuevas (ranking, widgets, socios, comunidad si se enciende).
- **Navegación**: enlaces del header/footer a las secciones nuevas y a
  `/ranking`; consistencia con el diseño de `docs/hermes-diseno.md`.
- **Metodología**: página/secciones de metodología de las fuentes nuevas
  (13D, 10-12B, recompras, Polymarket, CMF, corredoras, OGE funcionarios).
- **Source-line**: línea de fuente por portafolio/página (URL oficial,
  fecha de corte y aviso de “información, no recomendación”).
- **Migraciones y variables de F53/F54**: todavía en curso. No se
  documentaron aquí; F57 debe agregarlas a `supabase/migrations/README.md`,
  `.env.example` y `docs/sources.md` cuando se fusionen, con el mismo
  criterio de dependencias e idempotencia.
- Revisar términos de uso pendientes: CNBC, Polymarket y BICE/MBI.

## Cómo probar

```powershell
cd C:\reclu-work\f9
npx vitest run --maxWorkers=1 tests/env-example.test.ts
npm run lint
npm run typecheck
npm test
```

Para revisar la documentación:

```powershell
git diff HEAD~2 -- supabase/migrations/README.md docs/sources.md .env.example
```

No aplicar migraciones ni ejecutar scrapers contra Supabase real.
