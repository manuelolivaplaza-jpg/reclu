# NOTAS F69B — filtro de recomendación en el chat (streaming)

## Hecho

### Descargo legal (§2.2 del informe)
- Nuevo módulo `src/lib/ai-disclaimer.ts` con el texto exacto del informe legal.
  `advice-filter.ts` lo importa y lo **reexporta** como `AI_DISCLAIMER` (la API
  existente de las rutas no cambia).
- `tests/advice-filter.test.ts` actualizado al texto nuevo.
- `/api/explain-alert` sigue devolviendo `disclaimer: AI_DISCLAIMER` y
  `sanitizeAdvice(explanation)`.

### Filtro del chat
- `src/lib/chat-advice.ts`: `filterChatAdvice(upstream, { route, onComplete,
  holdBackChars })`.
  - Acumula el texto del modelo y lo revisa con `adviceRule` en cada delta.
  - Retiene los últimos 80 caracteres antes de reenviar: una recomendación se
    detecta antes de que sus palabras lleguen al cliente.
  - Si salta una regla: deja de reenviar, descarta el texto retenido y emite un
    evento `reclu` de **replacement** con `NEUTRAL_ADVICE_REPLACEMENT`.
  - En una respuesta limpia: reenvía el texto y emite un evento `reclu` de
    **disclaimer** con `AI_DISCLAIMER`.
  - Siempre cierra con `data: [DONE]`.
  - Los tokens de contenido mantienen la forma OpenRouter
    (`choices[0].delta.content`), así que clientes viejos no se rompen; los
    eventos `reclu` son aditivos.
  - `onComplete` recibe el texto visible final **sin descargo** para persistir
    en `chat_messages` (el descargo lo pinta la UI).
- `src/app/api/chat/route.ts`: elimina `createAssistantCapture` y usa
  `filterChatAdvice`; el descargo y el reemplazo van como eventos aparte.
- System prompt: ya no dice "experto en inversiones". Se describe como
  asistente que explica datos públicos y que **no da recomendaciones de compra,
  venta ni mantención**.

### Logs de bloqueo
- `logAdviceBlock(route, rule)` emite `console.warn("[reclu] advice-filter
  blocked", JSON.stringify({ ts, route, rule }))`.
- Se usa en `/api/chat` y en `/api/explain-alert`.
- No se registra el texto del usuario ni el del modelo: `rule` es solo el
  identificador del patrón (`imperative`, `phrase:...`, `token:...`).

### UI
- `src/components/ai-chat-widget.tsx`:
  - Parsea los eventos `reclu`: `replacement` reemplaza por completo lo ya
    emitido (así no queda el fragmento con la recomendación); `disclaimer` se
    ignora porque se pinta fijo.
  - El descargo fijo aparece bajo **cada** respuesta del asistente (también
    durante el streaming y en el historial).

### Tests
- `tests/chat-advice.test.ts` (5 tests, stream mockeado, sin red):
  - texto limpio pasa completo + descargo;
  - "te recomiendo comprar" se corta y se reemplaza;
  - recomendación tras un preámbulo largo no se reenvía;
  - el log trae ruta/regla y no el texto;
  - se mantiene el formato delta.
- `tests/llm.test.ts`: 2 tests de integración de `POST /api/chat` con SSE
  mockeado (limpio con descargo / recomendación reemplazada).
- `tests/advice-filter.test.ts`: descargo §2.2 y `adviceRule`.

## Verificación
```
npm run lint        OK
npm run typecheck   OK
npm test            OK (67 archivos, 805 tests)
```
No se corrió `next build` ni `npm run dev` (lo hace el orquestador).
No se tocó Supabase real ni `.env*`. No hay push.

## Pendiente / a revisar
- `scrapers/data/v2/F69B/` no existe en este worktree; no había fixtures que
  usar. Los tests usan streams sintéticos.
- El detector de F69 es conservador por diseño: `ADVICE_TOKENS` incluye
  `compra`/`vende`, así que frases informativas como "la compra de acciones
  aumentó" también bloquean el chat. No se cambió el criterio (es base F69 y
  tiene tests propios); conviene revisarlo con el abogado junto con el punto
  (5) del informe A1.
- Los mensajes históricos guardados antes de este cambio no traen el descargo
  en su contenido, pero la UI igual lo pinta fijo bajo cada respuesta.
