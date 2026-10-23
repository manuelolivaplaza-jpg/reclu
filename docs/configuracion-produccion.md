# Configuración para producción: rama `mejoras/integracion`

Preparado el 20-10-2026, actualizado tras F26 y F35. Nada de esto se ha aplicado todavía: no hubo push, deploy ni migraciones reales.

## 1. Migraciones (Supabase, en este orden)
`main` solo llega hasta la 006. Todas estas son nuevas:

007 seguridad_rls · 008 planes_alertas · 009 pagos_suscripciones · 010 nuevas_fuentes · 011 rendimiento · 011b objetos_setup_completo · 012 muro_pago · 013 portafolios_tematicos · 014 trump_dice · 015 holders_por_simbolo · 016 insiders · 017 musk_dice · 018 inverse_cramer · 019 trump_compra · 020 afp_carteras · 021 infoprobidad_agregado · 022 publicaciones · 023 newsletter · 024 consenso_corredoras · 025 13f_soberanos · 026 etf_politicos · 027 activistas · 028 spinoffs · 029 recompras · 030 polymarket · 031 dividendos_cl · 032 hechos_esenciales · 033 mayores_accionistas · 034 fondos_mutuos · 035 flujos_etf · 036 oge_funcionarios · 037 reglas_alerta · 038 comunidad · 039 referidos (requiere la 009) · 040 api_claves · 041 socios · 042 patrocinios · 043 ocultar_demos · 044 corredoras_cl · 045 accionistas_anonimizar · 046 endurecer_permisos · 047 telegram_link_code · 048 muro_series_alertas · 049 token_baja · 050 mi_portafolio · 051 noticias_impacto · 052 limites_portafolio · 053 alertas_portafolio · 054 borrado_cartera_completo · 055 imagenes_portafolios · 056 fotos_wikimedia · 057 estimado · 058 inverse_cramer_nombre

- 026: siembra NANC y GOP como PREMIUM (`on conflict do update set premium = true`). Los PTR de congresistas (`house_ptr`, `senate_ptr`, `oge_278t`) siguen gratis.
- 035: tabla `etf_flows`, de lectura pública. La etapa del scraper es `etf_flows` (opcional); correrla primero con `--dry-run`.
- Todas son idempotentes. Hay que aplicarlas primero en un proyecto staging o en una rama de Supabase.
- 039: agrega `unique(referred_id)`. Fallará si ya hay invitados duplicados en `referrals`.
- 011b: crea `portfolio_performance` (antes solo venía en SETUP-COMPLETO.sql). Sin ella la 048 falla con `relation "public.portfolio_performance" does not exist`. Si una base ya pasó la 011, correr la 011b antes de la 048. Es idempotente.
- 048: cambia la lectura pública de series, métricas y alertas. Hay que desplegar la app (SD2B/SD2C) junto con la migración, o la app dejará de ver datos premium.
- 049: los tokens de baja de correo vencen a los 180 días. Los correos deben usar el token vigente.
- El detalle de cada una está en `supabase/migrations/README.md`.

## 2. Secretos (Vercel, entorno Production; nunca en el repo)
- **Supabase:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
- **Sitio y cron:** NEXT_PUBLIC_SITE_URL=https://reclu.cl, CRON_SECRET, CHAT_RATE_SALT.
- **IA:** OPENROUTER_API_KEY, OPENROUTER_MODEL.
- **Correo:** RESEND_API_KEY, EMAIL_FROM, NEWSLETTER_FROM.
- **Telegram:** TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHANNEL_ID.
- **Alertas:** SEND_ALERTS_URL.
- **Pagos:**
  - PAYMENT_PROVIDER y PAYMENT_MODE.
  - ALLOW_MOCK_PAYMENTS: en producción debe quedar en false o vacío.
  - Flow: FLOW_API_KEY, FLOW_SECRET_KEY y FLOW_PLAN_* (4 planes).
  - Mercado Pago: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET y MP_PREAPPROVAL_PLAN_* (4 planes).
- **X** (solo si se publica en X): X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, X_BEARER_TOKEN.
- **Otros:** INFOPROBIDAD_NOMBRES, NEXT_PUBLIC_PLAUSIBLE_DOMAIN.

## 3. Flags (todos vienen apagados por defecto)
| Flag | Valor recomendado al lanzar | Nota |
|---|---|---|
| ADMIN_EMAILS | correo(s) de Manu, separados por coma | Si está vacío, nadie entra a /admin (moderación, publicaciones). |
| REFERRALS_ENABLED | `false` hasta probar con un pago real; luego `true` | Enciende la cookie `?ref=`, la tarjeta en Ajustes y el premio de 1 mes Pro al primer pago del invitado. Sin este flag no se da ningún premio. |
| COMMUNITY_ENABLED | `false` | Requiere revisión legal (Ley Fintec 21.521) antes de encenderlo. |
| API_PUBLIC_ENABLED | `false` | Enciende /api/v1, la creación de claves y /api-docs en el sitemap. |
| SPONSORS_ENABLED / NEXT_PUBLIC_SPONSORS_ENABLED | `false` | Patrocinios rotulados. |
| PUBLISH_MODE | `preview` | Si no es `live`, no se publica nada. |
| PUBLISH_X/TELEGRAM/NEWSLETTER_ENABLED | `false` | Se encienden por canal. |
| NEXT_PUBLIC_AFFILIATES_ENABLED | según decisión | |

## 4. Ramas para borrar (después de hacer merge a main y verificar)
- Backups:
  - `backup/f21-longcat` y `backup/f32-nemotron`: código no confiable, nunca integrado.
  - `backup/f51b-intento1`: primer intento de referidos, ya reemplazado.
  - `backup/f13-antes-squash`.
- Ramas de trabajo ya integradas: `v2/*` y `mejoras/f*` (83 en total), incluidas `v2/f26-etf-nanc-gop` y `v2/f26b-etf-premium`.
- Los worktrees `C:\reclu-work\f*` se quitan con `git worktree remove`.

## 5. Pendientes antes de lanzar
- F26 (premium) y F35: integradas.
- F58 en adelante: sin arrancar.
- API /insiders: expone `owner_name` (formularios SEC Form 4, que son públicos). Confirmar si se publica así.

## Mi portafolio + IA (F58-F77)

- Migraciones 050-054 en orden (053 depende de 050 y 051; la 054 es obligatoria si se aplica la 053, porque sin ella falla el borrado de cartera). No hay 053_consent_version: `consent_version` ya viene en la 050.
- Flags (exactamente `"true"` para encender; apagadas por defecto): `MY_PORTFOLIO_ENABLED`, `NEWS_IMPACT_ENABLED`.
- IA: `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` (sin modelo por defecto; sin ellos la IA responde 503).
- Cron: `/api/impact/precompute` y `/api/impact/alerts` con `Authorization: Bearer CRON_SECRET`. Las alertas automáticas solo salen a usuarios con opt-in y consentimiento de la versión vigente.
- Correo y Telegram de alertas: `RESEND_API_KEY`, `EMAIL_FROM`, bot de Telegram ya configurado.
- Ramas de respaldo para borrar al cerrar: `v2/f62-*`, `v2/f71-pregunta-ia`, `v2/f72-feed-noticias`, `v2/f73-alertas-portafolio`, `v2/f77-*`.

## Carga de cartera (F78-F79, M1, M3)

- **Modo de ingreso (F78):** en `/compare` y `/mi-portafolio` el usuario elige cantidad de acciones, monto o porcentaje. Usa los precios que ya existen; no agrega variables ni migraciones.
- **Importar desde captura (F79):**
  - Flag `PORTFOLIO_IMAGE_IMPORT_ENABLED` (solo `"true"` exacto lo enciende; apagado por defecto).
  - `OPENROUTER_VISION_MODEL`: modelo de visión de OpenRouter, sin valor por defecto (sin él, la ruta responde 503). Reusa `OPENROUTER_API_KEY`. Puede ser de pago o `:free`.
  - Cada pedido va con `provider: { data_collection: "deny" }`: OpenRouter solo enruta a proveedores que no guardan ni entrenan con los datos. Si el modelo elegido no tiene ningún proveedor así, el pedido falla en vez de caer en uno que entrene: elegir el modelo con eso en mente.
  - La imagen no se guarda. Solo PNG, JPEG o WebP de hasta 4 MB. Descuenta 1 del cupo de IA.
- **M1:** guardar o importar la cartera en `/compare` exige consentimiento vigente, aunque `MY_PORTFOLIO_ENABLED` esté apagado. `/compare` muestra el aviso de consentimiento cuando falta. Los usuarios que ya tienen cartera en `/compare` sin consentimiento pueden verla, pero deben aceptar antes de volver a guardar.
- **M3:** el botón Borrar de `/compare` llama a `delete_my_portfolio()` y borra todo (posiciones, consentimiento, alertas y auditoría). Requiere la 054 aplicada.
- **Montos solo en USD (decisión de Manu, 21-oct):** en el modo monto de `/compare`, Mi portafolio y la carga por imagen, el monto es siempre en dólares (etiqueta "Monto (USD)").
  - Las acciones chilenas (precio en CLP, mercado CL o símbolo `.SN`) no se aceptan por monto: se ingresan por cantidad de acciones o por porcentaje. Así un monto nunca necesita tipo de cambio ni mezcla monedas. La regla se aplica también en el servidor (`saveHoldingsByMode`).
  - El tipo de cambio solo aparece en modo acciones, cuando la cartera mezcla USD y CLP.
  - Carga por imagen: si la captura trae montos en CLP u otra moneda, se avisa y no se pueden usar hasta convertirlos a USD, borrarlos o pasar a cantidad o porcentaje.
