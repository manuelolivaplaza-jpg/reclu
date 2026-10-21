# NOTAS F72 — feed "Noticias que te tocan" y panel lateral de análisis

Rama: `v2/f72-feed-noticias` (desde `mejoras/integracion`). Sin push. Sin
migraciones nuevas (se usan las tablas de la 051). No se levantó `next dev` ni
`next build`.

## Hecho

### Lógica pura — `src/lib/impact-feed.ts`
- `buildImpactFeed()` cruza cada noticia con la cartera usando
  `matchNewsToPortfolio` (F68), con las relaciones que da el plan
  (`newsRelationsFor` vía `matcher`) y un retraso configurable
  (`delayHours` = `newsDelayHours` de `portfolioLimitsFor`).
- **Retraso**: `isNewsVisibleAt()` / `newsDelayCutoff()` descartan lo publicado
  hace menos de N horas. Gratis = 24 h; Pro/Elite = 0; la prueba vigente de
  Gratis se trata como Pro (ya lo resuelve `portfolioLimitsFor`).
- **Orden**: relevancia descendente y, en empate, fecha descendente y luego id
  (estable). Se descartan noticias sin coincidencias o con fecha inválida.
- **Exposición**: suma de los pesos de símbolos distintos tocados, con tope de
  100. Se calcula sin LLM.
- **Chips**: `RELATION_LABEL` y `NEWS_RELATION_ORDER` cubren directo, sector,
  competidor, proveedor y macro.
- Formatos deterministas (sin `Intl`): `formatNewsDate()` (parte UTC del ISO) y
  `formatExposure()` (coma decimal, un decimal).

### Lectura pública — `src/lib/news-feed.ts`
- `loadRecentNews()` lee **solo** `id, source, url, title, published_at` de
  `news_items` (la 051 no concede `summary`) y los `news_tickers` en lotes de
  50. `loadTickerProfiles()` lee `ticker_profile` para las posiciones y para los
  tickers de las noticias.
- `loadImpactFeed()` recibe el cliente de sesión y las posiciones ya
  valorizadas; ventana de 7 días y tope de 80 noticias crudas antes de ordenar.
  Falla en silencio (log + `[]`) si falta una tabla.
- **Las posiciones no se leen aquí**: las pasa la página desde el cliente de
  sesión, así la RLS `auth.uid() = user_id` sigue siendo la última defensa.

### Cliente del panel — `src/lib/impact-client.ts`
- `requestImpact()` aísla `POST /api/impact` (F71). Envía solo
  `news_id`, `symbol` y `question` recortada (nunca montos, nombre ni correo).
- Nunca lanza: devuelve `{status:"ok"}` validado con un type guard local (sin
  Zod en el bundle de cliente), `{status:"unavailable"}` si F71 responde
  404/405/501, o `{status:"error"}` con mensaje para 401/403/429/red/formato.
- Tolera `analysis`, `analisis` o `{ data: { analysis } }` como respuesta.
- Usa `AI_DISCLAIMER` (informe legal §2.2) como descargo por defecto.

### UI — `src/components/impact-feed.tsx`
- Sección "Noticias que te tocan" montada en `/mi-portafolio` debajo del editor.
  Cada fila: titular enlazado a la fuente, `% de tu cartera`, chips
  (ticker · relación · %), fuente legible, fecha y botón "Pregunta a la IA".
- Aviso de retraso cuando `delayHours > 0`; estado vacío en una frase.
- Panel lateral (overlay + `aside` a la derecha, `role="dialog"`, cierre con
  Escape): pide el análisis al abrirse, muestra resumen, canal de impacto,
  horizonte, incertidumbre y "qué mirar"; pregunta libre opcional (280
  caracteres), enlace a la fuente y descargo fijo §2.2 con el rótulo
  "IA · Información, no recomendación".
- **No se muestra `direccion_posible`**: el informe legal §A2 pide no asociar
  una dirección positiva/negativa a la cartera del usuario (queda comentado en
  el código).
- La primera llamada se dispara en el clic, no en un efecto (cumple
  `react-hooks/set-state-in-effect` de Next 16).

### Página — `src/app/(dashboard)/mi-portafolio/page.tsx`
- Sigue con `await connection()` + `export const instant = false` y
  `notFound()` si `MY_PORTFOLIO_ENABLED !== "true"`.
- Si hay consentimiento vigente **y** `NEWS_IMPACT_ENABLED=true`: valoriza las
  posiciones con `valuatePortfolio`, usa los pesos (%) como `Position[]` y
  llama a `loadImpactFeed({plan, trialEndsAt, delayHours})`.
- Con `NEWS_IMPACT_ENABLED` apagado no se lee ninguna noticia, no se monta la
  sección y no se llama a `/api/impact` (flag apagado = sin ruta/UI).

## Tests (Vitest)

`tests/impact-feed.test.ts` (13):
- orden por relevancia, desempate por fecha, exposición con tope y 8-K (1,2);
- retraso por plan: Gratis 24 h oculta lo reciente, Pro muestra al día, prueba
  vigente = Pro, fecha inválida descartada;
- formatos deterministas;
- lectura pública: el `select` de `news_items` no incluye `summary`;
- render con `react-dom/server`: titular, chips, `%`, fuente, fecha, botón,
  aviso de 24 h y estado vacío. `impact-client` está mockeado (sin red).

`tests/impact-client.test.ts` (6):
- body exacto (`news_id`, `symbol`, `question` recortada; sin `question` vacía);
- 404 → `unavailable` (F71 pendiente);
- 429 → mensaje de cupo; 401/403 → pedir sesión; JSON inválido → error;
- fallo de red no lanza; type guard del esquema F70.

## Verificación ejecutada

```bash
npx vitest run --maxWorkers=1 tests/impact-feed.test.ts tests/impact-client.test.ts  # 19/19
npm run lint      # OK
npm test          # 75 archivos, 913 tests OK
npm run typecheck # OK (sin salida)
```

No se corrió `next build` ni `npm run dev` (los corre el orquestador).

## Cómo probar a mano (fuera de este worktree)

1. Supabase con 050–052 aplicadas y algunas filas en `news_items`,
   `news_tickers` y `ticker_profile` (p. ej. el scraper de EDGAR/CMF).
2. `MY_PORTFOLIO_ENABLED=true` + `NEWS_IMPACT_ENABLED=true` y `npm run dev`.
3. Login → `/mi-portafolio` con consentimiento y posiciones que tengan
   cantidad + precio en `prices` (si ninguna tiene precio, la sección muestra
   el aviso de "necesitamos una posición con cantidad y último cierre").
4. Plan Gratis: las noticias de las últimas 24 h no aparecen; la nota de
   retraso dice 24 h. Con plan Pro (o prueba vigente) aparecen al día.
5. Revisar chips directo/sector/competidor/proveedor/macro y el `%` por
   posición; el enlace abre la fuente.
6. "Pregunta a la IA": con F71 desplegado muestra el análisis; sin F71
   (`/api/impact` 404) muestra el aviso neutro y la fuente sigue disponible.
   El descargo §2.2 debe verse siempre.
7. `NEWS_IMPACT_ENABLED` apagado → `/mi-portafolio` sigue funcionando sin
   sección de noticias y `/api/impact` no se llama.

## Pendiente / notas

- **Contrato con F71**: se asumió `POST /api/impact` con
  `{ news_id, symbol, question? }` y respuesta con `analysis` (o `analisis` /
  `data.analysis`), `cached` y `disclaimer` opcional. Si F71 cambia los
  nombres, ajustar solo `src/lib/impact-client.ts` (los tests ya lo mockean).
- Sin `news_items`/`news_tickers`/`ticker_profile` cargadas el feed aparece
  vacío; no hay datos demo para F72 y `scrapers/data/v2/F72/` no existía en
  este worktree.
- La ventana de lectura es de 7 días y el tope de 80 noticias crudas; si el
  volumen crece, conviene filtrar en SQL por los símbolos de la cartera.
- Los pesos salen del valor de mercado (cantidad × último cierre). Las
  posiciones sin precio no reciben un peso inventado y no generan matches.
- No se tocó ninguna ruta de API ni migración; no hay nada que desplegar aparte
  del código.
