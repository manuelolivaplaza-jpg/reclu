# Brief de Ejecución (Wave 2) — Suscripciones Pro/Elite ($12.990 / $16.990), Catálogo Institucional 13F, Buscador ⌘K, Simulador y Scraper BTG

Lee este documento completo y ejecútalo de principio a fin de manera autónoma. Tu misión es llevar **reclu.cl** al siguiente nivel funcional y comercial sin romper ni una sola regla estética de `docs/hermes-diseno.md` ni las convenciones de Next.js 16 de `AGENTS.md`.

---

## Reglas de Oro (Inquebrantables)

1. **Estética SpaceX × Autopilot (`docs/hermes-diseno.md`)**:
   - Paleta estricta: Blanco `#ffffff`, Negro `#0a0a0a`, Gris `#6b6b6b`, Filetes `1px` `#e6e6e6`, Superficie `#f6f6f6`.
   - Verde `#0f7a32` y Rojo `#c81e1e` **solo** en cifras de rendimiento. Cero azul, cero sombras, radio `0px` en contenedores/cards, píldora (`rounded-full`) en botones primarios.
2. **Copy de cabeceras de la Home**:
   - Mantén intactos los titulares obligatorios de la Home (`Sigue las carteras que mueven el mercado.`, `Lo que está moviéndose.`, `No invertimos por ti. Te avisamos cuando ellos se mueven.`, `Tres pasos.`, `Empieza en cero.`, `Preguntas.`, `Deja de revisar filings.`).
3. **Tests y Build**:
   - `FREE_PLAN_FOLLOW_LIMIT` en `src/lib/types.ts` debe seguir siendo `2` (validado en `tests/types.test.ts`).
   - Al terminar, `npm run typecheck`, `npm run lint`, `npm test` y `npx next build` deben pasar con **0 errores**.

---

## Fase 1 — Nueva Arquitectura de Suscripciones: Gratis ($0), Pro ($12.990) y Elite ($16.990)

El producto ahora ofrece **dos suscripciones de pago claramente diferenciadas** además del nivel gratuito:

### 1.1 Tipos y Constantes (`src/lib/types.ts`)
- Actualiza `export type Plan = "free" | "pro" | "elite";`
- Mantén `export const FREE_PLAN_FOLLOW_LIMIT = 2;`
- Agrega `export const PRO_PLAN_FOLLOW_LIMIT = 15;` (Elite tiene portafolios ilimitados).
- Agrega una función helper `export function isPaidPlan(plan?: string | null): boolean { return plan === "pro" || plan === "elite"; }` y `export function isElitePlan(plan?: string | null): boolean { return plan === "elite"; }` para usar en la UI manteniendo compatibilidad total con cualquier código que verifique `plan === "pro"`.
- Donde el código verifique `profile?.plan === "pro"` para desbloquear funciones pagas generales (en `portfolio/[slug]/page.tsx`, `explore/page.tsx`, `(dashboard)/layout.tsx`, `(dashboard)/dashboard/page.tsx`, `ai-chat-widget.tsx`), acepta también `"elite"` (`profile?.plan === "pro" || profile?.plan === "elite"`), mostrando la etiqueta `"Elite"` o `"Pro"` según corresponda en el header del dashboard.

### 1.2 Sección de Precios en la Home (`src/components/sections/pricing.tsx`)
Conviértela en un componente interactivo (`"use client"`) con tres columnas arquitectónicas (`max-w-[1120px]`, `grid-cols-1 lg:grid-cols-3`, `gap-px border border-ink-200 bg-ink-200`) y un selector de ciclo de facturación:

- **Cabecera**:
  - Mantén el H2 exacto: `<h2 className="type-section text-ink-900">Empieza en cero.</h2>`
  - A la derecha del H2 (en desktop, debajo en móvil), agrega un toggle minimalista de facturación: **Mensual** / **Anual (−20%)** con filete `1px` `#0a0a0a`, fondo negro en la opción activa y texto blanco.

- **Columna 1 — Gratis (`$0`)** (Fondo blanco `bg-white`):
  - Etiqueta: `Gratis`
  - Precio: `$0` (`Para siempre`)
  - Beneficios:
    - Seguir hasta 2 portafolios públicos
    - Alertas por email con resumen diario
    - Explorador público y retorno YTD
    - Comparación básica con tu cartera
    - 2 consultas de prueba en el asistente IA
  - CTA (outline a ancho completo): `Crear cuenta` → `/signup`

- **Columna 2 — Pro (`$12.990` mensual / `$10.390` anual)** (Fondo blanco `bg-white` con borde superior distintivo o etiqueta `Más elegido` en `11px` gris/negro):
  - Etiqueta: `Pro · Inversor activo`
  - Precio mensual: `$12.990` (`CLP / mes`). Si el toggle está en Anual: `$10.390` (`CLP / mes · facturado anual`).
  - Beneficios:
    - Seguir hasta 15 portafolios (Políticos EE.UU. y Corredoras Chile)
    - Alertas en tiempo real apenas se publica el filing
    - Resúmenes AI ejecutivos en cada movimiento
    - Asistente reclu AI (50 consultas por semana)
    - Comparador de cartera completo y detector de solapamiento
    - Medidor de desfase de divulgación (Disclosure Lag)
  - CTA (píldora negra a ancho completo): `Elegir Pro` → `/signup?plan=pro`

- **Columna 3 — Elite (`$16.990` mensual / `$13.590` anual)** (Monolito negativo `bg-ink-900 text-white`):
  - Etiqueta: `Elite · Institucional & 13F` (`text-white/60`)
  - Precio mensual: `$16.990` (`CLP / mes`). Si el toggle está en Anual: `$13.590` (`CLP / mes · facturado anual`).
  - Beneficios (filetes `rgba(255,255,255,0.16)`):
    - Portafolios ilimitados en todas las categorías
    - Acceso total a Fondos 13F Institucionales, Soberanos y Tesis AI
    - Radar de Consenso (detecta compras simultáneas de múltiples ballenas)
    - Asistente reclu AI ilimitado con cruce profundo de carteras
    - Comparador multi-cartera (Fondos vs. Políticos vs. Tu cartera)
    - Exportación de composiciones e historial en CSV
    - Soporte prioritario y acceso anticipado a nuevas fuentes
  - CTA (píldora blanca, texto negro): `Pasar a Elite` → `/signup?plan=elite`

- **Matriz Comparativa Desplegable o Visible debajo**:
  - Debajo de las 3 columnas, incluye una tabla limpia de comparación rápida (`Gratis` vs `Pro` vs `Elite`) con filetes de `1px` `#e6e6e6` comparando: *Portafolios seguidos (2 / 15 / Ilimitados)*, *Frecuencia de alertas (Diaria / Tiempo real / Prioritaria instantánea)*, *Fondos 13F y carteras Premium (— / Parcial / Acceso total)*, *Asistente reclu AI (2 de prueba / 50 sem. / Ilimitado)*, *Exportación CSV y Cruce Multi-cartera (— / — / Incluido)*.

### 1.3 Flujo de Registro y Ajustes con Plan Seleccionado
- En `src/app/(auth)/signup/page.tsx` y `src/components/auth-form.tsx`: si la URL trae `?plan=pro` o `?plan=elite`, muestra un recuadro sobrio con filete negro de `1px` arriba del formulario indicando el plan seleccionado (`Plan Pro · $12.990 CLP/mes` o `Plan Elite · $16.990 CLP/mes`) para dar continuidad visual a la conversión.
- En `src/app/(dashboard)/settings/page.tsx`: actualiza la tarjeta de suscripción para mostrar claramente los 3 niveles (`Gratis`, `Pro — $12.990 CLP/mes`, `Elite — $16.990 CLP/mes`) con sus diferencias.

---

## Fase 2 — Expansión Masiva del Catálogo de Portafolios y Datos Reales en Demo (`src/lib/demo-data.ts`)

Basándote en la investigación verificada de `docs/expansion-portfolios.md` y `docs/expansion-portfolios-2.md`:

1. **Agrega al menos 12 nuevos portafolios de alto impacto a `DEMO_PORTFOLIOS` en `src/lib/demo-data.ts`**:
   - **Categoría `hedge_fund` (Fondos 13F Institucionales y Soberanos)**:
     - `berkshire-hathaway`: **Berkshire Hathaway** (Warren Buffett · SEC 13F · US · `+22.4%` YTD · 18.900 seguidores)
     - `pershing-square`: **Pershing Square** (Bill Ackman · SEC 13F · US · `+19.8%` YTD · 9.200 seguidores · `premium: true`)
     - `duquesne-family-office`: **Duquesne Family Office** (Stanley Druckenmiller · SEC 13F · US · `+34.6%` YTD · 11.400 seguidores · `premium: true`)
     - `scion-asset-management`: **Scion Asset Management** (Michael Burry · SEC 13F · US · `+27.1%` YTD · 14.200 seguidores · `premium: true`)
     - `appaloosa-lp`: **Appaloosa Management** (David Tepper · SEC 13F · US · `+29.5%` YTD · 6.800 seguidores · `premium: true`)
     - `tci-fund`: **TCI Fund Management** (Christopher Hohn · SEC 13F · Global · `+26.2%` YTD · 5.400 seguidores · `premium: true`)
     - `pif-saudi`: **Public Investment Fund (PIF)** (Fondo Soberano · SEC 13F · Global · `+16.9%` YTD · 7.100 seguidores · `premium: true`)
   - **Categoría `political_us` (Congreso y Senado EE.UU.)**:
     - `gottheimer-tracker`: **Josh Gottheimer Tracker** (Cámara EE.UU. · Financial Services · US · `+24.7%` YTD · 4.900 seguidores)
     - `tuberville-tracker`: **Tommy Tuberville Tracker** (Senado EE.UU. · Armed Services · US · `+21.3%` YTD · 6.300 seguidores)
     - `mccaul-tracker`: **Michael McCaul Tracker** (Cámara EE.UU. · Foreign Affairs · US · `+19.4%` YTD · 4.100 seguidores)
     - `mccormick-tracker`: **David McCormick Tracker** (Senado EE.UU. · Banking Committee · US · `+25.8%` YTD · 5.200 seguidores · `premium: true`)
   - **Categoría `broker_cl` (Chile)**:
     - `btg-cartera-recomendada`: **BTG Pactual — Cartera Recomendada 5** (BTG Pactual Chile · CL · `+15.4%` YTD · 4.600 seguidores)

2. **Holdings específicos y realistas para TODOS los portafolios en `DEMO_HOLDINGS`**:
   - Asegúrate de que tanto los nuevos portafolios (Berkshire con `AAPL, AXP, BAC, KO, CVX, OXY, CB`; Pershing con `HLT, QSR, CMG, GOOGL, CP, BN`; Duquesne con `NTRA, CPNG, COHR, TSM, NVDA, MSFT`; Scion con `BABA, JD, BIDU, HCA, CITI`; TCI con `GE, V, MCO, CP, CNI, FER`; Gottheimer, Tuberville, etc.) como los portafolios chilenos y temáticos existentes tengan su propio array de holdings realistas en `DEMO_HOLDINGS` con precios (`price_at_disclosure`, `price_current`, `return_pct`) y `previous_weight` variados para que las tablas de composición, deltas (`+X.X pp`) y heatmaps luzcan increíbles en cada URL `/portfolio/[slug]`.

3. **Alertas enriquecidas en `DEMO_ALERTS`**:
   - Agrega alertas adicionales en `DEMO_ALERTS` para los nuevos fondos 13F y políticos, incluyendo `payload: { filed_at: "...", traded_at: "..." }` en las alertas de políticos/13F para que el indicador de lag (`disclosureLagLabel`) se muestre automáticamente.

---

## Fase 3 — Funcionalidades Estrella: Buscador Global `⌘K`, Simulador de Retorno, Exportación CSV y Cruce de Ballenas

### 3.1 Buscador Rápido Tipo Terminal (`⌘K` / `Ctrl+K`) — `src/components/command-palette.tsx`
- Crea un componente cliente `CommandPalette` montado en `src/components/site-header.tsx`.
- En el header (desktop y móvil), agrega un botón discreto con estilo de terminal: `Buscar · ⌘K` (en móvil un botón de búsqueda limpio `Buscar`) que abra el modal, además de escuchar el atajo de teclado `⌘K` / `Ctrl+K`.
- El modal incluye un input instantáneo que filtra en vivo entre los portafolios principales, gestores (Pelosi, Buffett, Ackman, Druckenmiller, Burry, Renta 4, BTG) y tickers populares (`NVDA`, `AAPL`, `SQM-B`, `COPEC`, `MSFT`, `BABA`, `BSANTANDER`, `GE`), permitiendo navegar con teclado (`↑`/`↓`/`Enter`) o clic directo hacia `/portfolio/[slug]` o `/explore?simbolo=TICKER`.

### 3.2 Simulador de Inversión + Exportación CSV en `/portfolio/[slug]` (`src/components/portfolio-tools.tsx`)
- Crea `src/components/portfolio-tools.tsx` (`"use client"`) e intégralo en `src/app/portfolio/[slug]/page.tsx` (por ejemplo, debajo de la cabecera o junto a las gráficas de evolución):
  1. **Simulador de Capital YTD**: Permite elegir un capital inicial (`$1.000.000`, `$5.000.000`, `$10.000.000`, `$25.000.000` CLP) y calcula en vivo con tipografía `num` cuánto valdría hoy con el `return_ytd` del portafolio y la ganancia/pérdida neta en pesos, acompañado de una nota sobria: *"Cálculo ilustrativo sobre retorno YTD reportado sin descontar comisiones. No constituye proyección ni asesoría."*
  2. **Botón `Exportar CSV ↓`**:En la cabecera de la sección `Composición (N activos)`, permite descargar un archivo `.csv` real con los holdings del portafolio (`symbol,name,weight,previous_weight,delta_pp,currency,exchange`) cuando el usuario tiene cuenta (o abre redirección a `/signup` si está bloqueado).

### 3.3 Radar de Consenso en `/explore` (`src/components/explore-rankings.tsx`)
- En `src/components/explore-rankings.tsx`, agrega una tarjeta o bloque adicional de **" Radar de Consenso — Tickers más repetidos"** (o enriquece el bloque existente con acceso rápido a los símbolos más presentes en las carteras como `NVDA`, `MSFT`, `AAPL`, `GOOGL`, `SQM-B`, `COPEC`, `BSANTANDER` que enlazan a `/explore?simbolo=TICKER`).

### 3.4 Comparador Multi-Cartera en `/compare` (`src/components/portfolio-manager.tsx`)
- En `src/components/portfolio-manager.tsx`, agrega una pestaña o modo **"Cruzar dos carteras de reclu"** además de *"Mi cartera vs. Portafolio"*, permitiendo seleccionar el Portafolio A (ej. *Pelosi Tracker*) y el Portafolio B (ej. *Duquesne Family Office* o *Berkshire Hathaway*) para ver al instante:
  - Porcentaje de solapamiento (Overlap %)
  - Acciones en común con sus respectivos pesos lado a lado
  - Diferencial de retorno YTD (`+X.X pp`)

---

## Fase 4 — Scraper BTG Pactual Chile y Expansión 13F (`scrapers/`)

1. **Nuevo Scraper `scrapers/btg_pactual.py`**:
   - Crea `scrapers/btg_pactual.py` heredando de `SourceAdapter` en `scrapers/base.py`.
   - Implementa la extracción de la cartera recomendada pública de BTG Pactual Chile (`https://app.btgpactual.cl/productos-de-inversion/acciones/cartera-recomendada`) con `httpx`, parseando tickers chilenos y sus ponderaciones, normalizando a 100%, y manejando errores de red de forma limpia.
   - Regístralo en `scrapers/run_all.py` bajo la clave `"btg_pactual"`.

2. **Actualización de CIKs en `scrapers/sec13f.py`**:
   - Corrige el CIK de Scion Asset Management a `"0001649339"` (según `docs/expansion-portfolios.md`).
   - Agrega a la lista de fondos 13F en `scrapers/sec13f.py`: Duquesne Family Office (`"0001536411"`), TCI Fund Management (`"0001647251"`), Public Investment Fund (`"0001767640"`) y Tiger Global (`"0001167483"`).

---

## Fase 5 — Verificación Total, Commits y Push

1. Ejecuta y asegúrate de que pasen sin un solo error:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npx next build`
2. Realiza commits atómicos convencionales en inglés (`feat:`, `fix:`, `chore:`) y haz `git push origin main`.
