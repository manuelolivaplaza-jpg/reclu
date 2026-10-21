# Revisión de seguridad — Mi portafolio + IA (F58–F76)

**Fecha:** 2026-10-21 · **Rama:** `v2/f77-revision-seguridad-portafolio` (desde `mejoras/integracion`)
**Alcance:** migraciones `050`–`053`, `src/app/actions/holdings.ts`, `src/app/actions/portfolio-consent.ts`,
`src/app/api/impact/**`, `src/lib/llm.ts`, `src/lib/chat-advice.ts`, `src/lib/advice-filter.ts`,
`src/lib/news-match.ts`, `src/lib/impact-*.ts`, `src/lib/news-feed.ts`, `src/lib/portfolio-*.ts`,
`src/lib/plans.ts`, `src/lib/queries.ts`, `src/app/(dashboard)/mi-portafolio/page.tsx`,
`src/app/(dashboard)/settings/page.tsx`, `src/app/(dashboard)/compare/page.tsx` y los scrapers
`news_edgar.py`, `news_cmf.py`, `ticker_profile.py`.
**Método:** solo lectura del código. No se tocó Supabase real, no se aplicó ninguna migración, no se cambió
código de producto. Todo lo marcado "no verificado" requiere comprobación contra la base real o contra el
entorno desplegado.

---

## 1. Resumen de severidades

| # | Severidad | Área | Resumen |
|---|-----------|------|---------|
| A1 | **alta** | Borrado de cartera | `delete_my_portfolio()` (053) falla al borrar `user_portfolio_alerts`: es `security invoker` y `authenticated` **no tiene privilegio DELETE** sobre esa tabla → el borrado completo de la cartera aborta y no borra nada |
| A2 | **alta** | Derecho de supresión | Borrar la cartera **no borra `user_impact_requests`**: queda el registro de auditoría de qué noticias consultó el usuario |
| M1 | media | Consentimiento | Con `MY_PORTFOLIO_ENABLED` apagado (por defecto) `saveUserHoldings`/`importHoldings` **no exigen consentimiento**, y `/compare` (siempre activo) escribe la cartera |
| M2 | media | Integridad | `importHoldings` borra la cartera y reinserta **sin validar el tope del plan**: un CSV que excede el límite deja la cartera vacía |
| M3 | media | Borrado | `clearUserHoldings` (botón de `/compare`) borra solo `user_holdings`: deja ajustes, historial de alertas y auditoría |
| M4 | media | Flags | `/api/impact` exige `NEWS_IMPACT_ENABLED` pero **no** `MY_PORTFOLIO_ENABLED`: lee la cartera y manda pesos al LLM con el flag de cartera apagado |
| M5 | media | Prompt injection | `buildImpactPrompt` interpola título/resumen de noticia y pregunta del usuario **sin delimitadores ni escape** (a diferencia de `impact-prompt.ts`) |
| M6 | media | Retención | `purge_old_impact_requests()` **no la invoca nadie**: la auditoría de consultas no se purga a los 90 días como promete la 051 |
| M7 | media | Rate limit | `api/impact` no limita el cuerpo del prompt ni el tamaño de `matches`; el único freno es el cupo de chat |
| B1–B12 | baja | varias | Detalle en las tablas siguientes |

**Verificado y correcto** (no hay que rehacerlo): RLS y grants de las cuatro tablas de cartera,
`summary` de `news_items` no legible por REST, `ai_impact_cache` y `purge_old_impact_requests` solo para
`service_role`, minimización de datos hacia el LLM (solo símbolo + peso %), cupo antes de cada llamada al
modelo, `timingSafeEqual` en las tres rutas con `CRON_SECRET`, flags apagados por defecto en TS y en Python,
filtro "no recomendación" en las cuatro salidas de IA, y noticias sin texto completo (truncadas a 300/500
caracteres en los scrapers).

---

## 2. Migraciones 050–053

### 2.1 `050_mi_portafolio.sql`

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `supabase/migrations/050_mi_portafolio.sql:58` | `revoke all on table public.user_holdings from anon;` revoca de `anon` pero **no de `public`** (el rol `PUBLIC`), a diferencia de `user_portfolio_settings` en la línea 117 de la misma migración (`from public, anon`) y del patrón de `022_publicaciones.sql`. Si el proyecto tiene `default privileges` que otorgan algo al rol `PUBLIC`, la lectura quedaría abierta | **baja** | `revoke all on table public.user_holdings from public, anon;` (idempotente, se puede repetir sin riesgo) |
| `supabase/migrations/050_mi_portafolio.sql:133-157` | `delete_my_portfolio()` es `security invoker` y borra `user_holdings` y `user_portfolio_settings`. Correcto: solo lo que la RLS permite, `search_path = ''` y `revoke` a `public`/`anon` | — (ok) | Ninguno. Es el patrón a replicar en la corrección de A1/A2 |
| `supabase/migrations/050_mi_portafolio.sql:59` | `grant select, insert, update, delete ... to authenticated` sobre `user_holdings`: el usuario puede escribir cualquier columna de su cartera, incluidas `quantity`, `avg_cost` y `broker`. Es correcto (son sus datos y la RLS lo acota a `auth.uid()`), pero la superficie es mayor que la necesaria | baja | Mantener. Si se quiere mínimo privilegio, `grant insert, update, delete (symbol, name, weight, quantity, avg_cost, currency, market, broker, source)`. No urgente |

### 2.2 `051_noticias_impacto.sql`

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `supabase/migrations/051_noticias_impacto.sql:38` | `news_items.title` es `text not null` **sin `check` de longitud**; el único tope es `summary` (500). Hoy los scrapers truncan a 300, pero la base no lo garantiza: un scraper nuevo podría guardar el texto completo de una noticia (derechos de autor) | **baja** | `alter table public.news_items add constraint news_items_title_check check (char_length(title) <= 300);` en una migración idempotente |
| `supabase/migrations/051_noticias_impacto.sql:215-234` | `purge_old_impact_requests()` está bien construida (`security definer`, `set search_path = ''`, `revoke` a `public`/`anon`/`authenticated`, `grant` a `service_role`) pero **ninguna ruta, edge function ni cron la invoca** (verificado con grep en todo el repo: solo aparece en la propia migración). La tabla queda con datos personales de auditoría indefinidamente, contradiciendo el `comment on table` de la línea 190 | **media** | Invocarla desde el job que ya usa `service_role` (por ejemplo `supabase/functions/detect-changes` o un paso de `/api/run-pipeline`), o desde `pg_cron` si el proyecto lo habilita. Alternativa mínima: `cron.schedule('purge-impact', '17 4 * * *', $$ select public.purge_old_impact_requests() $$)` |
| `supabase/migrations/051_noticias_impacto.sql:208-210` | `revoke all ... from public, anon, authenticated` + `grant select, insert on table public.user_impact_requests to authenticated`: el usuario puede insertar filas de auditoría arbitrarias (con `news_id` de cualquier noticia) sin límite de frecuencia. Puede inflar la tabla y falsear su propia traza de consultas | **baja** | Mantener el `insert` (la auditoría se escribe desde el cliente de sesión) pero acotar el crecimiento: dejar la escritura de la auditoría como `security definer` (RPC `log_impact_request`) revocada a `anon`, y topar filas por usuario/día |
| `supabase/migrations/051_noticias_impacto.sql:68-73` | Correcto: `revoke select` a nivel de tabla y `grant select (id, source, url, title, published_at)` por columna → `summary` **no** es legible por REST con la anon key | — (ok) | Ninguno |
| `supabase/migrations/051_noticias_impacto.sql:167-171` | Correcto: `ai_impact_cache` con `revoke all from public, anon, authenticated`, RLS sin policies y `grant all` solo a `service_role`. La caché es genérica (noticia × ticker), sin `user_id` | — (ok) | Ninguno |

### 2.3 `052_limites_portafolio.sql`

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `supabase/migrations/052_limites_portafolio.sql:91-93` | `enforce_user_holdings_limit()` es `security definer` con `set search_path = ''` y califica `public.profiles`/`public.user_holdings` (correcto), pero **no revoca `EXECUTE`** a `public`/`anon`/`authenticated`. El comentario justifica que es una trigger function y que Postgres impide llamarla fuera de un trigger (verdad: error "trigger functions can only be called as triggers"), pero la 046 sí revocó `EXECUTE` de la trigger function equivalente `enforce_alert_rule_limits()` | **baja** | `revoke execute on function public.enforce_user_holdings_limit() from public, anon, authenticated;` — el trigger sigue operando |
| `supabase/migrations/052_limites_portafolio.sql:26-89` | Correcto: el trigger valida `new.user_id = auth.uid()`, serializa con `for update` sobre `public.profiles`, exime a `service_role` y no baja a nadie que ya tenga más posiciones | — (ok) | Ninguno |

### 2.4 `053_alertas_portafolio.sql`

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `supabase/migrations/053_alertas_portafolio.sql:58-59` + `:91-93` | **El borrado de cartera está roto.** `user_portfolio_alerts` recibe `revoke all ... from public, anon, authenticated` y solo `grant select ... to authenticated`. `delete_my_portfolio()` (líneas 68-97) es **`security invoker`**: el `DELETE from public.user_portfolio_alerts` corre con los privilegios del rol `authenticated`, que **no tiene DELETE** sobre esa tabla → `permission denied for table user_portfolio_alerts`. Como las tres elecciones están en el mismo bloque `plpgsql` sin handler, el error aborta la función y **hace rollback de las dos anteriores**: el usuario no puede borrar ni tenencias, ni ajustes, ni alertas. La UI (`deleteMyPortfolio`, `withdrawPortfolioConsent`) muestra "No pudimos borrar tu cartera" | **alta** | Ver §7 (migración 054 propuesta): recrear la función como `security definer` con `set search_path = ''`, calificando `public.*`, filtrando siempre por `auth.uid()`, y `revoke execute` a `public`/`anon` + `grant` a `authenticated` |
| `supabase/migrations/053_alertas_portafolio.sql:91-93` | Aunque se arreglara el privilegio, el `DELETE` sobre `user_portfolio_alerts` seguiría sin filas que borrar: la tabla solo tiene la policy `for select` ("own portfolio alerts read", líneas 51-55) y **ninguna policy de `delete`**. Con RLS activo y sin policy aplicable, la sentencia no afecta filas | **alta** | Incluido en la corrección de A1: la función `security definer` (owner `postgres`, que no es sujeto de RLS) borra las filas del propio usuario por `where user_id = auth.uid()` |
| `supabase/migrations/053_alertas_portafolio.sql:83-95` | `delete_my_portfolio()` borra `user_holdings`, `user_portfolio_settings` y `user_portfolio_alerts`, pero **no `user_impact_requests`**: sobrevive el registro de qué noticias consultó el usuario y con qué canal. La UI promete "Borramos tu cartera (N registros)", y el derecho de supresión de la Ley 21.719 queda incompleto | **alta** | Incluido en la corrección de A1: la función debe borrar también `user_impact_requests` (FK `on delete cascade` a `auth.users` ya cubre el borrado de la cuenta, pero no el de la cartera) |

---

## 3. Server actions

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `src/app/actions/holdings.ts:28` | `portfolioConsentError()` devuelve `null` cuando `MY_PORTFOLIO_ENABLED` está apagado → **no se exige consentimiento para escribir la cartera**. El flag está apagado por defecto y `/compare` está siempre disponible (nav "Mi cartera", línea 23 del layout), por lo que hoy un usuario puede guardar sus posiciones —incluidas `quantity` y `avg_cost` desde `/mi-portafolio`— sin consentimiento registrado. El criterio "el consentimiento se exige en todas las escrituras de cartera" no se cumple en el estado por defecto | **media** | Exigir consentimiento **siempre**, con independencia del flag: `portfolioConsentError()` debe devolver el mensaje de "falta consentimiento" aunque `MY_PORTFOLIO_ENABLED` sea `false`. Alternativa: apagar también `/compare` detrás del flag (`notFound()`) y dejar el consentimiento como única vía de entrada |
| `src/app/actions/holdings.ts:276-291` | `importHoldings` **borra toda la cartera** (línea 276-280) y después inserta (línea 282-291) **sin validar `canAddPositions` antes** (a diferencia de `saveUserHoldings`, que sí lo hace en la línea 177). Si el CSV tiene más posiciones que el tope del plan, el trigger `enforce_user_holdings_limit` (052) aborta el `INSERT` → la cartera queda **vacía** y el usuario pierde sus posiciones. Además el `INSERT` no guarda `quantity`/`avg_cost` (se pierden al importar) ni usa `upsert` | **media** | Validar `canAddPositions(plan, 0, normalized.length, trialEndsAt)` **antes** del `DELETE`; escribir en una sola operación idempotente (RPC `replace_my_holdings`) y conservar `quantity`/`avg_cost` si vienen en el CSV |
| `src/app/actions/holdings.ts:369-381` | `clearUserHoldings()` (botón "Eliminar" de `/compare`) borra **solo** `user_holdings`: deja `user_portfolio_settings` (consentimiento y preferencias), `user_portfolio_alerts` (historial de avisos) y `user_impact_requests` (auditoría). Quedan dos caminos de borrado con alcances distintos y el usuario no sabe cuál us�� | **media** | Que `clearUserHoldings` delegue en la misma RPC `delete_my_portfolio()` (o en una `clear_my_holdings()` que además apague `auto_alerts`), para que exista un único camino de borrado |
| `src/app/actions/holdings.ts:194, 280, 291, 377` | Se devuelve `error.message` crudo de Supabase al cliente en cuatro ramas (borrado, inserción y borrado total). Filtra nombres de tabla y de constraint | **baja** | Sustituir por mensajes genéricos en español y dejar el detalle en `console.warn` (el patrón ya se usa en `portfolio-consent.ts`) |
| `src/app/actions/holdings.ts:208, 288` | Se graba siempre `source: "csv"`, aunque el origen sea el formulario manual. La 050 admite `('csv','manual','cartola')` | **baja** | Pasar `"manual"` desde `PortfolioEditor` y `"csv"` desde la importación |
| `src/app/actions/holdings.ts:157-211` | El borrado de los símbolos retirados (líneas 188-195) y el `upsert` (línea 197) son dos llamadas separadas sin transacción: un fallo del `upsert` deja la cartera incompleta | **baja** | Mover a una RPC transaccional (la misma que resolvería M2) |
| `src/app/actions/holdings.ts:122-217, 225-300` | Correcto: sesión obligatoria, `Zod` (`userHoldingsSchema`, máx. 100), `user_id = user.id` explícito, cliente de sesión (la RLS manda) y `onConflict: "user_id,symbol"` | — (ok) | Ninguno |
| `src/app/actions/portfolio-consent.ts:27-62, 69-117, 123-158, 165-233` | Correcto: todo detrás de `MY_PORTFOLIO_ENABLED`, `useActionState` con `FormState`, confirmación literal `BORRAR`, `consent_version` siempre vigente y `auto_alerts` apagado al retirar el consentimiento. El borrado (líneas 83 y 142) delega en la RPC → hereda el defecto de A1 | — (ok, con A1) | Ninguno aquí; la corrección es de la RPC |
| `src/app/actions/portfolio-consent.ts:216-225` | El `upsert` de `user_portfolio_settings` escribe `auto_alerts`, `min_relevance` y `alert_channel` con el cliente de sesión. Como la tabla tiene `grant insert, update, delete ... to authenticated` y RLS por `auth.uid()`, un cliente REST puede escribir esas columnas **saltándose** `validatePortfolioAlertSettings` (por ejemplo activando `auto_alerts` en un plan Gratis). El job `/api/impact/alerts` revalida plan y consentimiento, así que no hay envío indebido | **baja** | Mover la validación de plan a la base (trigger) o dejar `user_portfolio_settings` sin `insert/update` para `authenticated` y que toda escritura pase por una RPC `security definer` |

---

## 4. Rutas de API (`src/app/api/impact/**`)

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `src/app/api/impact/route.ts:98` | La ruta solo exige `isNewsImpactEnabled()`. Con `NEWS_IMPACT_ENABLED=true` y `MY_PORTFOLIO_ENABLED=false` **sigue leyendo `user_holdings`** (líneas 195-203) y mandando pesos al LLM (líneas 276-291). El consentimiento sí se exige (líneas 136-155), pero el flag que apaga "Mi portafolio" no apaga la vía de IA que trata la cartera | **media** | Exigir ambos flags: `if (!isMyPortfolioEnabled() \|\| !isNewsImpactEnabled()) → 404`. La ruta trata datos de cartera, no solo noticias |
| `src/app/api/impact/route.ts:1-341` | Correcto: `Zod` (`impactRequestSchema`, `question` máx. 500), body máx. 8 KB, sesión obligatoria (401), consentimiento vigente (403), **cliente de sesión** para `user_holdings` (RLS) y para `user_impact_requests`, `service role` solo para `news_items`/`news_tickers`/`ai_impact_cache` (datos públicos o genéricos), `Cache-Control: no-store`, `AI_DISCLAIMER` y `FINTEC_NOTICE` en la respuesta, y `sanitizeAdvice` sobre la respuesta del modelo (línea 301) | — (ok) | Ninguno |
| `src/app/api/impact/route.ts:206-223` | Correcto: la cuota (`enforceSignedInQuota`) se cobra **antes** de la llamada al modelo y solo cuando hay pregunta libre; sin pregunta no hay llamada al LLM ni gasto de cuota (F71). El `503` por falta de modelo se responde antes de consumir cuota | — (ok) | Ninguno |
| `src/app/api/impact/route.ts:279-281` | `matches` se arma con `weight: match.exposurePct` (peso porcentual) — correcto para el LLM. Pero el tamaño del prompt no tiene cota superior: `matches` puede traer hasta 200 símbolos (plan Elite) y cada `analysis` cacheado aporta hasta 1.200 caracteres (`MAX_ANALYSIS_CHARS`), o sea hasta ~250 KB de prompt en una sola llamada, con un `maxTokens` de salida de 600 pero sin tope de entrada | **media** | Acotar el prompt: `matches.slice(0, 20)` y un tope total de caracteres (p. ej. 8.000) antes de `buildImpactPrompt`, con un aviso si se truncó |
| `src/app/api/impact/precompute/route.ts:137-314` | Correcto: `timingSafeEqual` contra `CRON_SECRET` (líneas 43-59), `503` sin secreto configurado (fail-closed), `404` con el flag apagado, `IMPACT_MAX_CALLS` (30) como tope por corrida, salida validada con `Zod` **y** `containsAdvice` antes de cachear (línea 274), y el prompt solo con datos públicos (título, resumen, ticker, perfil curado) | — (ok) | Ninguno |
| `src/app/api/impact/alerts/route.ts:278-688` | Correcto: `timingSafeEqual` contra `CRON_SECRET` (líneas 47-63), `404` con el flag apagado, solo usuarios con `auto_alerts = true` **y** consentimiento de la versión vigente (líneas 353-370), plan revalidado con `isPortfolioAlertEligible`, canal revalidado por plan, deduplicación por `(user, noticia, ticker)`, tope diario por plan (`autoAlertsMaxPerDay`), y **el contenido nunca incluye montos**: solo ticker, título, % de exposición y enlace a la fuente (`portfolio-alerts.ts`) | — (ok) | Ninguno |
| `src/app/api/impact/alerts/route.ts:412-415` | La lectura de carteras usa `service role` con `.in("user_id", userIds)`. Los `userIds` provienen de `user_portfolio_settings` filtrado por consentimiento (líneas 353-387), **no de input del cliente**: cumple el criterio "ninguna ruta usa service role para leer datos de un usuario a partir de input del cliente". Se deja constancia porque es la única ruta que lee carteras ajenas con service role | — (ok, con nota) | Ninguna, pero conviene un test que fije que `userIds` siempre deriva de ajustes consentidos |
| `src/app/api/impact/alerts/route.ts:664` | El tope de correos es **por usuario** (`autoAlertsMaxPerDay`), sin tope global por corrida: con N usuarios Elite el job puede enviar N×20 correos y N×20 mensajes de Telegram en una pasada | **baja** | Añadir un tope global por corrida (p. ej. `MAX_DELIVERIES_PER_RUN = 200`) y loguear los envíos diferidos |
| `src/app/api/impact/precompute/route.ts:138-144` y `src/app/api/impact/alerts/route.ts:279-285` | El check de secreto se hace **antes** del check de flag: con el flag apagado y `CRON_SECRET` sin configurar responden `503` (revelan que falta el secreto) en vez de `404` | **baja** | Invertir el orden: primero el flag (`404`), después el secreto (`503`/`401`) |

---

## 5. Librerías de IA y de noticias

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `src/lib/impact-question.ts:106-130` | `buildImpactPrompt` interpola `title`, `summary` y `question` **sin delimitadores ni escape**: `Noticia: ${title}`, `Resumen: ${summary}`, `Pregunta: ${question}`. El título y el resumen vienen de fuentes externas (SEC/CMF) y la pregunta del cliente: un texto malicioso en cualquiera de los tres puede inyectar instrucciones y desviar la respuesta del modelo. El módulo hermano `impact-prompt.ts:75-77, 120-131` **sí** neutraliza `<`/`>` y delimita con `<noticia>…</noticia>`; el paso B no replica esa protección | **media** | Reusar el patrón de `impact-prompt.ts`: `promptValue()` (escape de `<`/`>` y de caracteres de control) y un bloque delimitado `<noticia>` / `<pregunta>`, más una instrucción explícita de tratar ambos bloques como datos |
| `src/lib/impact-question.ts:58-76` | Correcto: `impactPositions()` proyecta las filas de `user_holdings` a `{symbol, weight}` y descarta a propósito `quantity`, `avg_cost`, `broker` y `name`; el LLM recibe solo símbolo y peso porcentual | — (ok) | Ninguno |
| `src/lib/impact-question.ts:42, 79-93` | Correcto: `MAX_ANALYSIS_CHARS = 1200` acota el análisis cacheado que entra al prompt | — (ok) | Ninguno |
| `src/lib/chat-advice.ts:80-174` | Correcto: acumula la respuesta y evalúa `adviceRule` sobre **todo** el texto recibido (no solo la cola), retiene 80 caracteres antes de emitirlos, reemplaza la respuesta completa si aparece lenguaje de recomendación, emite siempre el descargo y cierra con `[DONE]`. `logAdviceBlock` (líneas 69-74) registra **solo** timestamp, ruta y regla: ni el prompt ni la respuesta del modelo | — (ok) | Ninguno |
| `src/lib/advice-filter.ts:31-86` | La cobertura léxica es parcial: faltan formas habituales de asesorar como "sugerir/sugiero/sugerimos/te sugiero", "conviene", "recomendar/recomendación", "apuesta por", "podrías considerar", "es buena idea". Como el filtro es la **segunda** barrera (la primera es el prompt del sistema), un modelo que phrasing "conviene aumentar la posición" pasa el filtro | **baja** | Ampliar `ADVICE_TOKENS`/`ADVICE_PHRASES` con esas formas y añadir un test por cada una. Alternativa más robusta: validar la salida con un modelo clasificador de "asesoría" |
| `src/lib/llm.ts:54-64, 113-127` | Correcto: sin `OPENROUTER_API_KEY` **y** `OPENROUTER_MODEL` no hay IA (503), la key nunca sale del servidor, los timeouts son internos (25 s / 60 s), y no se registran prompts ni respuestas | — (ok) | Ninguno |
| `src/lib/llm.ts:133-171` | `completeChat` no aplica un tope de caracteres a la respuesta del modelo (queda en `maxTokens`) ni filtra el contenido: cada ruta decide. Correcto hoy, pero si se agrega una ruta nueva hay que repetir el `sanitizeAdvice` a mano | **baja** | Considerar mover el `sanitizeAdvice` al interior de `completeChat` (o a un wrapper `completeSafeChat`) para que sea imposible olvidar el filtro |
| `src/lib/news-match.ts:1-406` | Correcto: función pura, sin red ni base; la relevancia es `confianza × (peso/100) × importancia`; las relaciones visibles las define el plan (`newsRelationsFor`) | — (ok) | Ninguno |
| `src/lib/news-feed.ts:73-126` | Correcto: lee `news_items` con el cliente de sesión y **solo** las columnas públicas (`id, source, url, title, published_at`); `summary` no sale del servidor; `safeHttpUrl` descarta `javascript:`/`data:` | — (ok) | Ninguno |
| `src/lib/portfolio-alerts.ts:212-240, 253-307` | Correcto: el contenido de correo y Telegram no incluye montos (solo ticker, título, % de exposición y fuente), y todo el texto pasa por `escapeHtml`/`escapeAttr` y `safeUrl` (solo http/https) | — (ok) | Ninguno |
| `src/lib/portfolio-flags.ts:13-19` | Correcto: solo el valor exacto `"true"` enciende los flags (mismo criterio que `COMMUNITY_ENABLED`/`API_PUBLIC_ENABLED`) | — (ok) | Ninguno |
| `src/lib/queries.ts:476-493` | `getUserHoldings()` hace `select("*")`: trae `user_id`, `quantity`, `avg_cost` y `broker` al servidor aunque `/compare` solo use `symbol`, `name` y `weight` (mapeo en `compare/page.tsx:48-52`). No hay fuga (la RLS acota al propio usuario), pero es más superficie de la que hace falta | **baja** | `select("symbol, name, weight")` |

---

## 6. Scrapers

| Archivo | Hallazgo | Severidad | Arreglo propuesto |
|---|---|---|---|
| `scrapers/news_edgar.py:60-61, 313-323` | Correcto: `SUMMARY_MAX = 500`, `TITLE_MAX = 300` y `news_record()` corta ambos; el resumen es propio (`"8-K: Item 2.02 …"`), nunca el texto del filing | — (ok) | Ninguno |
| `scrapers/news_cmf.py:42, 171-206` | Correcto: `SUMMARY_MAX = 500`, resumen propio armado con emisor/materia/categoría; no se guarda el documento | — (ok) | Ninguno |
| `scrapers/news_edgar.py:130-133`, `scrapers/news_cmf.py:67-69`, `scrapers/ticker_profile.py:75-77` | Correcto: los tres módulos exig��n `NEWS_IMPACT_ENABLED == "true"` para escribir, y las etapas (`scrapers/stages/news_*.py`, `stages/ticker_profile.py`) cortan antes de ejecutar | — (ok) | Ninguno |
| `scrapers/ticker_profile.py:211-226, 304-311, 356-361` | `symbols_from_user_holdings()` lee con `service role` la columna `symbol` de **todas** las carteras de todos los usuarios y el resultado se imprime en los logs (`"[ticker_profile] faltan en el CSV: …"`) y por stdout con `--missing`. Los tickers son datos de cartera (aunque no identifiquen a la persona) y acaban en logs que pueden|round-veces a terceros o a un proveedor de logs | **baja** | No imprimir la lista completa: loguear solo el **conteo** (`faltan {n}`) y dejar el detalle en un artefacto local fuera del repo; o eliminar la lectura de `user_holdings` y mantener el CSV como única fuente |

---

## 7. Corrección propuesta para A1 y A2 (migración 054, idempotente)

No se aplicó ni se creó el archivo: el alcance de F77 es revisión. El SQL siguiente está listo para
guardarse como `supabase/migrations/054_borrado_cartera_completo.sql` y para aplicarse en el SQL Editor.

```sql
-- ============================================================
-- Migration 054: borrado de cartera completo (F77)
--
-- Corrige dos hallazgos de docs/revision-seguridad-portafolio-2026-10.md:
--   A1: delete_my_portfolio() (053) es security invoker y authenticated no
--       tiene DELETE sobre user_portfolio_alerts -> el borrado abortaba y
--       no borraba nada (ni tenencias ni ajustes).
--   A2: el borrado no incluía user_impact_requests (auditoria de consultas).
--
-- La funcion pasa a security definer con search_path = '' y filtra SIEMPRE
-- por auth.uid(): solo puede borrar filas del usuario autenticado.
-- Revoke a public/anon y grant a authenticated.
--
-- 100% idempotente. No hay vistas públicas ni datos de terceros.
-- ============================================================

create or replace function public.delete_my_portfolio()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_holdings integer := 0;
  v_settings integer := 0;
  v_alerts integer := 0;
  v_requests integer := 0;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return 0;
  end if;

  delete from public.user_holdings where user_id = v_uid;
  get diagnostics v_holdings = row_count;

  delete from public.user_portfolio_settings where user_id = v_uid;
  get diagnostics v_settings = row_count;

  delete from public.user_portfolio_alerts where user_id = v_uid;
  get diagnostics v_alerts = row_count;

  delete from public.user_impact_requests where user_id = v_uid;
  get diagnostics v_requests = row_count;

  return v_holdings + v_settings + v_alerts + v_requests;
end;
$$;

revoke all on function public.delete_my_portfolio() from public;
revoke all on function public.delete_my_portfolio() from anon;
grant execute on function public.delete_my_portfolio() to authenticated;

-- Si la policy de delete se prefiere mantener en la base (por si otra
-- herramienta borra alertas con el cliente de sesion), agregarla:
--
-- drop policy if exists "own portfolio alerts delete" on public.user_portfolio_alerts;
-- create policy "own portfolio alerts delete"
--   on public.user_portfolio_alerts for delete
--   using (auth.uid() = user_id);
```

Notas de aplicación:
- `security definer` requiere que el owner de la función pueda borrar esas filas (en Supabase, el rol
  `postgres` que aplica la migración). Si el owner es otro rol sin `bypassrls`, hay que agregar antes la
  policy de `delete` de la 053.
- El `grant delete` sobre `user_portfolio_alerts` **no** hace falta con `security definer`: el privilegio
  lo tiene el owner de la función.
- Conviene volver a aplicar la 050 y la 053 después de esta para que los bloques `-- ROLLBACK` comentados
  queden alineados con el estado final de la función.

---

## 8. Lo que se verificó y está correcto (para que no se re-revise)

- **RLS de las cuatro tablas de cartera**: `user_holdings` ("own holdings all", `auth.uid() = user_id`),
  `user_portfolio_settings` (select/insert/update/delete del dueño), `user_impact_requests` (select e insert
  del dueño) y `user_portfolio_alerts` (select del dueño) — ninguna tiene lectura pública y ninguna tiene
  policy de escritura para `authenticated`.
- **Grants**: `user_holdings` sin `anon`; `user_portfolio_settings` sin `public`/`anon`;
  `user_impact_requests` y `user_portfolio_alerts` sin `public`/`anon`/`authenticated` (solo `select` /
  `select, insert` / `select`); `ai_impact_cache` solo `service_role`.
- **`news_items.summary` no es legible por REST**: se revoca el `select` de tabla y se re-otorga por columna
  (`id, source, url, title, published_at`). Por eso `/api/impact` lee la noticia con `service role`: es
  deliberado y está acotado a datos públicos.
- **Service role**: solo se usa para datos públicos o genéricos (`news_items`, `news_tickers`,
  `ticker_profile`, `ai_impact_cache`), para jobs autenticados por `CRON_SECRET` y para el contador de
  `api_keys`. Ninguna ruta lee cartera de un usuario a partir de input del cliente: `user_holdings` se lee
  con el cliente de sesión (RLS) o con un `userIds` derivado de ajustes ya consentidos.
- **Minimización hacia el LLM**: al modelo solo viajan símbolo y peso **porcentual**, más el título y el
  resumen corto de la noticia, el análisis genérico cacheado y la pregunta del usuario. Nunca viajan
  cantidades, costos, valor de la posición, moneda, corredora, nombre, correo ni `user_id`.
- **Cupo y límites**: `enforceSignedInQuota` (RPC `check_chat_quota`) antes de cada llamada al modelo en
  `/api/impact`; `IMPACT_MAX_CALLS` (30) por corrida en el precompute; tope diario por plan en las alertas
  automáticas; `MAX_BODY_BYTES` (8 KB) y `question` de 500 caracteres en la ruta de IA.
- **Secretos**: `timingSafeEqual` (`src/lib/safe-compare.ts`) en las tres rutas con `CRON_SECRET`
  (`run-pipeline`, `impact/precompute`, `impact/alerts`), todas con `503` si el secreto no está configurado
  (fail-closed) y `401` si no coincide. Ninguna devuelve el secreto ni mensajes internos del proveedor.
- **Flags apagados por defecto**: `isMyPortfolioEnabled()` / `isNewsImpactEnabled()` exigen el valor exacto
  `"true"`; `.env.example` los trae en `"false"`; los tres scrapers de noticias exigen lo mismo.
- **Consentimiento**: `consent_at` + `consent_version` vigente (constante `PORTFOLIO_CONSENT_VERSION`), con
  constraint en la base que impide `consent_at` sin versión; el consentimiento se exige en `/mi-portafolio`
  (no se leen las tenencias sin él), en `saveUserHoldings`, en `importHoldings` y en `updatePortfolioAlerts`
  para encender alertas (con la excepción de M1: el flag apagado lo desactiva).
- **Borrado**: `deleteMyPortfolio` exige escribir `BORRAR`; `withdrawPortfolioConsent` borra la cartera,
  deja `consent_at`/`consent_version` en `null` y `auto_alerts` en `false`.
- **Filtro "no recomendación"**: aplicado en las cuatro salidas de IA — `/api/chat` (`filterChatAdvice`),
  `/api/explain-alert` (`sanitizeAdvice`), `/api/impact` (`sanitizeAdvice`) y `/api/impact/precompute`
  (`containsAdvice` antes de cachear). El descargo (`AI_DISCLAIMER`) y el aviso Fintec viajan en cada
  respuesta.
- **Noticias**: no se guarda el texto completo. `news_items.summary` tiene `check (char_length(summary) <= 500)`
  y los scrapers truncan título a 300 y resumen a 500 con resúmenes propios. (Pendiente el `check` del
  título: B2.)
- **Verificación de la rama**: `npm run lint`, `npm test` y `npm run typecheck` pasan en esta rama (sin
  cambios de código de producto).

---

## 9. Riesgos que no se pudieron verificar sin tocar Supabase

1. Si las migraciones **050, 051, 052 y 053 están aplicadas** en la base real. En particular, si la 053 está
   aplicada, el borrado de cartera está roto (A1) y hay que aplicar la 054 antes de anunciar la función.
2. Si los `default privileges` del schema `public` conceden algo al rol `PUBLIC` o `ALL` a `anon`/
   `authenticated` sobre tablas nuevas: de eso depende la残余 lectura de `user_holdings` (B1) y el
   `revoke` de escritura de las tablas de noticias.
3. Si el owner de las funciones de la base es un rol con `bypassrls` (necesario para la 054 en modo
   `security definer`).
4. Si existe en el despliegue `OPENROUTER_MODEL` con sufijo `:free`: el documento legal (§9 de
   `docs/mi-portafolio-ia.md`) warns que con modelos `:free` el proveedor puede usar los datos para
   entrenar, y eso no debería permitirse en el paso B (datos del usuario).
5. Cuántos usuarios tienen `auto_alerts = true` y `consent_at` vigente: es lo que determina el volumen de
   correos y el riesgo de la falta de tope global por corrida (B de `api/impact/alerts`).
6. Si `CRON_SECRET` está configurado en el entorno de Vercel (si no, `precompute` y `alerts` responden `503`
   y no hacen nada —fail-closed, pero conviene confirmarlo).

---

## 10. Orden de aplicación sugerido de las correcciones (propuesta, no aplicada)

1. **A1 + A2** — migración 054 (§7): el borrado de cartera vuelve a funcionar y borra también la auditoría.
2. **M1** — exigir consentimiento en las escrituras de cartera con independencia del flag, o apagar
   `/compare` detrás de `MY_PORTFOLIO_ENABLED`.
3. **M2** — validar el tope del plan antes de borrar en `importHoldings` y escribir en una RPC transaccional.
4. **M3** — unificar el camino de borrado (`clearUserHoldings` → `delete_my_portfolio`).
5. **M4** — exigir `MY_PORTFOLIO_ENABLED` en `/api/impact`.
6. **M5** — escapar y delimitar el prompt del paso B (`impact-question.ts`).
7. **M7** — acotar el tamaño del prompt de `/api/impact` (`matches` y caracteres totales).
8. **M6** — invocar `purge_old_impact_requests()` desde un job con `service_role`.
9. **B1, B2, B3, B6** — `revoke` a `public` en `user_holdings`, `check` de longitud en `news_items.title`,
   `revoke execute` de `enforce_user_holdings_limit()`, `select` explícito en `getUserHoldings`.
10. **B4, B5, B7, B8, B9, B10, B11, B12** — topes de auditoría, cobertura léxica del filtro, logs del
    scraper, `source` de las posiciones, mensajes de error genéricos, orden de los checks de flag y secreto,
    tope global de envíos y limpieza de mensajes crudos.
