# F71 — "Pregunta a la IA" (paso B)

Rama: `v2/f71-pregunta-ia` (desde `mejoras/integracion`). Sin push.

## Estado

Completo. La ruta responde el análisis cacheado y la exposición **sin LLM**; el
LLM solo se llama cuando el usuario manda una pregunta libre. Todo detrás de
`NEWS_IMPACT_ENABLED` (apagado por defecto ⇒ 404).

## Qué se hizo

### 1. Consentimiento versionado (commit `b83af72`)
- `src/lib/portfolio-consent.ts`: `PORTFOLIO_CONSENT_VERSION = "2026-10"` y
  `isPortfolioConsentCurrent(consent_at, consent_version)`. Un `consent_at` con
  versión vieja o nula ya no cuenta como consentimiento vigente.
- `src/app/actions/portfolio-consent.ts`: al aceptar guarda `consent_version`;
  al retirar lo limpia.
- `src/app/(dashboard)/settings/page.tsx`: si la versión no es la actual, se
  vuelve a pedir el consentimiento.
- `supabase/migrations/053_consent_version.sql`: columna `consent_version`
  (idempotente) + backfill de filas con `consent_at` previo a `'2026-10'`.
  **No aplicada** a Supabase real (la corre el orquestador/Manu).

### 2. Endpoint (commit `85dbb98`, fix `b7804b2`)
`src/app/api/impact/route.ts` — `POST { newsId: uuid, question?: string }`:
1. `NEWS_IMPACT_ENABLED !== "true"` ⇒ 404.
2. Body inválido ⇒ 400; > 8 KB ⇒ 413.
3. Sin sesión ⇒ 401.
4. Sin consentimiento vigente ⇒ 403.
5. Noticia inexistente ⇒ 404.
6. Sin modelo configurado **y con pregunta** ⇒ 503 (sin gastar cupo).
7. `enforceSignedInQuota(user.id)` ⇒ reutiliza `check_chat_quota`; cada
   consulta cuesta 1 (también la que no usa LLM). Sin cupo ⇒ 429.
8. Cruce noticia × cartera sin LLM: `exposurePct` de `news-match.ts` +
   `ai_impact_cache` (último análisis por símbolo). Devuelve
   `exposureText` ("Esta noticia toca el 23,0% de tu cartera."), `matches`,
   `source.url`, `disclaimer` (`AI_DISCLAIMER`) y `notice` (`FINTEC_NOTICE`).
9. Solo con `question`: `completeChat` recibe únicamente tickers, pesos en %,
   título, resumen corto, análisis cacheado y la pregunta. La salida pasa por
   `sanitizeAdvice` y los bloqueos se registran con `logAdviceBlock` (sin texto).
10. Inserta en `user_impact_requests` con el **cliente de sesión**
    (`delivered_via: "web"`).

`src/lib/impact-prompt.ts`:
- `impactRequestSchema` (Zod) y `impactPositions()` que **proyecta** las filas de
  `user_holdings` a `{ symbol, weight }`; descarta cantidad, costo, corretaje,
  nombre y cualquier otro campo.
- `buildImpactPrompt()` con texto acotado del análisis cacheado (1.200 chars).

### 3. Tests (commit `85dbb98`)
`tests/impact-route.test.ts` (15 tests, todo mockeado):
- flag apagado 404 · sin sesión 401 · body inválido 400 · sin consentimiento
  403 · versión vieja 403 · sin cupo 429 · noticia inexistente 404.
- sin pregunta: 200, no llama al LLM, exposición y análisis correctos, insert
  `web`.
- con pregunta: body enviado al LLM **no** contiene correo, `user_id`, nombre,
  corretaje, `123.45`, `quantity`, `avg_cost` ni `broker`.
- recomendación del modelo ⇒ reemplazo neutro + descargo.
- sin modelo: con pregunta 503; sin pregunta 200.

## Verificación

```
npx vitest run --maxWorkers=1 tests/impact-route.test.ts   # 15 passed
npm test                                                   # 71 files / 880 passed
npm run lint                                               # sin errores ni warnings
npm run typecheck                                          # OK
```

No se corrió `next build` ni `npm run dev` (los corre el orquestador).

## Pendiente / notas para integrar

1. Aplicar `supabase/migrations/053_consent_version.sql` en el SQL Editor
   (idempotente). Sin esa columna el endpoint responde 403 a todos.
2. F70 (precompute) debe llenar `ai_impact_cache`; sin caché el endpoint igual
   responde, pero `matches[].analysis` viene `null`.
3. F72 (feed + drawer) consume esta ruta; no se tocó UI en F71.
4. Revisión legal pendiente: `docs/informe-legal-reclu.md` A2/A5. El endpoint ya
   aplica minimización y descargo, pero el lanzamiento necesita abogado.
5. Modelos `:free` siguen prohibidos para el paso B por el uso de datos.

## Cómo probar a mano

Con el flag y el modelo configurados en `.env.local` (no abrir ese archivo desde
el agente), sesión iniciada y consentimiento vigente:

```bash
curl -s -X POST http://localhost:3000/api/impact \
  -H "Content-Type: application/json" \
  -H "Cookie: <cookie de sesión>" \
  -d '{"newsId":"<uuid de news_items>"}'
```

Sin `question` no debe haber llamada a OpenRouter. Con `question`, revisar en el
proveedor que el prompt solo tenga símbolos, pesos, noticia y análisis.
