# F70 — Job de análisis genérico cacheado (paso A)

Rama: `v2/f70-impacto-precompute` (desde `mejoras/integracion`). Sin push.

## Qué se hizo

- **`src/lib/impact-prompt.ts`** (nuevo)
  - `IMPACT_PROMPT_VERSION = "v1"`.
  - System prompt v1 exacto: “Explicas información pública. No recomiendes comprar,
    vender ni mantener. Responde SOLO JSON”.
  - Esquema Zod `impactAnalysisSchema` / tipo `ImpactAnalysis`:
    `resumen` ≤400, `canal_de_impacto` ≤200,
    `direccion_posible` (positiva|negativa|mixta|incierta),
    `horizonte` (corto|medio|largo|incierto),
    `incertidumbre` (baja|media|alta), `que_mirar` ≤200.
  - `buildImpactUserPrompt()` arma el input SOLO con título, resumen corto, ticker
    y `ticker_profile` (sector, industria, país, pares, proveedores, macro). No
    incluye tenencias, pesos, montos ni ningún dato de usuarios. Neutraliza `<`/`>`
    y colapsa controles/espacios.
  - `parseImpactAnalysis()` acepta cercas ```json y texto alrededor, valida con
    Zod y devuelve `null` si el JSON es inválido o no cumple el esquema.

- **`src/app/api/impact/precompute/route.ts`** (nuevo, `POST`)
  - Auth con `Authorization: Bearer ${CRON_SECRET}` y `timingSafeEqual`
    (`src/lib/safe-compare.ts`), mismo patrón que `/api/run-pipeline`.
    Sin `CRON_SECRET` → 503; secreto incorrecto → 401.
  - `NEWS_IMPACT_ENABLED !== "true"` → 404.
  - `llmConfig()` deshabilitado (falta `OPENROUTER_API_KEY` o
    `OPENROUTER_MODEL`) → 503 sin tocar la base.
  - Con service role (`createAdminClient`) lee hasta 50 `news_items` de las
    últimas 48 h con sus `news_tickers` y se queda solo con `relation = 'direct'`.
  - Lee `ticker_profile` para esos símbolos (contexto opcional: si falla, sigue).
  - Consulta `ai_impact_cache` para `prompt_version = "v1"` ANTES de llamar al
    modelo; si esa lectura falla, aborta con 500 para no repetir gasto.
  - Por cada par (noticia, ticker) no cacheado llama a `completeChat`.
  - Tope por corrida `IMPACT_MAX_CALLS` (entero ≥0, 30 por defecto).
  - Descarta y cuenta como `rejected` si Zod falla o `containsAdvice()` detecta
    recomendaciones (segunda capa legal). No cachea.
  - Guarda con `upsert` en `ai_impact_cache`
    (`news_id`, `symbol`, `model`, `prompt_version`, `analysis`) con
    `onConflict: news_id,symbol,prompt_version`.
  - Respuesta: `{ ok, prompt_version, news, pairs, cached, analyzed, rejected,
    failed, calls, pending }`, `Cache-Control: no-store`.

- **`tests/impact-precompute.test.ts`** (nuevo, 7 tests, Supabase y `fetch`
  mockeados): secreto incorrecto → 401; flag apagada → 404; sin modelo → 503;
  respuesta válida se cachea con `prompt_version: "v1"`; par ya cacheado no
  llama al modelo; “compra” en la respuesta → no se cachea; JSON inválido → no
  se cachea.

## Verificación

```
npx vitest run --maxWorkers=1 tests/impact-precompute.test.ts   # 7/7
npm run lint                                                     # OK
npm test                                                         # 71 archivos, 872 tests OK
npm run typecheck                                                # solo LayoutProps (ver abajo)
```

`npm run typecheck` falla únicamente en `src/app/layout.tsx(63,50): Cannot find
name 'LayoutProps'`, el error conocido de Next 16 con tsc aislado (el tipo lo
genera el build). No hay errores en los archivos de F70. No se corrió
`next build` ni `npm run dev` (los corre el orquestador).

## Cómo probar manualmente (con Supabase real, fuera de este worktree)

1. `NEWS_IMPACT_ENABLED=true`, `CRON_SECRET=...`, `OPENROUTER_API_KEY=...`,
   `OPENROUTER_MODEL=...` (opcional `IMPACT_MAX_CALLS=5`).
2. `POST /api/impact/precompute` con `Authorization: Bearer $CRON_SECRET`.
3. Revisar `ai_impact_cache` (`prompt_version = 'v1'`): un registro por par
   noticia×ticker directo, sin datos de usuarios.
4. Repetir la llamada: `cached` debe subir y `calls` debe ser 0.

## Pendiente / notas

- No existe `scrapers/data/v2/F70/` en el worktree; no se necesitó para esta
  tarea.
- El job NO se engancha todavía a un cron ni a `/api/run-pipeline`; la tarea
  solo pedía la ruta. Si se quiere automatizar, agregar la llamada al pipeline
  o a `vercel.json` en otra tarea.
- El paso B (análisis personalizado por usuario) no forma parte de F70.
