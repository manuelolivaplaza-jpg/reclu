# NOTAS-XSEC — Revisión de seguridad (XSEC)

**Fecha:** 2026-10-20 · **Rama:** `v2/xsec-revision-seguridad` (desde `mejoras/integracion`)
**Alcance:** SOLO LECTURA. No se cambió código de producto, no se aplicó ninguna migración, no se tocó Supabase real, no se levantó servidor.

## Qué se hizo

1. Leí `NOTAS-XSEC.md` (no existía) y `git log -5` → no había avance previo en esta rama.
2. Revisé **todas** las migraciones `supabase/migrations/0[2-4]*.sql` presentes en la rama (020, 021, 022, 024, 025, 027–033, 036, 037, 042, 043 + `043_down`, 044, 045) y, por contexto, las de base (002–019) que sostienen el muro de pago.
3. Revisé las 10 rutas de `src/app/api/**/route.ts` y las 4 server actions de `src/app/actions/`.
4. Revisé el paywall en `/compare`, `/portfolio/[slug]`, `/accion/[symbol]`, `/herramientas/backtest`, `/embed/widget/*`, `/explore`, `/ranking`, `/alerts`, `/dashboard` y las lib `queries.ts`, `ticker-queries.ts`, `access.ts`, `backtest-window.ts`, `public-disclosure.ts`.
5. Verifiqué `npm run typecheck` y `npm run lint` → **pasan** (no hay cambios de código, era control de línea base).

**Entregable:** `docs/revision-seguridad-2026-10-20.md` (tabla por archivo con hallazgo, severidad y arreglo propuesto en 1-2 líneas). Un solo commit.

## Resumen de hallazgos

- **1 alta**: `/compare` (`src/app/(dashboard)/compare/page.tsx:20-31`) manda al navegador el libro **completo** de holdings de todo el catálogo (incluidos premium) a cualquier usuario con cuenta, porque `getAllHoldingsAdmin` (service role) se serializa hacia componentes `"use client"`.
- **10 medias**: `043_ocultar_demos_down.sql` anula el `up` si se aplican en orden (M1) · `cl_top_shareholders` (033) público con nombres de personas naturales, la 045 solo anonimiza filas históricas y sin trigger (M2, M3) · `telegram/webhook` compara el secreto con `!==` (M4) · token de baja en query string sin expirar (M5) · series/métricas/alertas públicas en la base → el recorte del backtest y el muro de alertas/AI son evadibles por REST (M6, M7) · `explain-alert` explica contenido del cliente con la marca de la plataforma (M8) · `signUp` filtra el error crudo de Supabase → enumeración de cuentas (M9) · `prepareTelegramLink` escribe una columna que el trigger de 007 revierte (M10).
- **11 bajas**: `revoke` de escritura ausente en las tablas públicas nuevas (027–034, 042, 021) · errores internos de Supabase devueltos al cliente · `GET /api/run-pipeline` relanza el pipeline · Polymarket publica wallets · cuota anon anclada a `x-forwarded-for` · cookie `ref` sin sanear · sin CSRF explícito en APIs con cookie (mitigado por SameSite) · `NEXT_PUBLIC_SITE_URL` ausente → webhook a localhost · `sponsorships` sin consumidor aún · criterio de la 045 es unidireccional · `rawBody` del proveedor persistido.

## Lo que se verificó correcto (no re-revisar)

- `run-pipeline` y `publish/draft`: `timingSafeEqual` + 503 sin secreto + 401. Solo `telegram/webhook` se sale del patrón.
- Toda función `security definer` (007/008/012/015/019/037) con `set search_path = ''` y objetos calificados con `public.`.
- RPC sensibles con `revoke execute` para `anon`/`authenticated` (`check_chat_quota`, `check_anon_chat_quota`, `link_telegram_chat`, `unsubscribe_by_token`).
- Muro de holdings (012) bien aplicado en la base: `holdings` y `portfolio_snapshots` sin lectura pública, funciones que recortan por `auth.uid()`. Es el patrón a replicar en M6/M7.
- Zod en todas las entradas de servidor; `auth.getUser()` antes de cada escritura; ningún secreto sale del servidor; CSP/HSTS/nosniff/Referrer-Policy presentes.

## Pendiente (para el orquestador)

1. **Decidir y aplicar** los arreglos del §8 del informe (empezando por A1, M1 y M6/M7).
2. **Integrar 026 y 034** a la línea de migraciones de la rama base o dejar constancia de que se aplican aparte (hoy no existen en esta rama; 023, 035, 038–041 no existen en ninguna rama).
3. **Verificar contra la base real** (no se hizo por instrucción): que 012/015/019 estén aplicadas; que no queden filas con `accionista` persona natural; los `default privileges` del schema `public` en Supabase.
4. **Nota funcional encontrada de paso**: `protect_profile_columns` (007) revierte `trial_ends_at`, por lo que la prueba de Pro de 7 días de la 008 probablemente nunca se aplica. No es de seguridad, pero conviene revisarlo.

## Cómo probar (cuando el orquestador aplique arreglos)

- **A1**: iniciar sesión con una cuenta **free** en `/compare`, abrir DevTools → Network → documento → Response: la respuesta RSC debe traer solo el cruce agregado, no `holdings` de cada portafolio. Repetir en `/explore` y `/accion/<símbolo>` (deben seguir igual).
- **M6/M7**: con la anon key pública, `curl "https://<ref>.supabase.co/rest/v1/portfolio_performance?portfolio_id=eq.<uuid>"` debe dar 401/403 o lista vacía para no pagados; igual para `portfolio_metrics` y para `alerts` con `summary`.
- **M4**: `npm test` (los tests de `timingSafeEqual` ya existen) + un test nuevo para el webhook de Telegram.
- **M1**: aplicar las migraciones en un proyecto Supabase de pruebas y comprobar que `elon-doge-tracker`, `trump-truth-signals`, `afp-consenso-chile` e `inverse-cramer` quedan con `is_active = false` y `replaced_by_slug` poblado.
- **M9**: `signUp` con un correo ya registrado debe devolver un mensaje genérico (no "User already registered").
- **M10**: `prepareTelegramLink` debe dejar un código persistido en `profiles.telegram_link_code` y el `/start` del bot debe vincular.
- **General**: `npm run lint && npm test && npm run typecheck` antes de integrar.
