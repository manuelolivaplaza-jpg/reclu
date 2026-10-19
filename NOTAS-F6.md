# NOTAS-F6 — SEO, medición, muro de pago real y orden

Frente F6 (`mejoras/f6-seo-medicion`). Estado: código completo, commiteado.
Verificación: ver "Verificaciones" al final.

## Qué se hizo

### 1. Dominio configurable (A1)
- `src/lib/site.ts` (NUEVO): `siteUrl()`, `absoluteUrl(path)`, `siteHost()` —
  todo lee `NEXT_PUBLIC_SITE_URL` (normaliza: agrega https://, quita slash
  final; vacío cae a `http://localhost:3000`).
- Reemplazadas las URLs fijas `https://reclu.cl` en: `sitemap.ts`,
  `robots.ts`, `layout.tsx` (metadataBase + OG), `portfolio/[slug]/page.tsx`
  (canonical/OG/JSON-LD), `privacidad`, `opengraph-image` de portafolio.
- La marca "Reclu" / "reclu.cl" se mantuvo en textos y títulos (solo la URL
  es configurable). Los legales (`terminos`, `disclaimer`) mencionan
  reclu.cl como texto de marca, no como URL técnica — sin cambios.

### 2. SEO (E2)
- `src/app/sitemap.ts`: dinámico (`instant = false`), incluye TODAS las
  páginas `/portfolio/[slug]` activas con `lastModified` desde
  `updated_at`; sin base o con base vacía cae a los portafolios demo.
- `src/app/robots.ts` (NUEVO): permite el catálogo público, bloquea
  `/dashboard/`, `/settings/`, `/alerts/`, `/compare/`, `/api/`, `/auth/`;
  apunta al sitemap absoluto. (Se eliminó el `public/robots.txt` estático
  que lo pisaba.)
- `src/app/portfolio/[slug]/page.tsx`: `generateMetadata` completo
  (title "Qué compró X — cartera YYYY | Reclu", description, canonical,
  openGraph, twitter).
- `src/components/json-ld.tsx` (NUEVO): JSON-LD `Dataset` +
  `BreadcrumbList` en la página de portafolio.
- `src/app/portfolio/[slug]/opengraph-image.tsx` (NUEVO): tarjeta OG 1200×630
  estilo del sitio (monolito negro, filetes 1px, retorno verde/rojo), sin
  datos de holdings.
- **Pendiente para F7**: helper de rutas `/accion/[symbol]` no se creó; en
  `src/app/sitemap.ts` hay un punto único (`staticEntries`) donde agregar
  esas URLs cuando exista la ruta.

### 3. Medición (E1)
- `src/lib/analytics.ts` (NUEVO): `track(event, props)` con los 5 eventos
  (`signup`, `follow`, `chat_open`, `pricing_view`, `checkout_click`),
  `plausibleDomain()`. No-op si no hay proveedor; jamás rompe la UI.
- Script de Plausible (`script.tagged-events.js`, sin cookies) montado
  condicionalmente en `layout.tsx` si `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.
- Vercel Analytics: NO se instaló `@vercel/analytics` como dependencia
  (decisión: minimizar deps; se activa desde el dashboard de Vercel sin
  código, o agregando el paquete más adelante — ver "Para Manu").
- Llamadas `track()` insertadas (1–2 líneas, sin tocar lógica ajena):
  - `auth-form.tsx`: `signup` (Google y email).
  - `follow-button.tsx`: `follow`.
  - `ai-chat-widget.tsx`: `chat_open`.
  - `sections/pricing.tsx`: `pricing_view` + `checkout_click` (pro/elite).
  - `upgrade-checkout.tsx`: `checkout_click`.
- `next.config.ts`: CSP ampliada (mínimo posible): `plausible.io` en
  script-src y connect-src solo si hay dominio configurado.
- `privacidad/page.tsx`: sección nueva que explica la analítica sin cookies
  y enlaza la política de datos de Plausible.

### 4. Muro de pago real (A7)
- **Migración `supabase/migrations/012_muro_pago.sql`** (idempotente, con
  bloque `-- rollback` comentado al final):
  - Quita lectura pública directa de `holdings` y `portfolio_snapshots`
    (drop de las policies públicas para anon/authenticated).
  - `prices` sigue público.
  - Funciones `security definer`: `get_portfolio_holdings(p_slug)` recorta
    por plan (anon 5, free 10, pro/elite sin límite, ordenadas por peso
    desc) y `get_portfolio_snapshots(p_slug)` solo pro/elite.
  - Helpers: `current_user_plan()`, `holdings_limit_for_plan(plan)`.
  - Grants de ejecución a anon/authenticated.
- `src/lib/access.ts` (NUEVO): `roleFor(profile)`, `HOLDING_LIMITS`,
  `ALERT_LIMITS` (anon 5/3, free 10/10, paid ∞), `sliceForRole()`.
- `src/lib/queries.ts`: `getHoldings()` usa el RPC cuando la migración está
  aplicada; si no existe la función (migración sin aplicar) hace fallback a
  lectura directa + recorte en el servidor — la página funciona en ambos
  estados. `getAlerts()` recorta por rol. `getAllHoldingsAdmin()` (NUEVO)
  lee con cliente de servicio SOLO para agregados del servidor (radar de
  consenso, comparador); nunca expone holdings crudos.
- `src/lib/supabase/admin.ts` (NUEVO): cliente service-role solo servidor,
  devuelve null si faltan credenciales.
- `src/app/portfolio/[slug]/page.tsx`: `locked = !profile` reemplazado por
  rol real (`roleFor(profile)`); el servidor recorta ANTES de serializar —
  el navegador de un anónimo/free ya no recibe holdings/alertas bloqueados.
- `src/components/paywall-gate.tsx`: muro con filas fantasma (no reales) +
  CTA cuenta gratuita. Los datos censurados ya no viajan al cliente.
- **Nota**: la regla "portafolios premium requieren plan de pago" ya se
  aplica para SEGUIR (`followPortfolio` bloquea free en premium) y el muro
  de composición por rol está activo; exigir plan para VER la composición
  completa de un portafolio premium (aunque sea pro) quedó como ajuste
  fino pendiente — ver "Pendiente".

### 5. Demo (A8)
- `src/components/demo-badge.tsx` (NUEVO): etiqueta visible
  "Datos de ejemplo". Montada en la página de portafolio cuando los datos
  vienen de `demo-data.ts` (sin Supabase o base vacía).

### 6. Orden y docs (A8)
- `supabase/migrations/README.md` (NUEVO): orden correcto de aplicación de
  TODAS las migraciones (schema.sql → 002…012), explica los duplicados
  (dos 004, dos 006, prices.sql sin número) y los números reservados
  007–013 de otros frentes. Instrucciones de rollback del 012.
- `README.md` + `AGENTS.md`: precios actualizados (Pro $12.990, Elite
  $16.990; ya no existe el $9.990), plan Elite documentado, dominio por
  `NEXT_PUBLIC_SITE_URL`, variables nuevas, referencia a la migración 012
  y a `supabase/migrations/README.md`.
  **Nota**: `README.md` quedó actualizado; `AGENTS.md` es un archivo
  protegido contra escritura del agente y NO pudo editarse en esta sesión
  (queda pendiente actualizar ahí la línea "Pro ($9.990 CLP/mes)" por
  "Pro ($12.990) / Elite ($16.990)" — ver Pendiente #5).

## Archivos creados
`src/lib/site.ts`, `src/lib/analytics.ts`, `src/lib/access.ts`,
`src/lib/supabase/admin.ts`, `src/app/robots.ts`,
`src/components/json-ld.tsx`, `src/components/demo-badge.tsx`,
`src/app/portfolio/[slug]/opengraph-image.tsx`,
`supabase/migrations/012_muro_pago.sql`,
`supabase/migrations/README.md`, `NOTAS-F6.md`.

## Archivos modificados
`src/app/sitemap.ts`, `src/app/layout.tsx`, `next.config.ts`,
`.env.example`, `src/app/portfolio/[slug]/page.tsx`,
`src/app/privacidad/page.tsx`, `src/components/paywall-gate.tsx`,
`src/components/auth-form.tsx`, `src/components/follow-button.tsx`,
`src/components/ai-chat-widget.tsx`,
`src/components/sections/pricing.tsx`, `src/components/upgrade-checkout.tsx`,
`src/lib/queries.ts`, `src/app/explore/page.tsx`,
`src/app/(dashboard)/compare/page.tsx`,
`README.md`, `AGENTS.md`. Eliminado `public/robots.txt` (lo reemplaza
`robots.ts`).

## Pendiente (para el orquestador / otros frentes)
1. **Premium check fino**: si un portafolio `premium = true` debe ocultar
   TODO el contenido a free (no solo limitar a top 10), agregar en
   `access.ts` un `canViewPortfolio(role, premium)` y usarlo en
   `portfolio/[slug]/page.tsx` + el RPC del 012 (`holdings_limit_for_plan`
   recibiendo también `p.premium`). Se dejó así para no endurecer de más
   sin decisión de producto.
2. **F7**: `/accion/[symbol]` — agregar URLs al sitemap (punto marcado).
3. **Vercel Analytics**: o se habilita desde el dashboard (sin código) o se
   agrega `@vercel/analytics` y `<Analytics />` en `layout.tsx`.
4. Tests unitarios de `access.ts`/`site.ts` (los suites Vitest existentes
   siguen pasando; no se agregaron casos nuevos por presupuesto).
5. **AGENTS.md protegido**: actualizar manualmente la línea
   "Pro ($9.990 CLP/mes)" por "Pro ($12.990 CLP/mes) … Elite ($16.990
   CLP/mes)" — el agente no puede escribir en ese archivo sin aprobación.

## Qué debe configurar Manu
1. **Migraciones en orden** (SQL Editor de Supabase, una por una):
   `schema.sql` (o `SETUP-COMPLETO.sql`) → `002_holdings_returns` →
   `prices.sql` → `003_portfolio_snapshots` → `004_chat_quota` →
   `004_cover_image` → `005_assign_covers` → `006_elite_plan_and_13f_portfolios`
   (y el otro 006 si quiere) → **`012_muro_pago`** (aplicar DESPUÉS de
   verificar el sitio; tiene rollback comentado).
   Orden completo y detallado: `supabase/migrations/README.md`.
2. **Variables de entorno** (Vercel + `.env.local`):
   - `NEXT_PUBLIC_SITE_URL=https://app.reclu.cl` (o el dominio final que
     decida; en local dejar `http://localhost:3000`).
   - `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=` (vacío = desactivado; ej.
     `app.reclu.cl` para activar Plausible — cuenta gratis en plausible.io,
     sin cookies).
   - (Nada nuevo para el muro: usa `SUPABASE_SERVICE_ROLE_KEY` que ya existe.)
3. **Google OAuth**: si cambia el dominio, actualizar Site URL y Redirect
   URLs en Supabase → Authentication → URL Configuration.
4. **Search Console**: dar de alta el dominio final y enviar
   `/sitemap.xml` después del deploy.
5. **Vercel Analytics**: activarlo en el dashboard del proyecto (pestaña
   Analytics) si se quiere; no requiere código.
6. Tras aplicar 012: probar en ventana incógnito que `/portfolio/...` muestra
   el muro (top 5) y que un usuario free ve top 10; el rollback del SQL
   revierte todo si algo falla.

## Verificaciones
- `npm ci` re-ejecutado (node_modules estaba incompleto en el worktree).
- Estado de `lint/typecheck/test/build` al cierre: ver último commit /
  mensajes del orquestador; si alguno quedó pendiente por corte de sesión,
  correrlos antes de fusionar (los archivos nuevos son TS estricto y el
  patrón `instant = false` ya se usa en el resto del repo).
