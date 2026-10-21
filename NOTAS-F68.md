# F68 — Matcher noticia → tickers y relevancia

Rama: `v2/f68-matcher-noticias` (desde `mejoras/integracion`). Sin push.

## Hecho

- `src/lib/news-match.ts`: función pura, sin red ni base de datos.
  - Tipos: `NewsItem`, `NewsTicker`, `TickerProfile`, `Position`, `NewsMatch`,
    `MatchOptions`, `MacroTopic`.
  - `matchNewsToPortfolio(news, positions, profiles, opts)` con relaciones
    `direct` (confianza de la fuente), `sector` (0,5), `competitor` (0,4),
    `supplier` (0,4) y `macro` (0,3).
  - Relevancia = `confidence × (weight / 100) × importance`; importancia 1 por
    defecto y 1,2 para 8-K con item 1.01, 2.01 o 5.02 (`newsImportance`,
    `isImportantEightK`, `IMPORTANT_8K_ITEMS`).
  - Filtra por `newsRelationsFor(plan, trialEndsAt, now)` de `plans.ts` y por
    `opts.minRelevance` (por defecto 0). `opts.relations` permite inyectar el
    conjunto de relaciones en tests/feeds ya filtrados.
  - Sin duplicados por símbolo: gana la relación de mayor prioridad
    (direct > sector > supplier > competitor > macro) y, a igual relación, la
    mayor confianza. Salida ordenada por relevancia descendente y símbolo.
  - `exposurePct(news, positions)`: suma de pesos de las posiciones cuyos
    símbolos aparecen en `news.tickers`, sin LLM.
  - Diccionario macro `MACRO_KEYWORDS` en español e inglés: tasa/rate,
    cobre/copper, litio/lithium, dólar/peso/dollar, petróleo/oil,
    arancel/tariff. Normaliza tildes y mayúsculas.
  - Símbolos normalizados (trim + mayúsculas), pesos y confianzas acotados a
    sus rangos. Tolera perfiles faltantes.
- `tests/news-match.test.ts`: 22 casos (directo, sector, competidor,
  proveedor, macro ES/EN, 8-K 1.01/2.01/5.02, filtros por plan Gratis/Pro/Elite,
  `minRelevance`, cartera vacía, ausencia de duplicados, símbolos sucios,
  orden por relevancia y `exposurePct`).

## Pendiente / notas

- El flag `NEWS_IMPACT_ENABLED` se evalúa en el llamador
  (`isNewsImpactEnabled()`); esta librería es pura y no lo consulta, para poder
  testearla sin variables de entorno. Cualquier endpoint/UI futura (F70+) debe
  gatear antes de llamarla.
- `scrapers/data/v2/F68/` no existía en el worktree; la tarea no necesitaba
  fixtures porque todo es función pura.
- `npm run typecheck` falla solo por el error preexistente de Next 16
  `Cannot find name 'LayoutProps'` en `src/app/layout.tsx:63` (documentado en
  `AGENTS.md`; lo resuelve el build real). No hay errores en los archivos de F68.
- No se tocó Supabase, `.env`, migraciones ni scrapers.

## Cómo probar

```bash
npx vitest run --maxWorkers=1 tests/news-match.test.ts
npm run lint
npm test
```
