# NOTAS-F55 — Marca blanca para socios (co-branding de widgets)

Rama: `v2/f55-marca-blanca` (worktree `C:\reclu-work\f23`)
Base: `mejoras/integracion` con F2, F4, F8–F15 y F52 ya fusionadas.
Sin push. Sin migraciones ejecutadas contra Supabase real.

## Qué se hizo

### 1. `supabase/migrations/041_socios.sql` (nuevo)

Tabla `public.partners` con las columnas pedidas y una más (el acento):

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | `uuid_generate_v4()` |
| `slug` | text UNIQUE | `^[a-z0-9]+(-[a-z0-9]+)*$` — es el path `/p/[socio]/…` |
| `nombre` | text NOT NULL | nombre comercial de la empresa |
| `logo_url` | text | opcional, solo `https://` |
| `accent` | text NOT NULL | hex `#rrggbb`, default `#0a0a0a` |
| `portafolios` | text[] NOT NULL | slugs de portafolios públicos que el socio puede mostrar |
| `activo` | boolean NOT NULL | `false` = el socio no se sirve (404) |
| `created_at` | timestamptz | |

- **RLS activo**. Política `partners public read active` (solo `activo = true`).
  Escritura: service role (no hay policies de insert/update/delete).
- `grant select` a `anon` y `authenticated`.
- Índice parcial `idx_partners_activo` sobre socios activos.
- Seed de ejemplo (`slug = 'demo'`) con `on conflict (slug) do nothing`.

**Idempotencia** (revisada leyendo el SQL, sin ejecutarlo):
`create extension if not exists` · `create table if not exists` ·
`create index if not exists` · `alter table … enable row level security` ·
`drop policy if exists` + `create policy` · `grant` (idempotente) ·
`insert … on conflict (slug) do nothing`.
Dos ejecuciones seguidas no dan error.

### 2. `src/lib/partners.ts` (nuevo)

Lógica pura + acceso a datos:

- `Partner` (slug, nombre, logo_url, accent, portafolios, activo).
- `toPartner(row)`: sanea la fila cruda — descarta slug/nombre inválidos,
  acepta el logo solo si es `https://`, filtra slugs inválidos de
  `portafolios`, deduplica y **valida el acento**.
- `resolveAccent(hex)`: devuelve el acento del socio solo si (a) es hex,
  (b) no es un color reservado al rendimiento y (c) alcanza contraste
  WCAG AA (≥ 4.5:1) sobre blanco. En cualquier otro caso cae a `#0a0a0a`.
  `RESERVED_ACCENTS = ['#0f7a32', '#c81e1e']` (verde/rojo = cifras de
  rendimiento, nunca color de marca).
- `contrastRatio` / `relativeLuminance`: fórmula WCAG estándar.
- `isValidPartnerSlug`, `normalizePartnerSlug`.
- `partnerAllowsPortfolio`, `filterAllowedPortfolios`: el alcance del socio.
- `getPartnerBySlug(slug)`: lee `partners` con RLS (solo activos).
  Sin Supabase configurado sirve el socio de ejemplo (`DEMO_PARTNERS`),
  igual que el resto del sitio en modo demo.
- `PARTNER_WIDGET_TIPOS = ['portafolios', 'ranking']` y
  `PARTNER_WIDGET_META`: el tipo `ranking` **reutiliza el catálogo de F52**
  (`WIDGET_META.ranking`) — mismo título, misma descripción.

### 3. `src/app/p/[socio]/[tipo]/page.tsx` (nuevo)

Marca blanca reutilizando los widgets de F52:

- Header con el **logo** del socio, su **nombre** en su color de acento y
  el título del widget.
- Cuerpo:
  - `portafolios`: los portafolios permitidos del socio, con su exceso de
    retorno en pp contra el benchmark de cada país.
  - `ranking`: el ranking honesto de F52 (`rankSources` +
    `getBeatTheMarketRanking`, los mismos datos y el mismo método)
    acotado a los portafolios permitidos. Incluye los que pierden.
- Footer: **“Datos de reclu.cl” siempre visible** + `LegalNotice kind="fintec"`.
- `export const instant = false` y `await connection()` (peculiaridades de
  Next 16 con `cacheComponents`).
- `robots: { index: false }`.
- 404 si el slug no existe, el socio está inactivo o el `tipo` no es válido.

### 4. `tests/partners.test.ts` (nuevo)

37 tests: slug, acento (contraste WCAG, colores reservados, fallback),
`toPartner`, alcance del socio, catálogo de widgets, socio de ejemplo,
la página (exports válidos de Next, `connection()`/`instant`, atribución,
aviso legal, sin InfoProbidad) y la migración (idempotencia, columnas, RLS).

## Verificación

```
npm run typecheck   → OK
npm run lint        → OK
npm test            → 43 archivos, 516 tests en verde (37 nuevos)
npx next build      → lo corre el orquestador
```

## Variables nuevas

Ninguna. No se agregaron variables de entorno (no se tocó `.env.example`,
que une F57).

## Cómo probar

1. **Migración (manualmente, cuando haya Supabase de verdad):**
   En el SQL Editor de Supabase, correr `supabase/migrations/041_socios.sql`.
   Volver a correrlo: no debe dar error.
2. **Crear un socio de prueba:**
   ```sql
   insert into public.partners (slug, nombre, logo_url, accent, portafolios)
   values ('mi-corredora', 'Mi Corredora', 'https://…/logo.svg', '#123456',
           array['renta4-moderada','btg-insights'])
   on conflict (slug) do nothing;
   ```
3. **Sin Supabase (modo demo):** el socio `demo` ya responde:
   - `/p/demo/portafolios`
   - `/p/demo/ranking`
4. **Con Supabase:** `/p/mi-corredora/portafolios` y `/p/mi-corredora/ranking`.
5. **Casos borde a verificar a mano:**
   - `/p/no-existe/ranking` → 404.
   - `/p/demo/desconocido` → 404.
   - socio con `activo = false` → 404.
   - socio con `accent = '#0f7a32'` → el nombre sale en negro (reservado).
   - socio con `accent = '#cccccc'` → el nombre sale en negro (sin contraste).
   - socio sin `portafolios` → “Este socio todavía no tiene portafolios publicados.”

## Deudas / pendientes

1. **CSP para iframes.** `next.config.ts` abre `frame-ancestors *` solo para
   `/embed/:path*`. La ruta `/p/*` hoy es una **página de marca blanca
   autónoma** (el socio la enlaza o la comparte), no un iframe embebible.
   Si los socios la van a embeber en su sitio, hay que añadir
   `source: "/p/:path*"` con los `embedHeaders` en `next.config.ts`.
   **No se tocó ese archivo** porque F52 y F56 ya lo modifican y la tarea
   pedía no editar archivos fuera de la lista (evitar choques de merge).
2. **Sin script de iframe para socios.** F52 expone `widgetIframeCode` en
   `/medios`; para los socios no se agregó un generador de `<iframe>` ni una
   página `/p/[socio]` índice. Queda para una fase siguiente.
3. **Logo externo sin `next/image`.** Se usa `<img>` con `eslint-disable`
   (igual que `portfolio-card.tsx`): `next.config.ts` no tiene
   `images.remotePatterns` y no se modificó para no tocarlo.
4. **Sin limpieza de `partners` huérfanos.** No hay proceso de baja; se
   resuelve con `activo = false` (404 inmediato).
5. **Legal:** la página es pública, sin sesión y sin muro, así que los datos
   de funcionarios de EE.UU. quedan gratis y fuera del muro
   (5 U.S.C. § 13107). No se consulta `@/lib/infoprobidad` ni se guardan
   datos de personas naturales (Leyes 19.628 y 21.719). El aviso legal de
   Fintec va siempre visible. **Pendiente: revisión jurídica del texto de
   marca blanca para terceros.**
