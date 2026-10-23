# Migraciones — orden de aplicación

Las migraciones numeradas son idempotentes: pueden re-ejecutarse sin romper nada.
**Excepción: `../schema.sql` corre una sola vez, sobre una base vacía.** No es
re-ejecutable: la 004_cover_image agrega `cover_image` a `portfolios` y la vista
`portfolios_with_stats` (`select p.*`) queda con esa columna, así que volver a
correr el `create or replace view` de schema.sql falla con 42P16. Aplicar en
este orden en el SQL Editor de Supabase (o `supabase db push` si se usa
el CLI, respetando el mismo orden).

## Orden actual (archivos existentes en `supabase/migrations/`)

| # | Archivo | Qué hace | Depende de | Idempotente |
|---|---------|----------|------------|-------------|
| 0 | `../schema.sql` (o `../SETUP-COMPLETO.sql`) | Esquema base + seeds. SETUP incluye schema + migraciones tempranas. **Una sola vez, sobre una base vacía.** | — | No |
| 1 | `002_holdings_returns.sql` | Precios y `return_pct` en holdings. | Esquema base | Sí |
| 2 | `003_portfolio_snapshots.sql` | Snapshots históricos para gráficos. | Esquema base | Sí |
| 3 | `004_chat_quota.sql` | Cuotas de chat AI + historial de mensajes. | Esquema base | Sí |
| 4 | `004_cover_image.sql` | Columna `cover_image` en portfolios. | Esquema base | Sí |
| 5 | `005_assign_covers.sql` | Asignación de imágenes de portada. | `004_cover_image.sql` | Sí |
| 6 | `006_elite_plan.sql` | Restringe constraint de plan a free/pro/elite. | Esquema base | Sí |
| 7 | `006_elite_plan_and_13f_portfolios.sql` | Plan Elite completo: cuotas diferenciadas, portafolios 13F Wave 2/3. **Reemplaza al 006 anterior en la práctica** (basta con este; aplicar ambos no rompe). | `006_elite_plan.sql` | Sí |
| 8 | `prices.sql` | Tabla de precios diarios por símbolo (sin número: aplicar después de 002). | `002_holdings_returns.sql` | Sí |
| 9 | `007_seguridad_rls.sql` | Seguridad RLS (F1): trigger que protege columnas sensibles de `profiles` (plan, cuotas), límite de follows por plan y rate limit anónimo del chat (`chat_rate_limits`, `check_anon_chat_quota()`). | `006_elite_plan_and_13f_portfolios.sql` | Sí |
| 10 | `008_planes_alertas.sql` | Planes y alertas: alinea cuotas y límites con `src/lib/plans.ts`; RPC de cuotas, Telegram y baja solo para `service_role`. | `007_seguridad_rls.sql` | Sí |
| 11 | `009_pagos_suscripciones.sql` | Pagos y suscripciones (F2): columnas de facturación en `profiles` y tablas de suscripciones para Flow / Mercado Pago / mock (solo desarrollo). | `008_planes_alertas.sql` | Sí |
| 12 | `010_nuevas_fuentes.sql` | Nuevas fuentes (F3): senadores (`mullin-tracker`), fondos 13F adicionales y ETFs iShares/VanEck. | Esquema base | Sí |
| 13 | `011_rendimiento.sql` | Rendimiento auditable (F5): `benchmark_prices` (S&P 500, IPSA), métricas por periodo con benchmark y alertas de alineación. Escritura solo service role. | Esquema base | Sí |
| 14 | `011b_objetos_setup_completo.sql` | Objetos que antes solo traía `SETUP-COMPLETO.sql`: tabla `portfolio_performance` (+ índice, RLS, política "performance public read" y grants: lectura anon/authenticated, escritura service_role). Necesaria para la 048. | Esquema base (`portfolios`) | Sí |
| 15 | `012_muro_pago.sql` | Muro de pago real: quita lectura pública de `holdings`/`portfolio_snapshots`, funciones `get_portfolio_holdings(p_slug)` y `get_portfolio_snapshots(p_slug)` con recorte por plan. **Incluye bloque `-- rollback`.** | `008_planes_alertas.sql` (plan del perfil) | Sí |
| 16 | `013_portafolios_tematicos.sql` | Tres portafolios temáticos + holdings semilla. | Esquema base | Sí |
| 17 | `014_trump_dice.sql` | Tabla `mentions` (lectura pública solo `status='verificada'`, sin políticas de escritura), portafolio `trump-dice`, 15 menciones y holdings semilla. | Esquema base | Sí |
| 18 | `015_holders_por_simbolo.sql` | Holders por símbolo (F9): función security definer para `/accion/[symbol]` que entrega las posiciones del símbolo recortadas según el plan, respetando el muro de pago. | `012_muro_pago.sql` | Sí |
| 19 | `016_insiders.sql` | Compras de ejecutivos (Form 4): tabla `insider_trades` (lectura pública, sin direcciones ni políticas de escritura) y portafolio `insiders-compras-1m`. | Esquema base | Sí |
| 20 | `019_trump_compra.sql` | Tabla `disclosure_trades` (lectura pública solo `verificada`), portafolio `trump-compra` (`premium=false`, source `oge_278t`) y excepción de muro para `oge_278t` / `house_ptr` / `senate_ptr`. | `012_muro_pago.sql` | Sí |
| 21 | `020_afp_carteras.sql` | F14: portafolio `afp-modelo-acciones-cl` (AFP Modelo, acciones chilenas al 29-05-2026) y holdings semilla. No modifica `afp-consenso-chile`. | Esquema base | Sí |
| 22 | `017_musk_dice.sql` | Amplía `mentions.kind` con `critica` y `empresa_propia`, portafolio `musk-dice`, 4 menciones (URL de X) y holdings ETSY/GME al 50%. Reutiliza la tabla de la 014. | `014_trump_dice.sql` | Sí |
| 23 | `018_inverse_cramer.sql` | Amplía `mentions.kind` con `recomienda_compra` y `recomienda_venta`. Portafolio `inverse-cramer-real`, 27 picks y holdings semilla al 2026-10-16. El proxy `inverse-cramer` no se toca. | `014_trump_dice.sql` | Sí |
| 24 | `021_infoprobidad_agregado.sql` | Tabla pública `infoprobidad_empresas` (agregado por RUT de la sociedad, sin personas). El slug `infoProbidad-cl` no cambia. | Esquema base | Sí |
| 25 | `022_publicaciones.sql` | Núcleo de borradores de publicación (`publish_drafts`) para X, Telegram y newsletter; estados draft/approved/rejected/sent/failed. RLS sin policies: solo `service_role`. No envía nada por sí sola. | Esquema base (`alerts`, `auth.users`) | Sí |
| 26 | `023_newsletter.sql` | Lista propia de suscriptores con doble opt-in (`pending` → `confirmed`), baja en un clic y consentimiento guardado. Tabla cerrada; altas y bajas solo por `newsletter_subscribe`, `newsletter_confirm` y `newsletter_unsubscribe` (`security definer`). | Esquema base | Sí |
| 27 | `024_consenso_corredoras.sql` | Portafolios `bice-acciones-destacadas`, `mbi-acciones-recomendadas` y el agregado `consenso-corredoras-cl`, con holdings semilla al 2026-10-05. El consenso promedia solo carteras completas. | `021_infoprobidad_agregado.sql`; independiente de `022-043` y `044` | Sí |
| 28 | `025_13f_soberanos.sql` | Cuatro portafolios 13F: `norges-bank-13f`, `snb-13f`, `gates-foundation-13f` e `icahn-13f` (`premium=false`). No crea tablas: los holdings los carga `sec13f`. | Esquema base (`portfolios`) | Sí |
| 21b | `026_etf_politicos.sql` | Portafolios `nanc-etf` y `gop-etf` (ETF de Subversive, holdings desde N-PORT en EDGAR), source `nport_subversive`, **`premium=true`** (decisión de Manu: van detrás del muro). `on conflict (slug) do update set premium = true`. Los PTR oficiales (`house_ptr`, `senate_ptr`, `oge_278t`) siguen gratis. | Esquema base (`portfolios`) | Sí |
| 30 | `027_activistas.sql` | Tabla `activist_filings` (Schedule 13D/13D/A, sin direcciones) y portafolio `activistas-13d` de los últimos 90 días. | Esquema base | Sí |
| 31 | `028_spinoffs.sql` | Tabla `spinoffs` (Form 10-12B/10-12B/A, una fila por CIK) y portafolio `spinoffs-12m`. | Esquema base | Sí |
| 32 | `029_recompras.sql` | Tabla `buybacks` (XBRL frames de la SEC, una fila por emisor y trimestre) y portafolio `recompras-top20`. | Esquema base | Sí |
| 33 | `030_polymarket.sql` | Tablas `prediction_trades` y `prediction_leaderboard` (billetera seudónima y alias público; sin bio, foto ni redes) y portafolio `polymarket-ballenas`. | Esquema base | Sí |
| 34 | `031_dividendos_cl.sql` | Tabla `cl_dividends` (calendario de dividendos CMF por emisor, serie y fecha de pago) y portafolio `dividendos-cl`. | Esquema base | Sí |
| 35 | `032_hechos_esenciales.sql` | Tabla `cl_material_events` (hechos esenciales CMF con categoría clasificada) y portafolio `hechos-esenciales-cl`. | Esquema base | Sí |
| 36 | `033_mayores_accionistas.sql` | Tabla `cl_top_shareholders` (12 mayores accionistas por emisor y trimestre CMF), con RLS y lectura pública. | Esquema base | Sí |
| 37 | `034_fondos_mutuos.sql` | Tablas `cl_mutual_funds` y `cl_mutual_fund_holdings`, vista `cl_mutual_funds_ranking` (`security_invoker`) y portafolio `fondos-mutuos-acciones-cl`. | Esquema base; trigger `updated_at` de `schema.sql` | Sí |
| 29b | `035_flujos_etf.sql` | Tabla `etf_flows` (symbol, fecha, acciones, nav, flujo_usd; único por symbol+fecha): flujo diario = Δ acciones en circulación × NAV de los ETF iShares. Lectura pública, escritura solo service role. La carga la etapa `etf_flows`. | Esquema base; trigger `updated_at` de `schema.sql` | Sí |
| 39 | `036_oge_funcionarios.sql` | Un portafolio por funcionario del gabinete de EE.UU. (`bessent-oge`, `lutnick-oge`, `hegseth-oge`), source `oge_278t` y `premium=false`. Reutiliza la tabla y las funciones de la 019. | `019_trump_compra.sql` | Sí |
| 40 | `037_reglas_alerta.sql` | Tabla `alert_rules` (ticker/portfolio/source/min_amount y canal email/telegram/both) con RLS solo del dueño y trigger `enforce_alert_rule_limits` (topes 3 gratis / 50 pago, Telegram solo pago o prueba). | `008_planes_alertas.sql` (`profiles.plan`, `trial_ends_at`) | Sí |
| 41 | `038_comunidad.sql` | Tablas `creator_profiles` y `creator_portfolios` para comunidad de creadores; carteras nacen `pending`, lectura pública solo `approved`, moderación solo `service_role` y triggers que congelan estado/verificado. Apagada en la app por `COMMUNITY_ENABLED`. | Esquema base (patrón `reclu.trusted` de la 007) | Sí |
| 42 | `039_referidos.sql` | Refuerza el esquema de referidos de la 009: un invitado por fila, `referrals` solo-lectura para el cliente y `reward_referral()` para el primer pago. No duplica tablas ni códigos. | `009_pagos_suscripciones.sql` | Sí |
| 43 | `040_api_claves.sql` | F53: tablas `api_keys` (prefijo público + `sha256` de la clave, plan, revocación y `last_used_at`) y `api_usage` (`key_id`, `day` UTC, `count`); RPC `consume_api_usage(uuid, date)` y RLS de solo lectura del dueño. Sin clave en claro, sin IP ni user-agent. | Esquema base (`auth.users`) | Sí |
| 44 | `041_socios.sql` | Tabla `partners` para marca blanca (`/p/[socio]/[tipo]`): logo, acento validado y slugs de portafolios permitidos; lectura pública solo de socios activos. | Esquema base | Sí |
| 45 | `042_patrocinios.sql` | Tabla `sponsorships` para espacios pagados rotulados; `placement` solo ubicaciones editoriales (nunca `portfolio` ni `alerts`) y lectura pública solo de campañas vigentes. | Esquema base | Sí |
| 46 | `043_ocultar_demos.sql` | Agrega `portfolios.replaced_by_slug` y `hidden_reason`, y oculta (sin borrar) los 4 portafolios con cifras inventadas apuntando a su versión real. Reversión en `supabase/rollback/043_ocultar_demos_down.sql`. | `014`, `017`, `020`; la 018 solo si `inverse-cramer-real` existe | Sí |
| 47 | `044_corredoras_cl.sql` | F23: filas de `portfolios` para `bice-acciones-destacadas` y `mbi-acciones-recomendadas` (`broker_cl`, `CL`, `premium=false`). Sin holdings: los carga `corredoras_cl`. | `021_infoprobidad_agregado.sql` (y `043` si existe); independiente de `022-042` | Sí |
| 48 | `045_accionistas_anonimizar.sql` | Agrega `cl_top_shareholders.es_persona_natural` y anonimiza las personas naturales históricas como `Persona natural (#ranking)`, conservando porcentaje, acciones y ranking. | `033_mayores_accionistas.sql` | Sí |
| 49 | `046_endurecer_permisos.sql` | SB1 (M3/B1/037): `revoke` de escritura a `anon`/`authenticated` en las 9 tablas públicas nuevas, `revoke execute` de `enforce_alert_rule_limits()` y función `anonimizar_accionista()` + trigger `BEFORE INSERT OR UPDATE` en `cl_top_shareholders` (mismo regex que la 045). | `045_accionistas_anonimizar.sql`; tablas de `027-034` y `042` | Sí |
| 50 | `047_telegram_link_code.sql` | M10: RPC `create_telegram_link_code()` (`security definer`, `set search_path = ''`) que genera el código con `auth.uid()` y escribe `profiles.telegram_link_code` marcando `reclu.trusted` para el trigger de la 007. Solo `authenticated`. | `008_planes_alertas.sql` (columna `telegram_link_code`) | Sí |
| 51 | `048_muro_series_alertas.sql` | SD2-A (M6/M7) + SD2-C: quita la lectura pública de `portfolio_performance`/`portfolio_metrics` para portafolios premium y expone `get_portfolio_performance(uuid)` (90 días para anon/free), `get_portfolio_metrics(uuid)`, `get_alerts(uuid, int)` (topes 3/10/p_limit, `summary` solo pro/elite) y `get_alert(uuid)` (una alerta por id, mismas reglas). `alerts` deja de exponer `summary` por lectura directa y se agrega `alerts_public`. | `011_rendimiento.sql` y `012_muro_pago.sql` (`current_user_plan()`) | Sí |
| 52 | `049_token_baja.sql` | M5: agrega `profiles.unsubscribe_token_created_at` y reescribe `unsubscribe_by_token` con expiración de 180 días y rotación del token al usarse. Solo `service_role`. | `007_seguridad_rls.sql` (trigger de perfiles) y `008_planes_alertas.sql` (`unsubscribe_by_token`) | Sí |
| 53 | `050_mi_portafolio.sql` | F58: `user_holdings` gana `quantity`, `avg_cost`, `currency`, `market` y `broker`, y `source` admite `cartola` (se mantiene `weight`). Agrega `user_portfolio_settings` (alertas automáticas apagadas por defecto, umbral, canal y `consent_at`) con RLS solo del dueño, `revoke` a anon y la RPC `delete_my_portfolio()` (`security invoker`, `search_path = ''`). Sin vistas públicas. | Esquema base (`user_holdings`, `auth.users`, `set_updated_at`) | Sí |
| 54 | `051_noticias_impacto.sql` | F59/F70: `news_items`, `news_tickers`, `ticker_profile` y `ai_impact_cache` (sin `user_id`, análisis genérico por noticia y ticker), `user_impact_requests` y purga a 90 días. Lectura pública solo de columnas permitidas; escritura del `service_role`. | 050 | Sí |
| 55 | `052_limites_portafolio.sql` | F60: trigger de tope de posiciones por plan (10/50/200) e índice único `(user_id, symbol)`; actualizar un símbolo existente no cuenta contra el tope. | 050 | Sí |
| 56 | `053_alertas_portafolio.sql` | F73: `user_portfolio_alerts` (avisos personales enviados, clave `(user_id, news_id, symbol)`), RLS de lectura solo del dueño, escritura solo `service_role`; recrea `delete_my_portfolio()` para borrar también ese historial. No toca `alerts`. | 050, 051 | Sí |
| 57 | `054_borrado_cartera_completo.sql` | F77: arregla `delete_my_portfolio()` (con la 053 fallaba por falta de DELETE sobre `user_portfolio_alerts`) y ahora borra tambien `user_impact_requests`; policies de delete del dueno; `revoke` a PUBLIC en `user_holdings`; tope de 300 caracteres en `news_items.title` (NOT VALID); `revoke execute` de `enforce_user_holdings_limit()`. | 050-053 | Si |
| 58 | `055_imagenes_portafolios.sql` | Imágenes: asigna una de las 12 ilustraciones de `/public/covers` a todo portafolio sin `cover_image` (por slug, source y category; incluye inverse-cramer) y agrega `portrait_image`/`portrait_source`/`portrait_license` con retratos oficiales de dominio público de cargos públicos de EE.UU. (`/public/portraits`). | `004_cover_image.sql` | Sí |
| 60 | `057_estimado.sql` | `portfolio_performance.is_estimated` (default false). Al crearse marca todas las filas previas como estimadas; luego los scrapers reales (etf_series, reconstruct_*) las reescriben como reales y `performance.py` solo escribe estimadas sin pisar reales. | `011b_objetos_setup_completo.sql` | Sí |

## Rango 007–020 y huecos de numeración

El rango `007`–`020` ya está fusionado y sus archivos viven en
`supabase/migrations/` (`007_seguridad_rls.sql`, `008_planes_alertas.sql`,
`009_pagos_suscripciones.sql`, `010_nuevas_fuentes.sql`,
`011_rendimiento.sql`, `015_holders_por_simbolo.sql`, etc.). Se aplican
antes de la `021`; esta tabla documenta en detalle desde la `021` porque
las anteriores ya tienen su propio encabezado y sus `NOTAS-*.md`.

La `026` (F26) y la `035` (F35) existen; ver sus filas en la tabla.
La `040` existe y es la de claves de API (F53); ver su sección más abajo.

## Duplicados conocidos (A8)

- Hay dos `004_*` y dos `006_*`: archivos distintos de frentes distintos,
  todos idempotentes. No renombrar (otros frentes pueden referenciarlos);
  el orden de la tabla de arriba es el correcto.
- `prices.sql` no lleva número: aplicar tras `002_holdings_returns.sql`.

## 021 — InfoProbidad agregado (F15)

`021_infoprobidad_agregado.sql`: tabla pública `infoprobidad_empresas`
(RUT, nombre de la sociedad, nemotécnico, autoridades, valor declarado,
última declaración). Sin columnas de personas. El slug `infoProbidad-cl`
no cambia. Aplicar después del esquema base. Idempotente.

## 040 — Claves de API (F53)

`040_api_claves.sql`: crea `api_keys` y `api_usage` para la API pública de
datos (`/api/v1/*`). Cada clave se guarda como `prefix` visible
(`rcl_` + 12 hex) y `key_hash` (`sha256` hex); el texto en claro solo se
muestra una vez al crearla y nunca se persiste ni se loguea. Incluye `plan`,
`revoked`, `revoked_at` y `last_used_at` para la pantalla `/settings/api`.

- **RLS:** el dueño solo puede **leer** sus claves (`auth.uid() = user_id`).
  `insert/update/delete` quedan revocados a `anon`/`authenticated`: escribe el
  `service_role` desde el server action. `api_usage` no tiene policies.
- **RPC `consume_api_usage(p_key_id uuid, p_day date)`:** `security definer`,
  solo `service_role`, incrementa el contador del día UTC con UPSERT.
- **Datos mínimos:** dueño, etiqueta opcional, prefijo, hash y contador diario.
  No se guardan IP ni user-agent (Leyes 19.628 y 21.719).
- **Idempotente:** `if not exists`, `create or replace`, `drop policy if
  exists`, `drop constraint if exists` + `create`, `revoke/grant` repetibles.

La creación de claves y las llamadas a `/api/v1` quedan apagadas salvo
`API_PUBLIC_ENABLED=true` (exacto). Los datasets de funcionarios de EE.UU.
(`house_ptr`, `senate_ptr`, `oge_278t`) no se redistribuyen por la API
(5 U.S.C. § 13107). Aplicar después del esquema base; es independiente de
`041-050`.

## 044 — Carteras BICE y MBI (F23)

`044_corredoras_cl.sql`: filas de `portfolios` para `bice-acciones-destacadas`
y `mbi-acciones-recomendadas` (`category='broker_cl'`, `country='CL'`,
`premium=false`, `source` = `bice_cartera` / `mbi_cartera`, que es el nombre
de cada adaptador). No trae holdings semilla: los carga la etapa
`corredoras_cl` (`scrapers/stages/corredoras_cl.py`) desde los PDF públicos de
cada corredora. Aplicar después de `021_infoprobidad_agregado.sql` (y de la
`043` si existe); independiente de `022-042`. El `on conflict (slug) do update`
toca solo `description` y `source`, nunca `followers` ni `return_ytd`.
## 043 — Ocultar portafolios con cifras inventadas (D43)

`043_ocultar_demos.sql`: agrega `portfolios.replaced_by_slug` y
`portfolios.hidden_reason`, y marca `is_active = false` +
`hidden_reason = 'cifras_inventadas'` en `elon-doge-tracker`,
`trump-truth-signals`, `afp-consenso-chile` e `inverse-cramer`. Apunta
`replaced_by_slug` a la versión real (`musk-dice`, `trump-dice`,
`afp-modelo-acciones-cl`, `inverse-cramer-real`); el de `inverse-cramer` solo
se escribe si `inverse-cramer-real` existe y está activa. **No borra filas** ni
toca holdings/alerts. Se puede aplicar después de la 021 y antes o después de
las migraciones v2 (022-042): es independiente. Idempotente.

**Reversión:** `043_ocultar_demos_down.sql` (en `supabase/rollback/`, fuera de
`migrations/` para que no corra en el flujo normal) reactiva esos 4 portafolios
y limpia `replaced_by_slug`/`hidden_reason`. **El `_down` NO se aplica en el
flujo normal**; solo se corre a mano si se quiere deshacer el ocultamiento.

Pendiente conocido: las RPC de `011`, `012`, `015` y `019` ya filtran
`p.is_active = true`, así que no vuelven a exponer los ocultos. La política RLS
`portfolios public read` (`schema.sql`) también limita la lectura a
`is_active = true`, por eso el redirect usa un mapa estático como respaldo.

## Revertir el muro de pago (012)

Al final de `012_muro_pago.sql` hay un bloque comentado `-- rollback`:
restaura las policies públicas de lectura y borra las funciones.

## 045 — Anonimizar personas naturales (F33-B)

`045_accionistas_anonimizar.sql`: agrega
`cl_top_shareholders.es_persona_natural boolean not null default false` y
reescribe las filas históricas que no traen marcador societario como
`Persona natural (#ranking)`, conservando porcentaje, acciones y ranking.
Las personas jurídicas mantienen su nombre. El RUT del accionista nunca se
guarda.

**Reversión:** los nombres y RUT originales no se pueden recuperar (el
reemplazo es intencional, Leyes 19.628 y 21.719). Solo se puede deshacer el
esquema con `alter table ... drop column if exists es_persona_natural`; los
textos `Persona natural (#n)` quedan como están. Aplicar después de la `033`.
Idempotente.

## 046 — Endurecer permisos (SB1: M3, B1 y fila 037)

`046_endurecer_permisos.sql` cierra los hallazgos M3, B1 y la fila de
`037_reglas_alerta.sql` de la revisión de seguridad 2026-10-20:

- **B1:** `revoke insert, update, delete` a `anon`/`authenticated` en las 9
  tablas públicas nuevas (`activist_filings`, `spinoffs`, `buybacks`,
  `cl_dividends`, `cl_material_events`, `cl_top_shareholders`,
  `cl_mutual_funds`, `cl_mutual_fund_holdings`, `sponsorships`), cada una con
  `do $$ ... if to_regclass(...) is not null` por si alguna no existe todavía.
  Solo el `service_role` (que bypassa RLS) puede escribir.
- **Fila 037:** `revoke execute on function public.enforce_alert_rule_limits()
  from public, anon, authenticated` (la función es de trigger y solo el
  service role necesita acceso).
- **M3:** función `public.anonimizar_accionista()` (`security definer`,
  `set search_path = ''`, con `revoke execute`) + trigger
  `anonimizar_accionista` `BEFORE INSERT OR UPDATE` en
  `public.cl_top_shareholders`: si `NEW.accionista` no calza con el regex
  societario de la 045 (copiado exacto), lo reescribe como
  `Persona natural (#ranking)` y marca `es_persona_natural = true`. Si ya
  empieza con `Persona natural (#`, lo deja (idempotente).

Re-ejecutable. Aplicar después de la `045`.

**Reversión:** `drop trigger if exists anonimizar_accionista on
public.cl_top_shareholders; drop function if exists
public.anonimizar_accionista();` y repetir los `grant insert, update, delete`
que cada migración original declaraba (no hay `grant` de escritura que
restaurar: las migraciones 027–034 y 042 solo daban `grant select`).

## 047 — Código de vinculación de Telegram (M10)

`047_telegram_link_code.sql` cierra M10 de la revisión de seguridad
2026-10-20. `prepareTelegramLink` escribía `profiles.telegram_link_code`
directamente desde el cliente autenticado, pero el trigger
`a_protect_profile_columns` de la 007 revertía la columna: el flujo no
persistía. Abrir la columna a escritura directa permitiría manipular códigos
desde el navegador.

La migración agrega `public.create_telegram_link_code()`:

- `security definer` y `set search_path = ''`; todos los objetos van
  calificados con `public.`.
- Usa `auth.uid()` (no recibe parámetros) y falla si no hay sesión, así que
  solo puede escribir el perfil propio.
- Genera 128 bits en hex con `pg_catalog.gen_random_uuid()` (32 caracteres).
- Hace `perform set_config('reclu.trusted', 'on', true)` antes del `UPDATE`
  de `public.profiles`, para que el trigger de la 007 permita el cambio.
- Devuelve el código. `revoke execute` a `public`/`anon` y `grant execute`
  a `authenticated`.

Re-ejecutable. Aplicar después de la 008 (columna `telegram_link_code`).
La acción `prepareTelegramLink` llama `supabase.rpc('create_telegram_link_code')`.

**Reversión:** `drop function if exists public.create_telegram_link_code();`.

## 048 — Muro de series, métricas y alertas (SD2-A: M6/M7)

`048_muro_series_alertas.sql` cierra M6 y M7 con el patrón de la 012
(funciones `security definer` con `set search_path = ''` y el plan de
`public.current_user_plan()`):

- **M6 — series y métricas:** se eliminan las policies de lectura pública de
  `portfolio_performance` y `portfolio_metrics`. La lectura directa por REST
  queda solo para filas de portafolios activos **no premium**
  (`exists (... not p.premium)`). Lo premium se sirve por:
  - `get_portfolio_performance(p_portfolio uuid)`: premium + plan no pago →
    vacío; anon/free → últimos 90 días de la serie (desde su último punto,
    igual que `trimSeriesToWindow`); pro/elite → completa. Las declaraciones
    públicas (`oge_278t`, `house_ptr`, `senate_ptr`) se entregan completas.
  - `get_portfolio_metrics(p_portfolio uuid)`: premium + plan no pago → vacío;
    el resto → todas las filas.
  - La vista `v_beat_the_market` (011) pasa a `security_invoker = true` para
    que no saltée la RLS de `portfolio_metrics`.
- **M7 — alertas:** la policy de lectura queda solo para alertas publicadas
  de portafolios activos no premium. `summary` se quita del privilegio de
  lectura directa (`revoke select (summary)` + `revoke select` de tabla y
  `grant select` por columnas sin `summary`), y se agrega la vista
  `public.alerts_public` (`security_invoker = true`) sin esa columna.
  - `get_alerts(p_portfolio uuid default null, p_limit int default 20)`:
    solo publicadas; premium + plan no pago → ninguna; `summary` solo
    pro/elite; tope 3 (anon) / 10 (free) / `p_limit` (pago, máx. 100).
  - `get_alert(p_alert uuid)` (SD2-C): una sola alerta por id con las mismas
    reglas (publicada, portafolio activo, premium solo pro/elite y `summary`
    null fuera de pago). La usa `/api/explain-alert` en vez de leer `alerts`
    directo; si la RPC no devuelve filas, la respuesta es 404.
- Grants: `revoke all ... from public` + `grant execute ... to anon,
  authenticated` en las cuatro RPC (`get_portfolio_performance`,
  `get_portfolio_metrics`, `get_alerts` y `get_alert`).

**Ojo (SD2-B):** al revocar `select (summary)` un `select("*")` sobre
`alerts` desde anon/authenticated falla con *permission denied for column
summary*. `getAlerts` en `src/lib/queries.ts` debe listar columnas explícitas
o leer `alerts_public` (y usar `get_alerts` para el resumen de pago).

**Reversión:** bloque `-- rollback` al final del archivo: borra las tres
funciones y `alerts_public`, restaura el `select` de tabla en `alerts`, las
policies públicas de 011/SETUP y el `security_invoker` de `v_beat_the_market`.
Aplicar después de la 012 (usa `current_user_plan()`) y de la 011.

