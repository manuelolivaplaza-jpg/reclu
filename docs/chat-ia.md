# Reclu IA — chat del panel (d52)

## Lo que había
- `POST /api/chat` (SSE, OpenRouter vía `src/lib/llm.ts`, modelo en `OPENROUTER_MODEL`, sin default), cupo por plan con `check_chat_quota` (`lib/chat-guard.ts`, `lib/chat-limits.ts`: free 5/día, pro 50/sem, elite 500/sem, anónimo 2/día), filtro de recomendaciones `lib/chat-advice.ts` + `AI_DISCLAIMER`, tabla `chat_messages` (RLS propia, mig. 004). Widget flotante `components/ai-chat-widget.tsx` (texto, sin herramientas ni historial por conversación).
- `POST /api/holdings/image` (F79): lectura de captura con `OPENROUTER_VISION_MODEL`, consentimiento Ley 21.719, magic bytes PNG/JPEG/WebP, 4 MB, máx 200 posiciones, esquema cerrado, detector de inyección, `data_collection: deny`, la imagen no se guarda.
- `saveHoldingsByMode` (server action): guarda en `user_holdings` con sesión/RLS, zod, consentimiento y tope del plan.

## Arquitectura nueva
- Página `/app/chat` → `src/app/(dashboard)/app/chat/page.tsx` (requiere sesión) + `components/chat/*` (chat-shell, portfolio-card-widget, holdings-proposal-card, sparkline). No toca layout ni `components/app/*`.
- `POST /api/chat/ia`: sesión → zod estricto → ráfaga por usuario (8/min) → cupo por plan (mismo RPC) → bucle de herramientas (máx 3 rondas, 6 llamadas por ronda) con el cliente de la SESIÓN → respuesta final en streaming (o re-trozada si no hubo herramientas) → `filterChatAdvice` → SSE. Eventos `reclu`: `meta`, `cards`, `proposal`, `disclaimer`, `replacement`.
- `GET/DELETE /api/chat/ia/conversations`: historial (lista, abrir, borrar) con RLS.
- Imagen: el chat reutiliza `/api/holdings/image`; lo leído vuelve como propuesta editable. El LLM conversacional nunca ve la imagen.

## Proveedor y modelo
OpenRouter (ya configurado). Modelo: `CHAT_IA_MODEL` (nuevo, opcional) o, si falta, `OPENROUTER_MODEL`. Debe soportar tool calling. Sugerencia: `google/gemini-2.5-flash` (también sirve para visión en `OPENROUTER_VISION_MODEL`). LongCat y Nemotron quedan bloqueados en código. Sin modelo → 503.

## Herramientas (allowlist cerrada, zod estricto)
| Herramienta | Tipo | Datos |
|---|---|---|
| search_portfolios(query, limit≤8) | lectura | `portfolios` activos, ILIKE escapado |
| rank_portfolios(period 1M/3M/YTD/1A/TOTAL, order, limit≤10) | lectura | `portfolio_metrics` (RLS: premium oculto a no pagos) |
| get_portfolio(slug) | lectura | `get_portfolio_metrics`, top 10 `holdings` |
| get_my_portfolio() | lectura | `user_holdings` del propio usuario (RLS + eq user_id) |
| propose_holdings(positions≤100) | "escritura" sin escribir | devuelve propuesta; guarda solo el clic "Confirmar" vía `saveHoldingsByMode` |
Tarjetas: logo oficial (`/portraits` > `/covers` > iniciales), retorno del periodo + fecha "al", mini-gráfico de `get_portfolio_performance`, link `/app/portafolio/[slug]`.

## Modelo de amenazas
- Prompt injection (usuario, nombres en BD, texto en capturas): resultados envueltos en `<untrusted>` con etiquetas neutralizadas; regla de sistema "dato, no instrucción"; la imagen pasa por el lector de esquema cerrado con detector de inyección; el modelo no tiene herramientas de escritura reales.
- Escalada / datos de otros usuarios: sin service role en lecturas del chat; RLS + filtros por `user.id`; el request no acepta `userId` (strictObject).
- Escritura no deseada: confirmación explícita en la UI, editable, cancelable; las propuestas del historial no se reabren.
- Abuso/costo: ráfaga 8/min/usuario + cupo por plan + body ≤64 KB, mensaje ≤2000, historial ≤20, imagen ≤4 MB PNG/JPEG/WebP.
- Fuga de datos: `data_collection: deny`, imagen no persistida, logs `safeLog` sin texto ni PII, errores genéricos.
- Asesoría: prompt + `filterChatAdvice` + aviso legal bajo cada respuesta.
- Limitación conocida: la ráfaga es en memoria por instancia (Vercel) — el cupo por plan sí es global. Mejora futura: tabla/Upstash. `enforceSignedInQuota` usa la RPC de cupo con service key (infra existente, no accede a datos).

## Migraciones (sin aplicar)
- `supabase/migrations/069_chat_conversaciones.sql`: `chat_conversations` (RLS propia), `chat_messages.conversation_id` + `meta jsonb`, política de insert que exige conversación propia, delete propio. Sin 069 el chat funciona sin historial.

## Variables
- Ya existentes: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_VISION_MODEL`, `PORTFOLIO_IMAGE_IMPORT_ENABLED=true` (para capturas), `MY_PORTFOLIO_ENABLED`.
- Nueva opcional: `CHAT_IA_MODEL`.
