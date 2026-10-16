# reclu.cl — Guía del proyecto para agentes

> Plataforma web de seguimiento y alertas de portafolios de inversión. Monitorea
> carteras de políticos de EE.UU., corredoras chilenas y fondos (13F), y envía
> alertas por email con resúmenes AI cuando detecta cambios. **No ejecuta
> órdenes ni da asesoría** — solo notificaciones sobre información pública.

## Stack (fijo, no cambiar sin pedido explícito)

- **Next.js 16 App Router** + TypeScript + Tailwind v4 + React 19 — `src/`
- **Supabase** — Postgres + Auth (email y Google OAuth) + Edge Functions (Deno)
- **OpenRouter** — LLM para resúmenes de alertas y el asistente de chat
- **Resend** — emails de alertas
- **Python 3.11+** (httpx + pypdf + supabase-py) — scrapers en `scrapers/`
- **Vercel** — deploy objetivo

## Reglas del proyecto

1. **Diseño: `docs/hermes-diseno.md` es la ley.** Estética Autopilot × SpaceX:
   blanco/negro, Instrument Sans, tipografía como diseño, cero azul SaaS, cero
   sombras, filetes de 1px, botón primario = píldora negra, verde/rojo solo en
   cifras de rendimiento. No rediseñes fuera de ese documento.
2. **Next 16 NO coincide con versiones viejas.** Peculiaridades ya descubiertas:
   - `middleware.ts` se llama `proxy.ts` (renombrado por codemod oficial).
   - Con `cacheComponents: true` las rutas con cookies/searchParams usan
     `await connection()` + `export const instant = false` — prohibido
     `dynamic = "force-dynamic"`.
   - `LayoutProps` es un tipo global generado en build (tsc aislado lo marca
     como error; el build real pasa).
   - Server actions usan el patrón `useActionState` con `FormState`
     (`src/lib/form-state.ts`) — no pueden devolver valores arbitrarios.
3. **No tocar sin razón**: `src/lib/supabase/`, `src/lib/queries.ts`,
   `src/app/actions/`, `src/app/api/` (salvo tarea explícita),
   `supabase/schema.sql` + `migrations/` (idempotentes), `tests/`.
4. **Verificación obligatoria antes de dar por terminado**:
   `npm run typecheck` && `npm run lint` && `npm test` && `npx next build`.
   Los 29 tests de Vitest deben pasar.
5. **Commits**: uno por unidad lógica, mensaje convencional en inglés
   (`feat:`, `fix:`, `chore:`), pushear a `origin main`.
6. **Español** en toda la UI, copy y respuestas al usuario.
7. El usuario conecta las cuentas él mismo (Supabase, Vercel, OpenRouter,
   Resend). El código debe fallar elegante si falta un env var
   (ver `src/lib/env.ts` y los placeholders en `src/lib/supabase/*`).

## Mapa del código

```
src/
├── app/
│   ├── page.tsx                  Home (hero Autopilot, banda negra, pricing)
│   ├── (auth)/login|signup       Auth con useActionState
│   ├── (dashboard)/              layout con sidebar; requiere sesión
│   │   ├── dashboard|alerts|settings|compare
│   ├── explore/                  Catálogo público con filtros
│   ├── portfolio/[slug]/         Detalle PÚBLICO con paywall visual
│   ├── api/chat                  Asistente SSE (quota server, no da asesoría)
│   ├── api/follow                Toggle follow (límite freemium 2 portafolios)
│   ├── api/run-pipeline          Cron: detect-changes + send-alerts
│   └── terminos|privacidad|disclaimer  Legales (no reescribir su texto)
├── components/
│   ├── sections/                 Home: hero, statement, pricing, faq...
│   ├── paywall-gate.tsx          Blur + CTA para anónimos (core del producto)
│   ├── portfolio-row|card.tsx    Fila tipográfica / card con filetes
│   ├── sparkline.tsx             SVG 1.5px negro, acepta stroke
│   └── ui/button|card|input.tsx Píldora negra, radio 0, sin sombras
├── lib/
│   ├── queries.ts                Data access + fallback a demo-data si no hay Supabase
│   ├── demo-data.ts              Portafolios ilustrativos (isSupabaseLive())
│   ├── types.ts                  Portfolio, Holding, Alert, AlertType (9 tipos)
│   └── disclosure-lag.ts         Lag de disclosures congelado a 2008-2026
scrapers/                         Python. base.py = SourceAdapter (fetch→normalize→
│                                 upsert con previous_weight para detectar cambios)
├── house_disclosure.py           ✅ VERIFICADO VIVO: PTRs oficiales (Pelosi)
├── renta4.py                     ✅ VERIFICADO VIVO: PDF semanal Renta 4
├── sec13f.py, reconstruct_*.py, prices.py, performance.py, congress_api.py...
└── run_all.py                    Orquestador (--only house_disclosure ...)
supabase/
├── schema.sql + SETUP-COMPLETO.sql   Esquema + seeds (idempotente)
├── migrations/002-005            Holdings returns, snapshots, chat quota, covers
└── functions/detect-changes|send-alerts   Deno: detección+AI y emails
tests/                            5 suites Vitest (utils, types, holdings, alerts, lag)
docs/                             hermes-diseno.md (diseño), sources.md (fuentes)
```

## Modelo de negocio y accesos

- **Gratis**: 2 portafolios seguidos, alertas diarias, sin resúmenes AI.
- **Pro ($9.990 CLP/mes)**: ilimitados, tiempo real, resúmenes AI, portafolios
  premium. Cobro NO integrado aún (el plan se cambia en DB).
- **Anónimo**: explora libre, ve detalle de portafolio con holdings/gráficas
  **censurados** (blur + CTA) vía `PaywallGate`; seguir requiere cuenta.
- **Auth**: `/dashboard`, `/alerts`, `/settings`, `/compare` requieren sesión
  (proxy); `/portfolio/*` y `/explore` son públicos.

## Datos: estado real de las fuentes (no reinvestigar)

- ✅ **House Disclosure** (`disclosures-clerk.house.gov`): oficial, sin login.
  CSRF → POST ViewMemberSearchResult por apellido/año → PDFs PTR. Verificado.
- ✅ **Renta 4**: hub → artículo → PDF semanal público (~2MB). Verificado.
- ⚠️ **Capitol Trades**: login wall (dataset público vacío). NO usar como
  fuente primaria.
- 🔧 **BTG Pactual Chile**: HTML público en
  `app.btgpactual.cl/productos-de-inversion/acciones/cartera-recomendada`.
  Scraper pendiente.
- ⛔ **LarrainVial**: research tras login. No scrapeable.
- 🔧 **InfoProbidad**: dataset CSV por confirmar.

Detalles completos: `docs/sources.md`.

## Flujo de datos (cómo se actualiza solo)

```
scrapers (cron/Actions) → upsert holdings con previous_weight
  → Edge detect-changes: delta ≥0.5pp → alert (is_published=false)
  → OpenRouter genera summary → is_published=true
  → Edge send-alerts: Resend envía a followers según plan/frecuencia
Vercel Cron → POST /api/run-pipeline (Bearer CRON_SECRET) → llama ambas edges
```

## Variables de entorno

Ver `.env.example`. Claves: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (solo server), `OPENROUTER_API_KEY`,
`OPENROUTER_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`,
`CRON_SECRET`. **Nunca** commitear `.env.local`.

## Setup local

```bash
cd ~/reclu
npm run dev        # http://localhost:3000
npm test           # tests Vitest
```

Sin Supabase configurado el sitio funciona con `demo-data.ts` (modo demo) —
útil para verificar UI. Con Supabase real: correr `SETUP-COMPLETO.sql` en el
SQL Editor y poner las keys en `.env.local`.

---

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff just re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
