# Revisión de seguridad — migraciones 024–045, APIs y paywall

**Fecha:** 2026-10-20 · **Rama:** `v2/xsec-revision-seguridad` (desde `mejoras/integracion`)
**Alcance:** `supabase/migrations/0[2-4]*.sql` (024 a 045), `src/app/api/**/route.ts`, `src/app/actions/*.ts` y las rutas/páginas que sirven holdings o series.
**Método:** solo lectura del código. No se tocó Supabase real, no se aplicó ninguna migración, no se cambió código de producto. Todo lo marcado "no verificado" requiere comprobación contra la base real.

---

## 1. Resumen de severidades

| # | Severidad | Área | Resumen |
|---|-----------|------|---------|
| A1 | **alta** | Paywall | `/compare` serializa al navegador el libro **completo** de holdings de todo el catálogo (incluidos portafolios premium) para cualquier usuario con cuenta |
| M1 | media | Migraciones | `043_ocultar_demos_down.sql` vive en la carpeta de migraciones: si se aplican en orden, **anula** el ocultamiento de los demos con cifras inventadas |
| M2 | media | Migraciones | `cl_top_shareholders` (033) es de lectura pública `anon` y contiene nombres de personas naturales; la protección depende de que la 045 esté aplicada |
| M3 | media | Migraciones | La 045 anonimiza con un `UPDATE` puntual: no hay trigger que lo fuerce en futuras inserciones |
| M4 | media | API | `/api/telegram/webhook` compara el secreto con `!==` (no timing-safe) |
| M5 | media | API | `/api/unsubscribe`: token de baja en query string, sin expiración ni rotación tras usarse |
| M6 | media | Paywall | Series (`portfolio_performance`) y métricas (`portfolio_metrics`) son de lectura pública en la base: el recorte de 90 días del backtest es evadible por REST |
| M7 | media | Paywall | `alerts` es de lectura pública: `ALERT_LIMITS` (3/10) y el resumen AI no están restringidos en la base ni por rol en la UI |
| M8 | media | API | `/api/explain-alert` explica contenido controlado por el cliente y devuelve el resultado con la marca de la plataforma |
| M9 | media | Server action | `signUp` devuelve el error crudo de Supabase → enumeración de cuentas |
| M10 | media | Server action | `prepareTelegramLink` escribe `telegram_link_code`, columna que el trigger de 007 revierte: el flujo no persiste (y abrirla sin cuidado permitiría vincular cuentas ajenas) |
| B1–B11 | baja | varias | Detalle en las tablas siguientes |

**Sin hallazgos de seguridad** (verificado): rutas con `CRON_SECRET` (`/api/run-pipeline`, `/api/publish/draft`) comparan en tiempo constante y fallan cerradas (503) si el secreto no está; las migraciones con funciones `security definer` (007/008/012/015/019/037) declaran todas `set search_path = ''`; las RPC sensibles (`check_chat_quota`, `check_anon_chat_quota`, `link_telegram_chat`, `unsubscribe_by_token`) tienen `revoke execute` para `anon`/`authenticated`; el muro de holdings (012) sí está aplicado en la base con funciones `security definer` recortadas por plan; ninguna ruta escribe con la service role sin sesión o secreto.

---

## 2. Migraciones 024–045

### 2.1 Tabla por archivo

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `024_consenso_corredoras.sql` | Sin RLS nuevo (correcto: solo `portfolios`+`holdings`). Los holdings de BICE/MBI/consenso quedan detrás del muro porque su `source` no está en `PUBLIC_DISCLOSURE_SOURCES` | — (ok) | Ninguno. Confirmar que `source` siga fuera de la lista pública si alguna vez se quiere abrir |
| `025_13f_soberanos.sql` | Solo seed de `portfolios`, `premium=false`, `on conflict do nothing` | — (ok) | Ninguno |
| `026_etf_politicos.sql` | **No existe en esta rama** (vive en `v2/f26-etf-nanc-gop`). Solo seed de `portfolios` | baja (proceso) | Integrar la 026 al线性 de migraciones de la rama base o dejar constancia de que se aplica aparte |
| `027_activistas.sql` | `grant select to anon, authenticated` **sin** `revoke` de insert/update/delete (línea 53). Hoy RLS sin policy de escritura lo bloquea, pero el privilegio queda concedido | baja | `revoke insert, update, delete on table public.activist_filings from anon, authenticated;` antes del `grant select` |
| `028_spinoffs.sql` | Igual que 027 (línea 53) | baja | `revoke insert, update, delete … from anon, authenticated;` |
| `029_recompras.sql` | Igual que 027 (línea 65) | baja | `revoke insert, update, delete … from anon, authenticated;` |
| `030_polymarket.sql` | `prediction_trades` publica `wallet`, `alias` y `tx_hash` con lectura pública `anon` (líneas 26–72). Es seudónimo público por diseño, pero la tabla permite enumerar wallets de cualquier usuario de Polymarket | baja | Considerar `revoke select` a `anon` y servir el widget con cliente de servicio, o publicar solo un agregado por wallet |
| `031_dividendos_cl.sql` | `rut_emisor` es RUT de **empresa**, no de persona: sin riesgo. RLS y grants correctos (no hay `revoke` de escritura) | baja | `revoke insert, update, delete … from anon, authenticated;` |
| `032_hechos_esenciales.sql` | Igual que 031 (línea 62). `rut_emisor` es de empresa | baja | `revoke insert, update, delete … from anon, authenticated;` |
| `033_mayores_accionistas.sql` | `cl_top_shareholders` queda con lectura pública `anon` (política `using (true)` + `grant select`, líneas 74–81) y **contiene `accionista` = nombre de persona natural** mientras la 045 no esté aplicada. La fila se publica tal cual por REST a cualquiera con la anon key (que es pública en el bundle) | **media** | Aplicar 045 en el mismo bloque de despliegue que 033, o añadir a 033 un `update` de anonimización inicial; mejor aún, un trigger `BEFORE INSERT` que anonimice (ver M3) |
| `034_fondos_mutuos.sql` | **No existe en esta rama** (vive en `v2/f34-cmf-fondos-mutuos`). La vista usa `security_invoker = true` (correcto). RLS y `grant select` correctos, sin `revoke` de escritura | baja | Igual que 027: `revoke insert, update, delete …`; integrar a la línea de la rama base |
| `036_oge_funcionarios.sql` | Solo seed de `portfolios` con `premium=false` y `source=oge_278t` (dato que 5 U.S.C. §13107 exige público) | — (ok) | Ninguno |
| `037_reglas_alerta.sql` | `enforce_alert_rule_limits()` es `security definer` con `set search_path = ''` y califica `public.profiles`/`public.alert_rules` (correcto). **No** se revoca `EXECUTE` a `public/anon/authenticated` (línea 156): por defecto `EXECUTE` es para `PUBLIC`; en la práctica Postgres impide llamar una trigger function fuera de un trigger, así que el riesgo esLatente | baja | `revoke execute on function public.enforce_alert_rule_limits() from public, anon, authenticated;` (el trigger sigue funcionando) |
| `042_patrocinios.sql` | Sin `revoke` de escritura (línea 57). Además `name`/`body`/`url` son contenido de terceros y hoy no hay consumidor en `src/`: cuando exista, debe renderizarse como texto plano con `rel="sponsored"` | baja | `revoke insert, update, delete … from anon, authenticated;` + renderizar el body como texto (nunca `dangerouslySetInnerHTML`) |
| `043_ocultar_demos.sql` | El `up` es correcto: `is_active=false` + `replaced_by_slug`, y la policy `portfolios public read` filtra por `is_active = true` | — (ok) | Ninguno |
| `043_ocultar_demos_down.sql` | **Reversión dentro de la carpeta de migraciones.** Orden alfabético: `043_ocultar_demos.sql` (`.` = 0x2E) antes que `043_ocultar_demos_down.sql` (`_` = 0x5F) → cualquier runner que aplique `*.sql` en orden ejecuta el up y después el down, reactivando los 4 portafolios con cifras inventadas | **media** | Mover la reversión fuera de `supabase/migrations/` (p. ej. `supabase/rollback/`) o renombrarla con un prefijo que no ordene después (`000_…`) |
| `044_corredoras_cl.sql` | Seed de `portfolios` con `on conflict do update` limitado a `description`/`source` (no pisa `followers` ni `return_ytd`) | — (ok) | Ninguno |
| `045_accionistas_anonimizar.sql` | Anonimiza con un `UPDATE` puntual (líneas 38–60): **no hay trigger** que vuelva a anonimizar las filas que el scraper inserte en el futuro. Además el criterio es unidireccional: una persona natural cuyo nombre coincida con un marcador societario ("Banco", "Fondo") se conserva (falla abierta en ese caso) | **media** | Convertir la lógica en un trigger `BEFORE INSERT OR UPDATE` sobre `cl_top_shareholders` (o en la vista pública) para que la garantía no dependa del scraper ni del orden de aplicación |

### 2.2 Migraciones de contexto (002–023) que sostienen lo anterior

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `007_seguridad_rls.sql` | `protect_profile_columns` usa lista blanca; `telegram_link_code` **no** está en ella (líneas 43–48) → cualquier escritura de esa columna se revierte. Además `trial_ends_at` tampoco está, por lo que la prueba de Pro de la 008 queda anulada (bug funcional, no de seguridad) | media | Mover la generación del código de Telegram a una función `service_role` (RPC) en vez de un update del cliente; para `trial_ends_at`, agregarlo a la lista blanca o aplicarlo desde `handle_new_user` con el canal `reclu.trusted` |
| `007_seguridad_rls.sql` | `protect_profile_columns` / `protect_profile_insert` / `enforce_follow_limits` no revocan `EXECUTE` a `public` | baja | `revoke execute on function … from public, anon, authenticated;` (los triggers siguen operando) |
| `011_rendimiento.sql` | `portfolio_metrics` con policy `public read` `using (true)` (líneas 62–66): métricas completas (Sharpe, drawdown, alfa) de **portafolios premium** sin muro | **media** | Ver M6: mover a función `security definer` con recorte por plan, igual que 012/015 |
| `SETUP-COMPLETO.sql` / `schema.sql` | `portfolio_performance` con `performance public read` `using (true)` (SETUP-COMPLETO 423–425) | **media** | Ver M6 |
| `SETUP-COMPLETO.sql` / `schema.sql` | `alerts` con `alerts public read` `using (is_published = true)` (schema.sql 221–222) y `holdings`/`portfolio_snapshots` con policy pública que la 012 elimina después | **media** | Ver M7 |
| `012_muro_pago.sql` | Correcto: quita la lectura pública de `holdings`/`portfolio_snapshots` y expone `get_portfolio_holdings` / `get_portfolio_snapshots` recortadas por plan con `search_path = ''` | — (ok) | Ninguno. Es el patrón a replicar en M6/M7 |
| `019_trump_compra.sql` | Redefine `get_portfolio_holdings` para que `oge_278t`/`house_ptr`/`senate_ptr` no tengan límite (por ley). Correcto, pero el "sin límite" se aplica **antes** que cualquier condición de premium | baja | Revisar si la exención deberíaTAMO記 excluirse en carteras premium (hoy `premium` y esos `source` son mutuamente excluyentes) |
| `022_publicaciones.sql` | Correcto: `revoke all from public, anon, authenticated` + `grant … to service_role` | — (ok) | Ninguno. Es el patrón a replicar en B1 |

### 2.3 Cobertura de la numeración

- Presentes en la rama: 020, 021, 022, 024, 025, 027–033, 036, 037, 042, 043 (+`043_down`), 044, 045.
- **Ausentes en la rama pero existentes en otras**: `026_etf_politicos.sql` (`v2/f26-etf-nanc-gop`) y `034_fondos_mutuos.sql` (`v2/f34-cmf-fondos-mutuos`).
- **Ausentes en todo el repo**: 023, 035, 038, 039, 040, 041.
- Consecuencia práctica: si el orquestador aplica las migraciones "de la rama", la 026 y la 034 no se aplican y quedan tablas/datos fuera de la base sin que nada lo advierta. Riesgo **media** a nivel de proceso.

---

## 3. Rutas de API (`src/app/api/**/route.ts`)

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `api/run-pipeline/route.ts` | Correcto: `timingSafeEqual` (líneas 21–34), 503 si falta `CRON_SECRET`, 401 si no coincide, sin secretos en la respuesta | — (ok) | Ninguno |
| `api/run-pipeline/route.ts` | `GET` también ejecuta el pipeline (línea 125). Superficie de replay del secreto: quien lo capture (log, referrer) puede relanzar detecciones y correos | baja | Aceptar solo `POST` y dejar el cron de Vercel con un `GET` que solo valide y delegue a una cola, o rotar `CRON_SECRET` periódicamente |
| `api/run-pipeline/route.ts` | Devuelve el JSON crudo de las Edge Functions (`results.detect`, `results.send`), que puede incluir mensajes internos de Supabase | baja | Devolver solo un resumen (`{ok, ran_at, detect_status, send_status}`) y registrar el detalle en el log del servidor |
| `api/publish/draft/route.ts` | Correcto: `timingSafeEqual`, 503 sin secreto, filtra fuentes no públicas antes de redactar, `createAdminClient` solo tras autenticar | — (ok) | Ninguno |
| `api/publish/draft/route.ts` | Los `error.message` de Supabase se devuelven al cliente en los 500 (líneas 137, 164, 198, 264): filtran nombres de tabla/columna | baja | Sustituir por un mensaje genérico y dejar el detalle en `console.error` |
| `api/follow/route.ts` | Correcto: `auth.getUser()` antes de escribir, Zod (`followBodySchema`), cliente del usuario (no service role) | — (ok) | Ninguno |
| `api/unsubscribe/route.ts` | El token viaja en **query string** (`?token=`) tanto en el `GET` (redirección, línea 14) como en el `POST` (línea 48): queda en logs de servidor, `Referer` y analítica. Además el token **no expira ni se rota** tras la baja, así que un token filtrado permite dar de baja de forma permanente | **media** | Mover el token al cuerpo del `POST` (o a un fragmento que se envíe por `fetch`), añadir expiración (`expiración`/`rotación` en `profiles`) y limpiar el valor al ejecutar la baja |
| `api/unsubscribe/route.ts` | Usa `createServiceClient` (service role) correctamente, y la RPC está revocada a `anon`/`authenticated` (008) | — (ok) | Ninguno |
| `api/telegram/webhook/route.ts` | **Comparación del secreto no timing-safe**: `header !== secret` (línea 24), a diferencia de las otras dos rutas con `CRON_SECRET` | **media** | Reusar el helper `timingSafeEqual` de `api/run-pipeline/route.ts` (moverlo a `src/lib/`) y comparar con largo fijo |
| `api/telegram/webhook/route.ts` | El código de vinculación (`/start CODIGO`) no se invalida tras usarse: `link_telegram_chat` (008) lo deja en `profiles.telegram_link_code` para siempre | media | En la RPC, borrar `telegram_link_code` al vincular (`telegram_link_code = null`) y/o expirarlo por tiempo |
| `api/telegram/webhook/route.ts` | No hay validación Zod del update de Telegram: se leen `message.text` y `message.chat.id` a mano | baja | Validar con un esquema Zod (`{message:{text:string,chat:{id:number}}}`) antes de usar los campos |
| `api/chat/route.ts` | Correcto: Zod (`chatRequestSchema`), cuota por sesión (RPC) o por IP (anónimo), el `slug` solo se usa para Armar contexto con holdings ya recortados por la RPC del muro, la key de OpenRouter nunca sale del servidor | — (ok) | Ninguno |
| `api/chat/route.ts` | La cuota anónima se ancla al primer valor de `x-forwarded-for` (`chat-limits.ts:135-144`): si el borde no reescribe ese header, el límite de 2/día se puede evadir rotando IPs falsas | baja | Anclar a la IP que entrega el borde (`x-vercel-forwarded-for`, `x-real-ip`) y, en su defecto, sumar un límite global por ventana además del por-IP |
| `api/explain-alert/route.ts` | El cliente envía el `alert` completo (título, resumen, payload) y el servidor lo manda al modelo: un atacante puede pedir la "explicación" de un evento inexistente y la respuesta se devuelve bajo la marca de la plataforma (`notice: FINTEC_NOTICE`, fuentes del payload) | **media** | Validar en servidor que el `alert.id` exista en `alerts` (service role) y usar la fila real en vez del payload del cliente; si debe seguir aceptando payloads libres, quitar la marca de plataforma y la atribución de fuente |
| `api/explain-alert/route.ts` | Correcto: Zod, tope de 24 KB de body, cuota compartida con el chat, `safeExplainUrl` (solo https, sin credenciales) y `promptValue` neutraliza `<`/`>` para evitar cierre de delimitador | — (ok) | Ninguno |
| `api/billing/checkout/route.ts` | Correcto: sesión obligatoria, Zod, proveedor fail-closed (503 si faltan claves, nunca cae a mock en producción) | — (ok) | Ninguno |
| `api/billing/checkout/route.ts` | Si falta `NEXT_PUBLIC_SITE_URL`, las URLs de éxito/error/webhook se construyen con `http://localhost:3000` (línea 62) | baja | En producción, fallar con 503 si la variable no está; nunca apuntar el webhook a localhost |
| `api/billing/cancel/route.ts` | Correcto: sesión obligatoria, lectura y update filtrados por `user_id`/`id` del propio usuario | — (ok) | Ninguno |
| `api/billing/webhook/[provider]/route.ts` | Correcto: `mock` bloqueado con 404 antes de leer el body o tocar la base fuera de desarrollo (fail-closed), verificación delegada al proveedor, idempotencia por `event_id` | — (ok) | Ninguno |
| `api/billing/webhook/[provider]/route.ts` | Flow no firma sus webhooks: la validación es consultar la API de Flow con el token del body. Un atacante con un `subscriptionId` válido ajeno puede forzar una resincronización (no cambia el plan: el estado sale de la API) | baja | Exigir que el `provider_subscription_id` exista ya en `subscriptions` **antes** de llamar a la API del proveedor, y rechazar ids desconocidos |
| `api/billing/webhook/[provider]/route.ts` | El `rawBody` crudo del proveedor se guarda en `payment_events.payload` (línea 38 de `lib/billing/process.ts`); la tabla no tiene policy de lectura, pero el dato queda persistido | baja | Guardar solo un hash + los campos normalizados (provider, event_id, status), no el cuerpo completo |

---

## 4. Server actions (`src/app/actions/*.ts`)

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `actions/auth.ts` | `signUp` devuelve `error.message` crudo de Supabase (línea 74): con "User already registered" permite **enumerar cuentas** por correo | **media** | Mensaje genérico ("No pudimos crear la cuenta. Revisa el correo e inténtalo de nuevo.") y log del error real en servidor |
| `actions/auth.ts` | `signIn` sí usa mensaje genérico (línea 29) y `next` pasa por `isSafeNextPath` (anti open-redirect) | — (ok) | Ninguno |
| `actions/auth.ts` | La cookie `ref` (escrita en `proxy.ts:65` desde `?ref=` sin sanear) se copia a `metadata.referred_by` en el alta (línea 64) | baja | Validar el código de referido contra el formato de `referral_codes` (alfanumérico, longitud fija) antes de mandarlo como metadata |
| `actions/settings.ts` | `updateSettings` valida sesión, Zod y frecuencia según plan; escribe con el cliente del usuario (RLS + trigger de columnas) | — (ok) | Ninguno |
| `actions/settings.ts` | `prepareTelegramLink` escribe `telegram_link_code` con el cliente del usuario (línea 87), pero esa columna **no** está en la lista blanca de `protect_profile_columns` (007): el trigger la revierte y el código nunca se persiste, aunque la acción responda "Éxito" | **media** | Generar el código con una RPC `service_role` (como `link_telegram_chat`) en vez de un update del cliente. No resolverlo subiendo la columna a la lista blanca: `telegram_link_code` es una credencial y no debe ser escribible por el cliente |
| `actions/settings.ts` | `updateAlertChannel` valida que Telegram exija plan pago y escribe `alert_channel` (columna sí permitida por el trigger) | — (ok) | Ninguno |
| `actions/holdings.ts` | `saveUserHoldings` valida sesión, Zod (`userHoldingsSchema`, máx. 100) y escribe `user_id = user.id` explícito; RLS `own holdings all` | — (ok) | Ninguno |
| `actions/holdings.ts` | `saveUserHoldings` borra y reinserta en dos pasos sin transacción: un fallo en el insert deja la cartera vacía | baja | Ejecutar en una RPC única (o aceptar la pérdida de datos y avisar en el mensaje de error) |
| `actions/holdings.ts` | `importHoldings` valida tamaño (1 MB), parseo y esquema antes de escribir; `getOverlapForSymbols` usa la RPC `get_symbol_holders`, que ya aplica el muro por plan y premium | — (ok) | Ninguno |
| `actions/alert-rules.ts` | `createAlertRule` valida sesión, Zod, plan (Telegram solo pago) y el tope; la DB lo vuelve a imponer con el trigger de 037 | — (ok) | Ninguno |
| `actions/alert-rules.ts` | `deleteAlertRule` borra por `id` **y** `user_id` (línea 92) y valida UUID | — (ok) | Ninguno |

---

## 5. Paywall: rutas y páginas que sirven holdings o series

| Ubicación | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `app/(dashboard)/compare/page.tsx:20-31` | **Fuga del muro.** `getAllHoldingsAdmin` (service role, `lib/queries.ts:246-259`) lee el libro **completo** de holdings de **todo** el catálogo y el array resultante (`symbol` + `weight` de cada posición) se pasa a `PortfolioManager` y `AlignmentPanel`, que son componentes `"use client"`: el payload RSC lleva la composición íntegra de cada cartera —incluidas las `premium`— al navegador de cualquier usuario con cuenta, incluidos plan free. El muro declarado (anon 5 / free 10 / paid ∞, y premium solo para pro/elite) no se aplica en esta ruta | **alta** | No enviar holdings al cliente: calcular el cruce (o el solape) en el servidor y enviar solo las filas coincidentes ya agregadas; si el cliente los necesita, aplicar el mismo recorte por rol (`HOLDING_LIMITS`) y excluir `premium` para no pagados antes de serializar |
| `lib/queries.ts:229` | En la ruta legacy de `getHoldings`, si el `source` es de declaración pública se devuelven **todos** los holdings sin recortar (línea 229). Es intencional (5 U.S.C. §13107) pero la condición depende de `slugRow.data?.source`, que viene de una consulta no filtrada: si la fila no existe, `source` es `undefined` y cae al recorte (correcto) | baja | Ninguna urgente; conviene un test que fije este comportamiento |
| `app/herramientas/backtest/page.tsx` + `lib/backtest-window.ts` | El recorte de 90 días para no pagados se aplica **solo en el servidor de la app** (`trimSeriesToWindow`). La tabla `portfolio_performance` tiene `performance public read` `using (true)`: cualquiera con la anon key (pública en el bundle) y el UUID del portafolio (público en `/explore`) puede pedir `/rest/v1/portfolio_performance?portfolio_id=eq.<uuid>&select=date,value_pct` y obtener la serie **completa**, incluidos portafolios premium | **media** | Replicar el patrón de 012: quitar la lectura pública de `portfolio_performance` y `portfolio_metrics` y exponer funciones `security definer` que recorten por plan (y excluyan `premium` para no pagados), como ya hace `get_portfolio_holdings` |
| `app/(dashboard)/alerts/page.tsx:53,61-70` | `getAlerts(undefined, 100)` sin rol y, además, un `select` directo sobre `alerts` con `limit(100)`: la tabla es de lectura pública (`is_published = true`), así que `ALERT_LIMITS` (anon 3 / free 10) no existe en la base — un anónimo lee las 100 alertas por REST. Además `alerts-feed.tsx:461-491` y `portfolio/[slug]/page.tsx:524-528` renderizan `alert.summary` (resumen AI) a **todos** los roles: el "Resumen AI disponible en Pro" solo aparece cuando el resumen es `null` | **media** | Mover `summary` a una columna/tabla restringida por plan (o sirve el resumen solo si `current_user_plan() in ('pro','elite')`), y exponer las alertas con un límite por rol en la base, no en la app |
| `app/embed/widget/[tipo]/page.tsx` | Correcto: usa `getHoldings(..., { role: "anon" })` y corta a 5 filas por widget; los widgets de EE.UU. (Form 4, ranking) son datos que la ley exige públicos | — (ok) | Ninguno |
| `app/accion/[symbol]/page.tsx` + `lib/ticker-queries.ts` | Correcto: usa la RPC `get_symbol_holders` (015/019), que recorta por rank/plan y excluye `premium` para no pagados; la ruta admin recalcula el rank en TS y recorta igual (`trimHoldersForRole`) | — (ok) | Ninguno |
| `app/accion/[symbol]/page.tsx:319-334` | `getRelatedSymbols` llama `getHoldings(portfolio.id)` **sin rol** para todo el catálogo: en la ruta legacy devuelve la lista completa (solo se usan símbolos y conteo, no se envía al cliente), pero en la ruta RPC consume la cuota de la función del muro para cada cartera | baja | Pasar el rol explícito y/o resolver los símbolos con una consulta de solo `symbol` |
| `app/portfolio/[slug]/page.tsx` | Correcto: `getHoldings(portfolio.id, { role })` y `getAlerts(..., { role })` recortan **en el servidor**; `PaywallGate` solo enmascara lo que ya no existe en el HTML | — (ok) | Ninguno |
| `app/explore/page.tsx:106,128` | `getAllHoldingsAdmin` se usa solo para contar símbolos y para filtrar por símbolo (agregado, no se envía crudo) | — (ok) | Ninguno. Costo N+1 con service role, a revisar aparte |
| `app/ranking/page.tsx` | Sirve métricas agregadas de todos los portafolios, incluidos premium, sin muro | **media** | Es el mismo problema de M6: si `portfolio_metrics` debe quedar tras el muro, el ranking debe mostrar solo lo que el plan permite, o declarar explícitamente que las métricas agregadas son públicas |

---

## 6. Lo que se verificó y está correcto (para que el orquestador no lo re-revise)

- **Autenticación y autorización de rutas**: `proxy.ts` protege `/dashboard`, `/alerts`, `/settings`, `/compare`; `/portfolio/*`, `/explore`, `/accion`, `/embed/*` y `/herramientas/*` son públicos por diseño y aplican el recorte en el servidor.
- **Comparación de secretos**: `run-pipeline` y `publish/draft` usan `timingSafeEqual` con bucle de largo fijo y devuelven 503 si el secreto no está configurado. Solo `telegram/webhook` se sale del patrón (M4).
- **Funciones `security definer`**: 007, 008, 012, 015, 019 y 037 declaran todas `set search_path = ''` y califican los objetos con `public.`. No hay ninguna función nueva en 024–045 fuera de la 037.
- **`revoke execute`**: `check_chat_quota`, `check_anon_chat_quota`, `link_telegram_chat` y `unsubscribe_by_token` están revocadas para `anon`/`authenticated` y concedidas solo a `service_role`.
- **RLS de las tablas nuevas**: 021, 027–034 y 042 habilitan RLS, crean policy de `select` y **no** crean policy de insert/update/delete → escritura solo por service role. `publish_drafts` (022) va más allá: `revoke all from public, anon, authenticated`.
- **Muro de holdings (012)**: correcto y es el modelo a replicar (M6/M7). `holdings` y `portfolio_snapshots` no tienen lectura pública; las funciones recortan por `auth.uid()`.
- **Zod**: `follow`, `chat`, `explain-alert`, `checkout`, `settings`, `alert-rules`, `user holdings` e `import CSV` validan entrada en servidor.
- **Secretos**: ninguna ruta devuelve keys; `SUPABASE_SERVICE_ROLE_KEY` solo se lee en módulos de servidor (`lib/supabase/admin.ts`, `lib/supabase-admin.ts`, `lib/billing/supabase-admin.ts`) y ninguno se importa desde un componente cliente.
- **Headers**: CSP con `frame-ancestors 'none'` salvo `/embed/*`; HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y `poweredByHeader: false` presentes.
- **`npm run typecheck` y `npm run lint`**: pasan sin errores en esta rama (sin cambios de código).

---

## 7. Riesgos que no se pudieron verificar sin tocar Supabase

1. Si la 012/015/019 están **aplicadas** en la base real: si falta alguna, el muro depende por completo del recorte en la app y toda la superficie REST queda abierta. Es la comprobación #1 antes de producción.
2. Si existen filas en `cl_top_shareholders` con `accionista` persona natural (o sea, 033 aplicada sin 045): hay que anonimizar antes de exponer.
3. Si `alerts.summary` se está llenando para todas las alertas y si `alert_rules` tiene filas con `user_id` de otro usuario (integridad de la 037).
4. Estado de los `default privileges` del schema `public` en el proyecto Supabase: si `anon`/`authenticated` tienen `ALL` por defecto sobre tablas nuevas, el `revoke` explícito de B1 pasa a ser necesario, no opcional.

---

## 8. Orden de aplicación sugerido de los arreglos (propuesta, no aplicada)

1. **A1** — dejar de enviar holdings al cliente en `/compare` (mismo frente que M6: mover el cruce al servidor).
2. **M1** — sacar `043_ocultar_demos_down.sql` de `supabase/migrations/` antes de aplicar nada en la base real.
3. **M2 + M3** — trigger de anonimización en `cl_top_shareholders` y aplicar 045 junto a 033; revisar filas existentes.
4. **M6 + M7** — mover series, métricas y alertas a funciones `security definer` con recorte por plan (patrón 012) y sacar el resumen AI de la lectura pública.
5. **M4, M5, M8, M9, M10** — correcciones puntuales (secret timing-safe, token de baja, validación de alerta en servidor, mensaje genérico en signup, RPC para el código de Telegram).
6. **B1** — `revoke` de escritura en las tablas públicas nuevas, y verificación de `default privileges`.
7. **026 y 034** — decidir si se integran a la línea de migraciones de la rama base.
