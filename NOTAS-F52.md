# F52 — Widgets para medios y página /medios

## Qué se hizo

Sesión anterior (commit `c152a45`, cortada por rate limit) dejó el widget
`/embed/widget/[tipo]/page.tsx` completo. Esta sesión retomó desde ahí sin
rehacer:

1. **`src/lib/widgets.ts` (nuevo)** — catálogo y helpers compartidos: los
   `WIDGET_TIPOS` (`consenso-corredoras`, `afp`, `insiders`, `ranking`),
   `WIDGET_META` (label/title/description/height), `isWidgetTipo`,
   `widgetIframeCode` (código de iframe listo para pegar, con atribución
   "Datos de reclu.cl" en el `title`), `CONSENSO_SEMILLA` + `CONSENSO_AS_OF`
   (fallback sin Supabase, migración 024) y `formatShortDate`.
   Se movieron fuera del page porque Next valida las exportaciones de un
   `page.tsx` en build y solo admite `default`/`metadata`/`instant` etc.;
   además `/medios` y los tests importan este catálogo.
2. **`src/app/embed/widget/[tipo]/page.tsx`** — los cuatro widgets: consenso
   de corredoras (BICE+MBI, con semilla pública si no hay Supabase), AFP
   (Cuadro 14 de AFP Modelo o consenso), últimas compras de insiders
   (Form 4, código P) y ranking honesto (vs benchmark de cada país, incluye
   los que pierden). Marco tipográfico blanco/negro con filetes de 1px,
   footer con descargo por tipo + link "Datos de reclu.cl". `await
   connection()` + `export const instant = false` (peculiaridad Next 16),
   `robots: { index: false }`, 404 para tipos inválidos. Sin datos de
   InfoProbidad: insiders y ranking usan cliente anónimo sin checks de plan
   (5 U.S.C. § 13107).
3. **`src/app/medios/page.tsx` (nuevo)** — catálogo público con el código de
   iframe de cada widget, botón "Copiar" y vista previa en vivo, más las
   condiciones de uso: atribución obligatoria "Datos de reclu.cl" (ya va
   dentro del iframe), gratuidad de datos de funcionarios de EE.UU. (5
   U.S.C. § 13107), sin recomendaciones (Ley 21.521), mínimo de datos
   personales (Leyes 19.628 y 21.719) y no alterar el iframe. Incluye
   `LegalNotice kind="fintec"` (F16).
4. **`src/components/widget-embed-code.tsx` (nuevo)** — client component
   del bloque de código con copiar al portapapeles (fail-soft si no hay
   Clipboard API) y preview en vivo.
5. **`tests/widgets.test.ts` (nuevo)** — 24 tests: catálogo completo,
   `isWidgetTipo`, código de iframe (URL/altura/atribución/normalización
   de la base), semilla del consenso (orden y suma ≤ 100),
   `formatShortDate`, guard de exportaciones del page (solo
   `default`/`generateMetadata`/`instant`), `connection()` + `instant`,
   no-indexeable, atribución presente, sin imports de InfoProbidad, /medios
   con condiciones y LegalNotice, y CSP (`frame-ancestors 'none'` global +
   `frame-ancestors *` solo para `/embed/:path*`).

`next.config.ts` NO se tocó: el header de F5 para `/embed/:path*` ya cubre
`/embed/widget/*` (era el único choque posible declarado).

## Variables nuevas

Ninguna. `/medios` usa `NEXT_PUBLIC_SITE_URL` vía `siteUrl()` (ya existente).
No se tocó `.env.example` (lo une F57).

## Verificación

- `npm run typecheck` — verde.
- `npm run lint` — verde (se cambió el `<a target="_top">` del footer del
  widget a `<Link>` por `no-html-link-for-pages`).
- `npm test` — 41 archivos, 461 tests pasando (incluye los 24 nuevos).
- `npx next build` — lo corre el orquestador (no ejecutado aquí por
  instrucción). El riesgo clásico de build (exportaciones inválidas en
  `page.tsx`) está neutralizado: los helpers viven en `src/lib/widgets.ts` y
  hay un test que lo vigila.

## Cómo probar

1. `npm run dev` y abrir `http://localhost:3000/medios`: los 4 widgets con
   código copiable + vista previa en vivo + condiciones de uso.
2. Directo: `/embed/widget/consenso-corredoras`, `/afp`, `/insiders`,
   `/ranking`. Un tipo inválido (`/embed/widget/foo`) debe dar 404.
3. CSP: `curl -sI localhost:3000/medios | grep frame-ancestors` →
   `'none'`; `curl -sI localhost:3000/embed/widget/afp | grep
   frame-ancestors` → `*`. Solo /embed es embebible.
4. Sin Supabase configurado el consenso muestra la semilla pública (corte
   05-10-2026) y AFP/insiders muestran "Sin datos disponibles." (fail-soft,
   sin inventar).

## Deudas

- El widget AFP requiere que exista `afp-modelo-acciones-cl` o
   `afp-consenso-chile` (migración 020) y el consenso requiere
   `consenso-corredoras-cl` (migración 024); sin datos muestra estado
   vacío honesto.
- `/medios` no está en el sitemap ni hay link desde el header/footer:
   `sitemap.ts` lo une F57 y la tarea listaba "solo esto". Agregar el link
   queda para integración.
- La vista previa en /medios apunta a `siteUrl()`; en local la base es
   `http://localhost:3000` (el iframe del preview es same-origin, sin
   problema).
- El commit wip `c152a45` arrastró datos de F23
   (`scrapers/data/v2/F23/*`) que no son parte de esta tarea; se dejaron
   para no reescribir historia. Si molestan en el merge, el orquestador
   puede revertirlos.
- Los alturas de iframe son fijas (380–400px); un alto responsive
   quedaría para otra iteración.
