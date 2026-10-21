# NOTAS F69 — cliente LLM compartido y filtro de "no recomendación"

Rama: `v2/f69-llm-filtro` (desde `mejoras/integracion`). Sin push.

## Hecho

1. **`src/lib/llm.ts` (nuevo)**
   - `llmConfig()` lee `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` en cada llamada.
     Sin **ambas** devuelve `{ enabled: false, missing: [...] }`. **No hay modelo
     por defecto** (se eliminó `google/gemini-2.0-flash-001` de chat y
     explain-alert).
   - `completeChat({ messages, maxTokens, temperature, signal })` para respuesta
     normal; devuelve texto crudo o `{ ok: false, status, error }`.
   - `streamChat(...)` pide `stream: true` y entrega el `ReadableStream` de
     OpenRouter para reenviarlo como SSE.
   - Timeout interno (25 s completo, 60 s stream) combinado con la señal del
     llamador. Los logs solo muestran el status HTTP: nunca prompts ni claves.
   - `llmUnavailableResponse(...)` responde 503 en español indicando qué
     variable falta.

2. **Rutas migradas**
   - `src/app/api/chat/route.ts`: usa `llmConfig()` + `streamChat()`. El cupo, el
     contexto de portafolio, el guardado en `chat_messages` y las cabeceras SSE
     quedan igual. Ahora sin modelo también responde 503 (antes solo miraba la
     key y respondía 500).
   - `src/app/api/explain-alert/route.ts`: usa `llmConfig()` + `completeChat()`.
     La validación del body sigue primero (400) y luego el chequeo de IA (503),
     antes de tocar Supabase. El resto del flujo (get_alert, cuota, sources)
     no cambia.
   - Se mantiene `normalizeExplanation` y el formato de la respuesta.

3. **`src/lib/advice-filter.ts` (nuevo)**
   - `AI_DISCLAIMER` con el texto exacto pedido.
   - `containsAdvice(text)`: detecta español e inglés (compra/comprar/compre/
     cómpralo, vende/vender/véndelo, mantén/mantener/mantenga, deberías,
     recomiendo/recomendamos, buy/sell/hold, "you should", "we recommend",
     "should buy", etc.). Normaliza tildes y mayúsculas y compara por palabra
     completa: "compraventa", "comprador", "holding", "buyer", "seller" y
     "mantención" **no** se marcan.
   - Reutiliza `containsAdviceImperative` y `normalizeAdviceText` de
     `community.ts` (sin duplicar reglas ni tocar sus tests).
   - `sanitizeAdvice(text)`: si no hay recomendación devuelve el texto intacto;
     si la hay, devuelve `NEUTRAL_ADVICE_REPLACEMENT` + descargo. Es idempotente.
   - **explain-alert** aplica `sanitizeAdvice` a la explicación y agrega el campo
     `disclaimer` (aditivo; `notice` se mantiene).

4. **Tests**
   - `tests/llm.test.ts`: 13 casos. Sin key / sin modelo → 503 en `llmConfig`,
     `completeChat`, `streamChat` y en las rutas `/api/chat` y
     `/api/explain-alert`; usa el modelo de `OPENROUTER_MODEL`; fetch mockeado;
     errores HTTP/red → 502.
   - `tests/advice-filter.test.ts`: 33 casos (18 positivos, 10 falsos positivos,
     5 de `sanitizeAdvice`/descargo).
   - `tests/explain-alert.test.ts`: se agregó `OPENROUTER_MODEL = "test/model"`
     en el setup (antes dependía del default eliminado) y su limpieza.

## Variables de entorno

- `OPENROUTER_API_KEY` (obligatoria para IA).
- `OPENROUTER_MODEL` (obligatoria para IA). **No tiene valor por defecto**;
  `.env.example` quedó con el valor vacío y un comentario para elegir modelo.

No se agregaron flags: F69 es una librería interna que endurece rutas ya
existentes; `MY_PORTFOLIO_ENABLED` y `NEWS_IMPACT_ENABLED` siguen apagadas por
defecto y no se tocan aquí.

## Cómo probar

```bash
npx vitest run --maxWorkers=1 tests/llm.test.ts tests/advice-filter.test.ts tests/explain-alert.test.ts
npm test
npm run lint
npm run typecheck   # falla solo por LayoutProps (peculiaridad Next 16 ya documentada)
```

## Pendientes / deudas

- **Chat y streaming**: no se aplica `sanitizeAdvice` al chat porque habría que
  bufferizar el SSE (o cortar el stream al detectar una recomendación). Queda
  como TODO para una tarea posterior; hoy el chat se apoya solo en el prompt.
- **Edge functions**: `supabase/functions/detect-changes/index.ts` conserva su
  propio default `google/gemini-2.0-flash-001` y su propio fetch; no se tocó
  (fuera del alcance F69). Conviene migrarlo al mismo criterio en otra tarea.
- La UI de `alerts-feed.tsx` aún no muestra el campo `disclaimer`; se puede usar
  el `notice` existente o renderizar el nuevo campo.
- `npm run typecheck` sigue mostrando `Cannot find name 'LayoutProps'` en
  `src/app/layout.tsx` (tipo global generado por Next en build; ver AGENTS.md).
- Revisión legal del texto del descargo y del filtro sigue pendiente antes de
  encender funciones de IA con datos de usuarios.
