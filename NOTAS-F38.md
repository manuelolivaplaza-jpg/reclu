# NOTAS F38 — Ranking honesto

## Rama y estado

- Worktree: `C:\reclu-work\f37`
- Rama: `v2/f38-ranking-honesto` (desde `mejoras/integracion`)
- Sin push. Commit local: `feat: add honest ranking page with all sources vs benchmark`.
- Verificado: `npm run typecheck`, `npm run lint`, `npm test` (27 archivos, 292 tests). No se corrió `next build` (lo corre el orquestador).

## Qué se hizo

1. **`src/lib/ranking.ts`** — lógica pura del ranking:
   - `rankSources()` ordena por exceso de retorno (fuente − benchmark), de mayor a menor.
   - Incluye explícitamente a los perdedores; no filtra por resultado.
   - Sin retorno o sin benchmark: exceso `null`, sin número de ranking; nunca inventa un cero.
   - Menos de 30 puntos (`SMALL_SAMPLE_MIN_POINTS`) => etiqueta **“muestra chica”** (`SMALL_SAMPLE_LABEL`).
   - `benchmarkLabelForCountry()` / `benchmarkLabelForSymbol()`: EE.UU. = `S&P 500 (SPY)`; Chile = `ECH en CLP (proxy del IPSA)` (reusa `ECH_PROXY_LABEL` de AFP).
   - `splitByOutcome()` separa ganadores, perdedores, empates y sin datos.
2. **`src/lib/research-results.ts`** — cinco estudios estáticos desde `scrapers/data/v2/F38/`, cada uno con corte, fuente, URL, método y tamaño de muestra:
   - Insiders (Form 4): −1,80% vs SPY +8,11% (270 eventos; corte 2026-10-16).
   - Elogios de Musk: promedio simple de Etsy, GameStop y CD Projekt = −50,45% vs SPY +117,67% (3 menciones; Tesla excluida por insider).
   - Inverse Cramer: +0,07% vs SPY −0,44% (promedio de 25 señales con días suficientes).
   - Trump compra desde la publicación: +2,06% vs SPY −1,38% (11 compras). Se documenta también el corte desde la operación (−0,29% vs −0,45%).
   - AFP Modelo: +33,79% vs ECH en CLP +33,09% (cartera al 30-05-2025, entrada 02-06-2025, salida 2026-09-16).
3. **`src/app/ranking/page.tsx`** — página pública:
   - `await connection()` + `export const instant = false`.
   - Cruza `getPortfolios()` con `getBeatTheMarketRanking(500)` y suma los estudios estáticos.
   - Secciones separadas: “Le ganan a su benchmark”, “Pierden contra su benchmark”, empates y “Sin datos suficientes”.
   - Tabla con retorno, benchmark, exceso (verde/rojo solo en cifras), corte, tipo de fuente, nota y “muestra chica”.
   - Bloque “Cómo se midió cada estudio” y sección de metodología (SPY / ECH-CLP, exceso aritmético, sin dividendos ni costos).
   - `<LegalNotice kind="simulation" />` visible.
4. **`src/components/explore-rankings.tsx`** — enlace “Ranking honesto: todas contra su benchmark →” a `/ranking`.
5. **`tests/ranking.test.ts`** — 14 tests: orden con perdedores, nulos al final, umbral 30, etiquetas SPY/ECH, redondeo del exceso, separación por resultado y cifras de los cinco estudios.

## Variables de entorno nuevas

Ninguna. No se modificó `.env.example` (lo une F57).

## Deudas / pendientes

- **IPSA vs ECH exacto**: `portfolio_metrics` guarda el benchmark como `^IPSA`/`^GSPC`. La UI rotula “S&P 500 (SPY)” y “ECH en CLP (proxy del IPSA)” porque son los vehículos replicables/proxy, pero el exceso de los portafolios se calculó contra los índices. Para comparar exactamente contra ECH en CLP habría que recalcular las series con el ETF y convertir a CLP.
- Los estudios son estáticos: si se actualizan los JSON de F38 hay que refrescar `research-results.ts` (o generar el archivo en un paso futuro).
- `/ranking` no se agregó al sitemap ni al header porque `src/app/sitemap.ts` y los archivos de registro son de F57.
- `scrapers/data/v2/F38/` quedó sin trackear (copia del orquestador). No se incluyó en el commit para no arrastrar datos crudos.
- En modo demo (sin Supabase) los portafolios aparecen en “Sin datos suficientes”; los estudios estáticos sí se rankean.

## Cómo probar

```bash
npm run typecheck
npm run lint
npm test
```

Manual: con `npm run dev`, abrir `/ranking`. En modo demo se ven los cinco estudios (Musk, Cramer y Trump con “muestra chica”; insiders y AFP sin la etiqueta). Con Supabase configurado se suman los portafolios con métricas precalculadas. Revisar también el enlace nuevo en `/explore`.
