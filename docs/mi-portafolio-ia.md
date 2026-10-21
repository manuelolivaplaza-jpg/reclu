# Mi portafolio + impacto de noticias con IA (plan, F58+)

Revisado en la rama `mejoras/integracion` (worktree C:\reclu-work\integracion, commit e58bf09), el 2026-10-20. Solo se leyó código: no se cambió nada.

## 1. Qué ya existe (verificado) y qué se reutiliza
| Pieza | Dónde | Uso |
|---|---|---|
| Tenencias del usuario | `public.user_holdings` (schema.sql:148): symbol, name, **weight 0–100**, source manual/csv. RLS `own holdings all` (auth.uid() = user_id) | Base. **No guarda cantidad ni precio promedio**, así que hace falta migración |
| Guardar tenencias | `src/app/actions/holdings.ts` `saveUserHoldings` (reemplaza todo: borra y luego inserta) | Se reutiliza, pero hay que extenderlo |
| Importación CSV (F45) | `src/lib/import-holdings.ts` (Papa Parse + Zod, 100 filas máx., 1 MB, encabezados es/en) | Se reutiliza; hoy convierte cantidad→peso |
| Alineación con carteras seguidas | `src/lib/alignment.ts`, `alignment-panel.tsx`, `/compare` (`src/app/(dashboard)/compare/page.tsx`) | Vista "tu cartera vs Pelosi/Buffett" |
| Cliente LLM | `src/app/api/chat/route.ts` (SSE) y `src/app/api/explain-alert/route.ts`: fetch directo a OpenRouter, modelo `OPENROUTER_MODEL` o por defecto `google/gemini-2.0-flash-001`. Sin key responde 503 | Mismo patrón; conviene extraer `src/lib/llm.ts` |
| Cupo de IA | `check_chat_quota` (migración 004) y `src/lib/chat-guard.ts`. Plan: Gratis 5/día, Pro 50/semana, Elite ilimitado (`src/lib/plans.ts`) | Las consultas de impacto descuentan de este cupo o de uno propio |
| Alertas | `alerts`, `alert_rules` (037), `alert-routing.ts`, edge function `send-alerts` (Resend), Telegram (`api/telegram/webhook`, 047), `get_alerts` y vista `alerts_public` (048) | Canal para la alerta automática |
| Newsletter / publicación | `src/lib/publish/*` (newsletter, weekly, telegram-channel, X con flags OFF) | Puede llevar un resumen semanal opcional |
| Precios | `scrapers/prices.py`: Yahoo Finance chart v8, gratis y sin key, EOD, tabla `prices` | Valorización y P&L |
| "Noticias" que hay hoy | `cl_material_events` (032, hechos esenciales CMF, diario), `mentions` (014, Trump/Musk dice), Polymarket (030), dividendos CL (031), recompras (029), insiders (016), spinoffs (028) | Primeras fuentes de eventos con ticker |
| X | `src/lib/publish/x-read.ts`: Bearer de solo lectura para un tweet por id | **No** sirve como feed de noticias |
| Corredoras CL (044) | Solo inserta dos **portafolios** (BICE y MBI recomendadas, `broker_cl`). **No** es una tabla `corredoras_cl` de cuentas ni de cartolas | Sirve solo como lista de nombres de corredoras |

**Lo que NO existe:** cantidad y precio promedio por posición, un feed general de noticias (Reuters, Bloomberg, DF o similar), un mapeo de sector, proveedores o competidores, el parser de cartolas, la caché de respuestas de IA y un plan o cupo específico para "impacto".

## 2. Modelo de datos (migración 050_mi_portafolio.sql)
- `user_holdings`: añadir `quantity numeric(20,6)`, `avg_cost numeric(20,6)`, `currency text default 'USD'`, `market text` ('US' o 'CL') y `broker text`, y ampliar el check de `source` a `('csv','manual','cartola')`. Mantener `weight` para no romper alignment; si hay precio, se calcula. RLS: se mantiene la existente; además, `revoke` a anon y nada de vistas públicas.
- `news_items` (id, source, url, title, summary, published_at, lang, hash unique). Lectura pública solo de título y URL; se escribe con service role.
- `news_tickers` (news_id, symbol, relation 'direct'|'sector'|'supplier'|'competitor'|'macro', confidence).
- `ticker_profile` (symbol, sector, industry, country, peers text[], suppliers text[], macro_factors text[]). Se llena a mano o con un scraper.
- `ai_impact_cache` (news_id, symbol, model, prompt_version, analysis jsonb, created_at; PK (news_id, symbol, prompt_version)). **Sin user_id**: el análisis es genérico por noticia×ticker y no contiene datos del usuario. Solo service role.
- `user_impact_requests` (id, user_id, news_id, created_at, delivered_via). RLS propia (auth.uid() = user_id). Se usa para cupo y auditoría y se borra a los 90 días.
- `user_portfolio_settings` (user_id PK, auto_alerts bool default false, min_relevance, consent_at timestamptz). El consentimiento es explícito.

## 3. Carga de posiciones
1. **A mano**: formulario ticker, cantidad y precio promedio, con autocompletado desde `prices` y `holdings`.
2. **CSV**: extender `parseHoldingsCsv` con columnas opcionales `precio_promedio`/`avg_cost` y `moneda`.
3. **Cartola de corredora** (PDF o XLSX): parsers por corredora (por ejemplo BICE, Santander, Fintual, Racional). **Hipótesis**: los formatos no se verificaron y hacen falta cartolas reales de ejemplo, anonimizadas. El PDF se procesa en memoria y **no se guarda**.
4. Nunca se pide la clave de la corredora (no hay scraping con login).

## 4. Fuentes de noticias y precios
Ya verificadas en el repo: Yahoo chart (precios EOD), hechos esenciales CMF, menciones, insiders, recompras, dividendos CL y Polymarket.
Candidatas (**hipótesis, no verificadas**; revisar términos y límites):
- RSS de Yahoo Finance por ticker (`feeds.finance.yahoo.com/rss/2.0/headline?s=`), gratis, con términos dudosos.
- SEC EDGAR 8-K, con feed atom oficial y gratis.
- Finnhub company-news (free tier, unas 60 llamadas por minuto).
- Alpha Vantage NEWS_SENTIMENT (free, muy limitado).
- GDELT (gratis, macro y global).
- RSS de DF, La Tercera Pulso y Emol Economía para Chile (revisar términos de uso; guardar solo título, link y extracto).
- Banco Central de Chile y FRED para macro (tasas, IPC, dólar), con API gratis.
Regla: guardar solo título, URL y un resumen propio corto, sin texto completo (derechos de autor).

## 5. Qué noticias afectan qué tickers
1. **Directo**: tickers que trae la fuente (Finnhub y Yahoo los traen), la entidad CMF→nemotécnico (ya existe `resolve_tickers.py`) o el CIK de EDGAR. Confianza alta.
2. **Sector**: `ticker_profile.sector` (de Yahoo quoteSummary o carga manual, hipótesis). Una noticia sectorial se asocia a todos los tickers del sector. Confianza media.
3. **Proveedores y competidores**: `peers` y `suppliers` curados a mano para el top 200 de tickers en `user_holdings`, o extraídos con LLM una vez por ticker y revisados. Confianza baja-media.
4. **Macro**: clasificador por palabras clave y LLM barato (tasas, cobre, litio, dólar/CLP, petróleo, aranceles) → `macro_factors` del perfil (por ejemplo, SQM→litio, CHILE→tasas). Confianza baja.
5. Relevancia = confianza × peso de la posición × importancia de la noticia. Solo se alerta sobre lo directo o lo que tenga relevancia ≥ umbral.

## 6. Prompt y flujo de IA
**Paso A, genérico y cacheado** (noticia×ticker): una vez por par, en un job. El prompt (system) dice: "Eres un analista que explica información. No recomiendes comprar, vender ni mantener. Responde en JSON: {resumen, canal_de_impacto, direccion_posible: 'positiva'|'negativa'|'mixta'|'incierta', horizonte, incertidumbre, que_mirar}". El input es solo el título, el extracto, el ticker y el perfil.
**Paso B, personalizado** (al pulsar "pregunta a la IA"): se arma **en código, sin LLM**, combinando el paso A con el peso de cada posición. La exposición se calcula sin LLM: "esta noticia toca el 23% de tu cartera". Solo si el usuario hace una pregunta libre se llama al LLM con pesos en %, **sin montos ni nombre** (minimización).
**Costo** (estimación; precios de OpenRouter no verificados hoy): 600 tokens de entrada + 250 de salida. Con `gemini-2.0-flash` (el default actual) cuesta alrededor de US$0,0002 por llamada; con modelos `:free` de OpenRouter cuesta 0, pero con límites de tasa y sin garantía para producción. Por la caché, el costo crece con la cantidad de noticias × tickers distintos, no con la cantidad de usuarios.
**Límites**: se reutiliza `check_chat_quota` y cada consulta de impacto cuesta 1. Las alertas automáticas no descuentan cupo pero tienen tope por plan (abajo).

## 7. Pantallas
- `/mi-portafolio`: tabla de posiciones (cantidad, costo, precio, P&L, peso), importar (CSV o cartola) y editar.
- Pestaña "Noticias que te tocan": feed ordenado por relevancia, con chips directo/sector/macro, el % de la cartera expuesto y el botón "Pregunta a la IA".
- Drawer de análisis con descargo fijo y fuente.
- Ajustes: activar alertas automáticas, umbral, canal (email/Telegram), consentimiento y "borrar mi portafolio".
- Reutilizar `/compare` con "tu cartera vs X".

## 8. Planes (propuesta; Manu decide)
| | Gratis | Pro ($12.990) | Elite ($16.990) |
|---|---|---|---|
| Posiciones | 10 | 50 | 200 |
| Carga | manual + CSV | + cartola | + cartola multi-corredora |
| Feed de noticias que te tocan | solo directas, con 24 h de retraso | directas + sector, al día | + proveedores, competidores y macro |
| "Pregunta a la IA" | dentro de las 5/día del chat | dentro de las 50/semana | ilimitado |
| Alertas automáticas | no | resumen diario (email/Telegram) | tiempo real, hasta 20/día |
| P&L con precios | sí (EOD) | sí | sí + exportar CSV |

## 9. Riesgos legales
- **Ley Fintec (21.521) / CMF**: la "asesoría de inversión" personalizada está regulada. Mitigación: lenguaje descriptivo, prohibir en el prompt y en un filtro de salida palabras como "compra", "vende", "mantén" o "deberías", no proponer pesos objetivo y no ejecutar órdenes. Descargo en cada respuesta: *"Información general generada por IA a partir de noticias públicas. No es una recomendación de inversión ni asesoría personalizada. Puede contener errores. Decide por tu cuenta o consulta a un asesor registrado en la CMF."* **Necesita revisión de un abogado antes de lanzar**, porque analizar la cartera del usuario se acerca a lo personalizado.
- **Datos personales (Ley 21.719, vigente desde dic-2026)**: las tenencias son datos financieros, que conviene tratar como sensibles. Se necesita consentimiento explícito (`consent_at`), finalidad limitada, RLS por usuario, no enviar montos ni identidad al LLM, no guardar la cartola, borrado a petición, actualizar `/privacidad` y declarar a OpenRouter y al proveedor del modelo como encargados con transferencia internacional. Con modelos `:free` el proveedor puede usar los datos para entrenar, así que **no se deben usar `:free` para el paso B con datos del usuario**.
- **Derechos de autor**: no republicar notas completas.
- **Alucinaciones**: siempre citar la fuente, mostrar la confianza y nunca inventar cifras.

## 10. Tareas F58+ (cortas, una por agente)
| ID | Tarea | Depende | Archivos | Primer paso |
|---|---|---|---|---|
| F58 | Migración 050: columnas quantity/avg_cost/currency/market/broker y `user_portfolio_settings` con RLS + test | — | supabase/migrations/050_mi_portafolio.sql, scrapers/tests/test_migracion_050.py | Copiar el estilo de 048 y su test |
| F59 | Migración 051: news_items, news_tickers, ticker_profile, ai_impact_cache, user_impact_requests + RLS + test | — | 051_noticias_impacto.sql, test | Definir grants (anon solo titular/URL) |
| F60 | Extender validación y `saveUserHoldings` (cantidad, costo, upsert en vez de delete+insert) | F58 | src/lib/validation.ts, src/app/actions/holdings.ts, tests | Test que falle con quantity |
| F61 | CSV con precio promedio y moneda | F60 | src/lib/import-holdings.ts, tests | Agregar alias de columnas |
| F62 | Página `/mi-portafolio` (tabla, form, P&L con `prices`) | F60 | src/app/(dashboard)/mi-portafolio/page.tsx, components | Leer el layout de /compare |
| F63 | Encolar símbolos de user_holdings en prices.py (`PRICE_SYMBOLS` dinámico) | F58 | scrapers/prices.py, run_all.py | Función `symbols_from_user_holdings` en dry-run |
| F64 | Scraper de noticias EDGAR 8-K → news_items/news_tickers | F59 | scrapers/news_edgar.py + test | Fixture de feed atom |
| F65 | Adaptador hechos CMF → news_items (reutiliza cl_material_events) | F59 | scrapers/stages/news_cmf.py | Mapeo entidad→nemo con resolve_tickers |
| F66 | Scraper RSS Yahoo/Finnhub (detrás de flag; verificar términos primero) | F59, decisión de Manu | scrapers/news_rss.py | Verificar los términos y anotarlos |
| F67 | `ticker_profile` (sector + peers) para el top N de tickers de usuarios | F59 | scrapers/ticker_profile.py, data/peers_manual.csv | CSV manual de 50 tickers |
| F68 | Matcher noticia→tickers (directo/sector/peer/macro) y relevancia, función pura | F59, F67 | src/lib/news-match.ts (o py) + tests | Tests con 10 casos |
| F69 | `src/lib/llm.ts` compartido (extraído de chat y explain-alert) + filtro de salida "no recomendación" | — | src/lib/llm.ts, src/lib/advice-filter.ts, tests | Mover el fetch de OpenRouter sin cambiar el comportamiento |
| F70 | Job de análisis genérico cacheado (paso A) | F68, F69 | src/app/api/impact/precompute/route.ts (CRON_SECRET) | Prompt v1 + JSON schema con Zod |
| F71 | Endpoint "Pregunta a la IA" (paso B, cupo, descargo) | F70, F62 | src/app/api/impact/route.ts | Reusar check_chat_quota |
| F72 | Feed "Noticias que te tocan" + drawer | F71 | components/impact-feed.tsx | Mock con datos fijos |
| F73 | Alertas automáticas (send-alerts + Telegram, límites por plan) | F71 | supabase/functions/send-alerts, alert-routing.ts | Nuevo tipo de alerta `portfolio_news` |
| F74 | Límites por plan en plans.ts (posiciones, alertas, profundidad) | — | src/lib/plans.ts, migración 008 espejo | Agregar campos al PlanConfig |
| F75 | Privacidad: consentimiento, borrar portafolio, texto en /privacidad y /disclaimer | F58 | privacidad/page.tsx, settings | Texto con borrador para el abogado |
| F76 | Parser de cartola (1 corredora piloto) | F60, cartola de ejemplo | src/lib/cartolas/<corredora>.ts | Pedir a Manu una cartola anonimizada |
| F77 | Revisión de seguridad (RLS, sin fuga al LLM, rate limit) | F71, F73 | — | Checklist como XSEC |
Total: **20 tareas (F58–F77)**. Ruta crítica: F58→F60→F62 y F59→F67→F68→F70→F71→F72/F73.

## 11. Preguntas para Manu
1. ¿Límites y profundidad por plan como en la tabla 8?
2. ¿Qué fuentes de noticias usamos (EDGAR+CMF gratis seguro; Yahoo RSS/Finnhub/medios chilenos tienen términos dudosos)? ¿Pagar alguna API?
3. ¿Qué corredora va primero para la cartola, y puedes conseguir una cartola de ejemplo?
4. ¿Modelo para producción: `gemini-2.0-flash` pagado (centavos) o `:free` (no recomendado con datos de usuarios)?
5. ¿Revisión de un abogado (Fintec + datos personales) antes del lanzamiento?
6. ¿Las alertas automáticas parten apagadas (opt-in)? Se recomienda que sí.
