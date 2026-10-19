# NOTAS-F44 — "Explícame esta alerta" con IA

## Estado
Completo. Rama `v2/f44-ia-explica-alerta`, sin push. Verificado con
`npm run typecheck`, `npm run lint` y `npm test` (32 suites, **365 tests**).
`npx next build` queda para el orquestador, según la nota de la tarea.

## Qué se hizo
- **`src/lib/explain-prompt.ts`** (nuevo, puro):
  - Esquema zod del body (`explainAlertRequestSchema`) con enums de tipo,
    severidad y categoría, y topes de largo.
  - `EXPLAIN_SYSTEM_PROMPT`: español de Chile, estructura fija
    (Qué pasó / Por qué podría importar / Límites / Fuente), prohibición de
    recomendar comprar, vender o mantener, de personalizar, predecir precios
    o ejecutar/enrutar órdenes (Ley Fintec).
  - Saneamiento de texto, URLs solo `https` públicas y sin credenciales,
    lista blanca de claves de payload y cálculo del atraso con `lagDays`.
  - `explainSources`: prioriza documentos del payload; si no hay, cita la
    fuente oficial según categoría (House Clerk/Senate eFD, SEC EDGAR 13F,
    corredora o datos de reclu.cl). Nunca inventa una URL.
  - Neutraliza `</alerta>` y similares para que el contenido del cliente no
    cierre el bloque de datos ni inyecte instrucciones.
- **`src/app/api/explain-alert/route.ts`** (nuevo):
  - Reutiliza la cuota del chat: `enforceSignedInQuota` para sesión y
    `enforceAnonQuota` para anónimos (misma RPC/fallback en memoria).
  - Llama a OpenRouter sin streaming (`max_tokens: 600`, `temperature: 0.2`)
    con timeout de 25 s. Devuelve `{ explanation, sources, notice }`.
  - Falla elegante si falta `OPENROUTER_API_KEY` (503 con mensaje claro) o si
    OpenRouter no responde (502). Body acotado a 24 KB.
- **`src/components/alerts-feed.tsx`**:
  - Botón **Explicar** en cada alerta (junto a "Ver portafolio"), con estados
    Explicando… / Reintentar / Ver explicación / Ocultar.
  - Panel con la explicación en texto plano, enlaces a las fuentes y
    `LegalNotice kind="fintec"` (mismo descargo de F16).
- **`tests/explain-prompt.test.ts`** (nuevo): 21 tests de esquema, prompt,
  fuentes, saneamiento, URLs, payload y normalización de la respuesta.

## Variables de entorno
No se agregó ninguna variable nueva.
- Requeridas para que funcione: `OPENROUTER_API_KEY`.
- Opcionales ya existentes: `OPENROUTER_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` y `CHAT_RATE_SALT` (cuota del chat).
- No se tocó `.env.example` ni ningún `.env*`.

## Decisiones y deudas
- El cliente envía una **instantánea saneada** de la alerta (título, resumen,
  payload y portafolio). No se consulta la base por id para que funcione
  igual con `demo-data.ts` sin Supabase; el servidor valida y acota todo.
- La explicación **no se persiste** ni se guarda en `chat_messages`; cada
  clic consume cupo del asistente, igual que una pregunta de chat.
- El botón está disponible para free y anónimos (sujeto a su cuota); no se
  agregó un muro Pro nuevo. Las alertas de funcionarios de EE.UU. siguen
  fuera del muro (5 U.S.C. § 13107).
- Deuda menor: `explainSources` infiere la fuente por categoría porque
  `EnrichedAlert.portfolio` no trae `portfolio.source`. Si una tarea futura
  lo agrega, se puede citar la fuente exacta sin tocar el prompt.
- Deuda menor: no hay test de integración de la route con `fetch` mockeado;
  la lógica riesgosa (prompt, saneamiento, fuentes) sí está cubierta.

## Cómo probar
1. `npm run typecheck && npm run lint && npm test` (debe pasar todo).
2. Opcional: `npx next build` (lo corre el orquestador).
3. Manual con `OPENROUTER_API_KEY` configurada:
   - Entrar a `/dashboard` o `/alerts`.
   - Pulsar **Explicar** en una alerta.
   - Verificar el panel, el enlace a la fuente y el aviso legal.
   - Pulsar **Ocultar/Ver explicación** y comprobar que no vuelve a gastar
     cupo.
4. Sin `OPENROUTER_API_KEY`: el botón muestra "La explicación con IA no está
   disponible en este entorno…" y el resto de la página sigue funcionando.

## Commits
- `281e36d` feat: add explain-alert prompt builder and tests
- `adcb1b8` feat: add explain-alert endpoint and alert action
- `4472d87` fix: harden explain prompt against block delimiters
