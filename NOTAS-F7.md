# NOTAS F7 — Móvil, PWA, primer uso, página por acción y portafolios nuevos

Rama: `mejoras/f7-movil-portafolios` · Migración asignada: `supabase/migrations/013_portafolios_tematicos.sql`

## Qué se hizo (por área)

### 1. PWA instalable
- `src/app/manifest.ts` — Web App Manifest (standalone, blanco/negro, es-CL, íconos 192/512 + maskable).
- `public/icons/` — íconos PNG generados (icon-192/512 + maskable-192/512): fondo negro, sparkline blanca y wordmark "reclu" (verificados visualmente).
- `src/app/apple-icon.png` — apple touch icon 180x180 (Next lo sirve automáticamente).
- `public/sw.js` — service worker mínimo: precache de `/offline` + íconos; navegaciones network-first con fallback a caché y `/offline`; assets propios cache-first; nunca cachea `/api/*`, `/auth/*` ni dominios externos (Supabase).
- `src/app/offline/page.tsx` — página offline monocroma con CTA al inicio.
- `src/components/pwa-register.tsx` — registra el SW y muestra el botón "Instalar app" (`beforeinstallprompt` en Android/Chrome; guía "Compartir → Agregar a inicio" en iOS Safari). Se oculta si ya está instalada (standalone). Botón con safe-area.
- `src/app/layout.tsx` — inserción mínima: import + `<PwaRegister />` (1 línea).
- `next.config.ts` — CSP: agregado `worker-src 'self'` (línea nueva, nada más tocado).

### 2. Página por acción `/accion/[symbol]`
- `src/lib/ticker-queries.ts` (nuevo) — lógica pura (`normalizeSymbol`, `summarizeHolders`, `filterAlertsBySymbol`, `topSymbolsByCount`) + `getTickerOverview` (Supabase real o demo rotulada `isDemo`).
- `src/app/accion/[symbol]/page.tsx` — quiénes la tienen (tabla con scroll horizontal en móvil: cartera, peso, cambio, desde cuándo, retorno), movimientos recientes (alertas), métricas de consenso (carteras / peso medio / máximo), símbolos relacionados, `generateMetadata` con título SEO ("¿Quién tiene NVDA? ..."), JSON-LD (WebPage + ItemList), `generateStaticParams` para 12 símbolos comunes, fallback demo con etiqueta "Datos de ejemplo", y estado vacío útil (no 404).
- Enlaces cruzados actualizados de `/explore?simbolo=X` a `/accion/x`:
  - `src/app/portfolio/[slug]/page.tsx` (tabla de holdings)
  - `src/components/alerts-feed.tsx` (chip de ticker)
  - `src/components/command-palette.tsx` (resultados de búsqueda)
  - `src/components/explore-rankings.tsx` (radar de consenso)
- `src/app/sitemap.ts` — 12 URLs `/accion/*` agregadas.

### 3. Primer uso guiado (E3)
- `src/components/onboarding-suggestions.tsx` (nuevo) — bloque "Primeros pasos" con los 3 portafolios más populares (por seguidores, no premium) y botón "Seguir" de un clic (reusa `FollowButton` → `/api/follow`). Se puede cerrar (estado local) y solo aparece cuando el usuario no sigue nada.
- `src/app/(dashboard)/dashboard/page.tsx` — cálculo de `onboardingSuggestions` + render (cambios localizados).

### 4. Portafolios temáticos + Radar IA
- `supabase/migrations/013_portafolios_tematicos.sql` — 3 portafolios nuevos (`thematic`), idempotente (`on conflict do nothing` por slug y por holding):
  - `defensa-aeroespacial` — 5 primes de defensa EE.UU. (LMT, RTX, NOC, GD, BA), 20% c/u. Fuente de selección documentada en el SQL.
  - `consenso-de-los-grandes` — regla: símbolos presentes en ≥3 carteras institucionales (seed documentado).
  - `radar-ia` — generado por reglas (seed inicial; el scraper lo regenera dejando `previous_weight` para alertas).
- `scrapers/radar_ia.py` (nuevo) — `build_radar` con las reglas transparentes: (1) consenso ≥3 carteras, (2) momentum = return_pct medio; score = z(consenso)+z(momentum); top 9 con pesos decrecientes normalizados a 100. Adapter `RadarIaAdapter` (patrón `SourceAdapter`: fetch desde holdings del catálogo excluyéndose a sí mismo → normalize → upsert con detección de cambios). Flag `--dry-run`. Registrado en `scrapers/run_all.py` (`--only radar_ia`).
- `src/lib/radar-rules.ts` (nuevo) — espejo TS de las reglas (misma especificación) para testear con Vitest y explicar en UI.
- Aparecen en `/explore` bajo la categoría "Temáticos / IA" ya existente (cero cambios de filtros necesarios).

### 5. UX móvil
- `src/components/portfolio-manager.tsx` — las 2 tablas densas ahora tienen scroll horizontal con `min-w` (la de "Mis activos" 420px, la de cruce 320px) y el botón eliminar pasó de ~24px a área táctil de 44px.
- Verificado existente y ya correcto (no se tocó): nav inferior del dashboard con safe-area (`(dashboard)/layout.tsx`), menú móvil full-screen del site-header, chat a pantalla completa en móvil (`fixed inset-0 h-dvh`), filtros con scroll horizontal (`alerts-feed`, `explore-filters`), tablas del detalle con `min-w` propio.

### 6. Tests
- `tests/ticker-queries.test.ts` — 12 tests: normalización, dedupe por cartera (última fila + firstSeen), orden por peso, promedios, carteras desconocidas, precio/moneda, pesos inválidos, filtro de alertas por payload/título con límite de palabra y escape de regex, top símbolos por conteo.
- `tests/radar-rules.test.ts` — 8 tests: consenso mínimo, desempate por momentum, pesos suman 100 y decrecen, vacío sin NaN, pesos 0/símbolo vacío, returnPct nulo, normalización, steps base.
- Suite completa: 51 tests pasando (29 base + 22 nuevos).

## Verificación ejecutada
- `npm run lint` — OK (0 errores).
- `npm run typecheck` — solo persiste el error pre-existente y documentado de `LayoutProps` en `src/app/layout.tsx` (tipo global generado en build; el build real pasa).
- `npm test` — 51/51 OK.
- `npm run build` — ver resultado al final de la sesión (se anota abajo).
- `uv run ... python -m py_compile` — radar_ia.py y run_all.py compilan; `build_radar` probado con datos sintéticos (NVDA > MSFT por momentum, pesos = 100).
- Ícono 512 verificado visualmente (visión): fondo negro, "reclu" legible, sparkline completa.

## Pendiente / qué debe configurar Manu
1. **Migraciones a aplicar (en orden)** en Supabase SQL Editor:
   - Las previas 001–012 si aún no están (según estado de los otros frentes).
   - `supabase/migrations/013_portafolios_tematicos.sql` (idempotente, se puede reejecutar).
2. **Variables de entorno nuevas**: ninguna. La PWA funciona sin config extra. Si quieres que el botón "Instalar app" aparezca en producción, el manifest requiere HTTPS (Vercel ya lo da).
3. **Cuentas externas**: ninguna nueva.
4. **Pasos manuales opcionales**:
   - Ejecutar `python scrapers/radar_ia.py --dry-run` para ver la selección real del radar antes de activarlo en el cron (`--only radar_ia` en `run_all.py`).
   - Los pesos/holdings semilla de 013 son editables antes de aplicar: son una selección editorial documentada; cámbialos si prefieres otros criterios.
   - El SW cachea con versión `reclu-v1`: al hacer cambios de shell en el futuro, subir el número.
   - Nota SEO: el manifest agrega `start_url: /?utm_source=pwa` — si instalas GA/Plausible, filtra ese parámetro.

## Decisiones documentadas
- `summarizeHolders` deduplica por cartera tomando la fila con `as_of` más reciente y registra `firstSeen` (primera aparición histórica) — así "desde cuándo" funciona con el esquema actual sin migraciones de más.
- La página por acción NO hace 404 para símbolos sin datos: muestra estado vacío con CTA (mejor para SEO y UX que un error).
- `filterAlertsBySymbol` matchea por `payload.symbol` exacto o título con límite de palabra; símbolos de 1 carácter solo por payload (evita falsos positivos tipo "A" en "Apple").
- El Radar IA quedó en Python (producción) + TS espejo (tests/UI). Ambos archivos se referencian entre sí: si cambias uno, cambia el otro.
- El botón instalar usa `bottom-[calc(env(safe-area-inset-bottom)*2+1.25rem)]` para no chocar con la nav inferior móvil (que ya usa el inset una vez).
- Íconos monocromos (negro + blanco) para respetar la ley de diseño `docs/hermes-diseno.md`; el favicon.svg azul pre-existente no se tocó (es de otro frente histórico).
