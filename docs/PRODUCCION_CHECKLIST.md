# Checklist de paso a producción (D35)

Fuera de alcance por ahora: pagos (Mercado Pago), revisión legal y correos.
Marcados con **[SÍ DE MANU]** los pasos que necesitan su aprobación explícita
(escriben datos, cobran, envían o publican). El resto es preparación.

Base: rama `mejoras/integracion` (merge d35). Nada de esto se ha ejecutado.

## 0. Antes de empezar
1. Revisar y aprobar el merge de `mejoras/integracion` a `main` (incluye d22–d35). **[SÍ DE MANU]**
2. Crear el proyecto Supabase de producción (región São Paulo, `sa-east-1`). Plan: ver §6 (recomendado Pro). **[SÍ DE MANU]** (costo)

## 1. Base de datos (Supabase producción)
3. Respaldo: con plan Pro, confirmar backups diarios activos.
4. Esquema base: `supabase/schema.sql` (o `SETUP-COMPLETO.sql`) en proyecto vacío. **[SÍ DE MANU]**
5. Migraciones en orden numérico, 002 → 065 (`supabase/migrations/*.sql`, más `prices.sql`). Todas son idempotentes. **[SÍ DE MANU]**
   - Producción no es legible sin secretos: no se pudo comparar cuáles están aplicadas. Andamio debe consultar primero (solo lectura) qué objetos existen.
   - Atención a las que modifican filas existentes: 005, 043, 055, 056, 058, 060, **065** (reactiva `afp-consenso-chile`; correrla solo después de `afp_series.py --consenso-holdings`).
   - 064 solo crea la tabla `holdings_merged`.
6. Medir tamaño real tras la primera carga: `supabase/manual/d35_tamano_db.sql` (solo lectura).
7. Auth: Site URL y Redirect URLs = `https://<dominio>` y `https://<dominio>/auth/callback`; proveedores OAuth con las URLs de producción.

## 2. Variables de entorno (solo nombres; valores en Vercel → Production)
Requeridas:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (dominio final; sitemap, canonical, OG, robots, OAuth)
- `CRON_SECRET` (sin ella `/api/run-pipeline` responde 503)
- `CHECKOUT_ENABLED=false` (nuevo D35: planes visibles, checkout deshabilitado sin romper, POST → 503)

Recomendadas / opcionales:
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (IA; sin ellas responde 503 limpio), `CHAT_RATE_SALT`
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (analítica sin cookies; vacía = sin analítica)
- `ADMIN_EMAILS`
- `DEMO_FALLBACK` (no hace falta en prod: con `VERCEL_ENV=production` nunca se muestran datos de demo)
- `IMPACT_MAX_CALLS`, `NEXT_PUBLIC_PWA_INSTALL_PROMPT` (se usan en el código y no estaban en `.env.example`; agregadas)

Dejar vacías / apagadas (fuera de alcance o requieren revisión legal):
- Pagos: `PAYMENT_PROVIDER`, `PAYMENT_MODE`, `ALLOW_MOCK_PAYMENTS`, `FLOW_*`, `MP_*`
- Correo: `RESEND_API_KEY`, `EMAIL_FROM`, `NEWSLETTER_FROM`, `SEND_ALERTS_URL`
- Flags: `COMMUNITY_ENABLED`, `REFERRALS_ENABLED`, `SPONSORS_ENABLED`, `NEXT_PUBLIC_SPONSORS_ENABLED`, `NEXT_PUBLIC_AFFILIATES_ENABLED`, `API_PUBLIC_ENABLED`, `MY_PORTFOLIO_ENABLED`, `NEWS_IMPACT_ENABLED`, `PORTFOLIO_IMAGE_IMPORT_ENABLED`, `OPENROUTER_VISION_MODEL`, `INFOPROBIDAD_NOMBRES`, `PUBLISH_*`, `X_*`, `TELEGRAM_*`

GitHub Actions (Settings → Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APP_URL`.
Scrapers (opcionales): `PRICES_MAX_SYMBOLS` (default 1500), `TRADE_ALERTS_SEND_ENABLED` (dejar sin definir: no envía correos), `BENCHMARK_SYMBOLS`, `BENCHMARK_DAYS`, `PRICE_SYMBOLS`.

## 3. Deploy (Vercel)
8. Conectar el repo, rama de producción `main`, variables del §2. **[SÍ DE MANU]** (push a main)
9. Dominio y DNS (`reclu.cl` / `app.reclu.cl`), HTTPS. **[SÍ DE MANU]**
10. Build local de verificación: `npm ci && npm run build` (NODE_ENV=production) — pasa en d35.
11. Smoke test tras el deploy: `/`, `/explore`, `/ranking`, un `/portfolio/<slug>`, `/trump-dice`, `/upgrade` (debe decir que el pago no está disponible), una URL inexistente (404), `/robots.txt`, `/sitemap.xml`, `/opengraph-image`.

## 4. Carga inicial de datos (escribe en la DB) **[SÍ DE MANU]** para cada paso
12. `cd scrapers && python run_all.py --dry-run` (no escribe) y revisar el log.
13. `python run_all.py` (primera carga completa; 60–120 min).
14. `python benchmarks.py --days 730`, `python performance.py --days 730` (historia de 2 años).
15. `python afp_series.py --consenso-holdings` → luego migración 065.
16. `python resolve_tickers.py --dry-run --batch 25` → `--plan-sql d34_merge.sql` → revisar y correr el SQL a mano (modifica y archiva filas).
17. `python price_coverage.py --dry-run --probe` → revisar `price_coverage_report.csv`; copiar lo verificado de `price_coverage_manual_candidates.json` a `data/yahoo_manual_map.json` (commit); `price_coverage_skip.sql` es revisable (modifica `asset_class`).
18. SQL pendientes de aprobación de lotes anteriores: borrar `^IPSA` opcional, Pelosi + 7 miembros, trump-dice antes de 2025-08-07, estimadas de `inverse-cramer-compras` (`supabase/manual/d34_limpieza_estimadas_cramer_compras.sql`).

## 5. Programación
19. Activar el workflow `Scrapers` (diario 11:00 UTC) y correrlo una vez con `workflow_dispatch` en dry-run. Ver `docs/PIPELINE_DIARIO.md`.
20. Decidir si se deja el cron de `vercel.json` (13:00 UTC) además del llamado al final del workflow (hoy `/api/run-pipeline` corre dos veces). **[SÍ DE MANU]**
21. Edge functions `detect-changes` y `send-alerts`: desplegar; `send-alerts` no envía sin `RESEND_API_KEY` (correo fuera de alcance).

## 6. Tamaño de Supabase
Estimación (sin acceso a la DB real; confirmar con el paso 6):
| Tabla | Filas aprox. (año 1) | Tamaño con índices |
|---|---|---|
| prices | 1.500 símbolos × 365–730 días ≈ 0,55–1,1 M | 70–140 MB |
| holdings | 13F (miles de posiciones/trimestre) + ETFs y AFP diarios/mensuales ≈ 0,5–1 M | 100–200 MB |
| portfolio_performance | ~300 portafolios × 730 días ≈ 0,22 M | 25–35 MB |
| alertas, menciones, noticias, perfiles, resto | — | 20–50 MB |
| **Total** | | **≈ 215–425 MB el primer año, creciendo ~150 MB/año** |

Recomendación: **Free (500 MB) no alcanza con margen** y además pausa el proyecto por inactividad y no tiene backups diarios. Usar **Pro** (8 GB incluidos, backups diarios). Si se parte en Free: `PRICES_MAX_SYMBOLS=600`, `--days 365` y podar snapshots diarios viejos de ETFs (dejar el último por mes) con un SQL revisable.

## 7. Bloqueantes conocidos
- Pagos: checkout apagado con `CHECKOUT_ENABLED=false` hasta integrar Mercado Pago.
- Legal (términos, privacidad, Ley Fintec) y correo transaccional: pendientes, fuera de alcance.
- Senado de EE.UU. (efdsearch) bloquea desde Chile; Tuberville sin datos hasta que el bridge lo traiga o el runner de EE.UU. funcione.
- Migraciones 059–065 y los SQL de borrado esperan aprobación.
