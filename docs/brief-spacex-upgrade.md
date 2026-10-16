# Brief de Ejecución — Elevación SpaceX × Autopilot (reclu.cl)

Lee este documento completo y ejecútalo de principio a fin. Eres el agente implementador principal. Tu objetivo es elevar la experiencia visual, interactiva, móvil y del asistente IA de **reclu.cl** al estándar de un producto de suscripción de $1B (estética **SpaceX × Autopilot**), respetando **estrictamente** todas las reglas de `AGENTS.md` y `docs/hermes-diseno.md`.

---

## Reglas Inquebrantables (Recordatorio)

1. **Estética y Paleta (`docs/hermes-diseno.md`)**:
   - Blanco `#ffffff`, Negro `#0a0a0a`, Gris `#6b6b6b`, Filetes `1px` `#e6e6e6`, Superficie `#f6f6f6`.
   - Verde `#0f7a32` y Rojo `#c81e1e` **exclusivamente** en cifras de rendimiento. Cero azul, cero sombras (`box-shadow: none`), cero gradientes decorativos, `border-radius: 0` en contenedores/cards y `999px` (píldora) en botones primarios.
2. **Copy intocable en la Home**:
   - No cambies los textos obligatorios definidos en `docs/hermes-diseno.md` (H1, Subtítulo, Banda negra `Statement`, H2 de secciones, disclaimers legales).
3. **Zonas protegidas (`AGENTS.md`)**:
   - No modifiques `supabase/`, `scrapers/`, `src/lib/supabase/`, `src/lib/queries.ts`, `src/app/actions/`, `src/app/api/`, ni `tests/`. Todo el trabajo es en componentes UI y páginas permitidas.
4. **Next.js 16**:
   - No uses `dynamic = "force-dynamic"`. Mantén `await connection()` y `export const instant = false` donde ya existen.

---

## Fase 1 — Corrección Crítica de Paywall en Detalle de Portafolio

En `src/app/portfolio/[slug]/page.tsx`:
- En la línea 55 existe `const locked = !profile;`, pero en las líneas ~175 y ~225 se invoca `<PaywallGate locked label="composición" ...>` y `<PaywallGate locked label="historial de alertas" ...>` pasando `locked` como booleano estático `true`.
- **Acción**: cámbialos a `<PaywallGate locked={locked} ...>` en ambas secciones para que los usuarios autenticados puedan ver la composición y el historial de alertas.
- Verifica también que en `src/app/portfolio/[slug]/page.tsx` se incluya `<SiteHeader />` o un header consistente con navegación limpia y que la vista en móvil (`390px`) apile el retorno YTD y el botón de seguir con total precisión tipográfica.

---

## Fase 2 — Sistema de Animaciones y Micro-interacciones Estilo SpaceX (`framer-motion`)

`framer-motion` ya está instalado en el proyecto. Crea un módulo reutilizable `src/components/ui/motion.tsx` (`"use client"`) con física contenida, precisa y sobria (estilo SpaceX / Linear, curva `cubic-bezier(0.16, 1, 0.3, 1)`):

1. **Componentes en `src/components/ui/motion.tsx`**:
   - `FadeIn`: revela elementos al entrar en viewport (`initial={{ opacity: 0, y: 14 }}`, `whileInView={{ opacity: 1, y: 0 }}`, `viewport={{ once: true, margin: "-40px" }}`, `transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}`). Respeta `useReducedMotion()`.
   - `StaggerList` y `StaggerItem`: para revelar filas de portafolios, pasos de `HowItWorks` y tarjetas en `/explore` con un `staggerChildren: 0.06`.
   - `AnimatedNumber` (opcional o integrado): transición suave o revelado tabular para cifras clave.

2. **Trazado progresivo en `src/components/sparkline.tsx`**:
   - Haz que el trazo SVG de la sparkline tenga una animación sutil de entrada o transición limpia en su `path` (por ejemplo con CSS `@keyframes` o `framer-motion` `pathLength` de `0` a `1` en `0.8s cubic-bezier(0.16, 1, 0.3, 1)`) sin perder compatibilidad con Server Components ni tests existentes.

3. **Micro-interacciones de precisión en filas y secciones de la Home**:
   - En `src/components/sections/showcase-list.tsx` (y `portfolio-row.tsx` si se usa): agrega una línea superior activa de `1px` negra que se expanda sutilmente de izquierda a derecha en hover (`scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]`) y desplazamiento milimétrico de la flecha o indicador si aplica, manteniendo cero sombras.
   - En `src/components/sections/faq.tsx`: mejora la apertura de cada pregunta para que el ícono `+` rote suavemente a `45deg` (`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`) y la respuesta aparezca con transición limpia.
   - Aplica `FadeIn` / `StaggerList` con sutileza en `hero.tsx`, `portfolio-stage.tsx`, `statement.tsx`, `how-it-works.tsx`, `pricing.tsx` y `close.tsx` sin alterar ningún texto ni romper la estructura de DOM esperada.

---

## Fase 3 — Experiencia Móvil (390px) Nivel App Nativa

1. **Header y Menú Móvil (`src/components/site-header.tsx`)**:
   - Anima la apertura y cierre del menú móvil a pantalla completa con `AnimatePresence` y `motion.div` (transición de opacidad y desplazamiento vertical sutil en los links grandes `clamp(2rem, 6vw, 2.5rem)`).
   - Bloquea el scroll del `body` (`document.body.style.overflow = "hidden"`) cuando el menú móvil esté abierto y restáuralo al cerrar o cambiar de ruta.

2. **Filtros y Catálogo en Móvil (`src/components/explore-filters.tsx` y `src/app/explore/page.tsx`)**:
   - En pantallas móviles, asegúrate de que la barra de categorías tenga scroll horizontal fluido (`overflow-x-auto no-scrollbar`) sin cortar palabras, con filete activo inferior nítido y un botón rápido para limpiar filtros cuando haya búsqueda activa (`q` o `simbolo`).

3. **Convivencia del Botón Flotante IA con la Barra Inferior del Dashboard**:
   - En móvil (`< lg`), el layout del dashboard (`src/app/(dashboard)/layout.tsx`) tiene un `<nav>` fijo abajo (`h-14` aprox).
   - En `src/components/ai-chat-widget.tsx`, detecta si el usuario está en una ruta del dashboard (`/dashboard`, `/alerts`, `/compare`, `/settings`) usando `usePathname()` y ajusta la posición del botón flotante en móvil a `bottom-20 lg:bottom-5` para que jamás tape la navegación inferior en celulares.

---

## Fase 4 — Asistente IA Contextual y Terminal Financiera (`src/components/ai-chat-widget.tsx`)

Mejora `src/components/ai-chat-widget.tsx` manteniendo intacta la lógica de cuotas (`ANON_FREE_QUESTIONS`, headers `X-Chat-Remaining`, `ChatGateModal`) y el endpoint `/api/chat`:

1. **Conciencia de Contexto por Ruta (`usePathname`)**:
   - Si el usuario está en `/portfolio/[slug]`, extrae el `slug` de la URL y muestra sugerencias contextuales específicas para ese portafolio (ej. *"¿Cuáles son las principales posiciones de este portafolio?"*, *"¿Qué movimientos recientes ha tenido?"*, *"¿Cuál es el riesgo o concentración principal aquí?"*).
   - Cuando el usuario envíe un mensaje desde `/portfolio/[slug]`, si es el primer mensaje o de forma transparente, puedes incluir el contexto de la página actual o mantener el historial limpio.
   - Si está en `/compare`, ofrece sugerencias sobre comparación y diversificación.

2. **Renderizado Limpio de Respuestas (Markdown Ligero)**:
   - Las respuestas del asistente suelen incluir listas con `-` o `*` y negritas `**texto**`. Crea un pequeño formateador seguro sin dependencias externas dentro de `ai-chat-widget.tsx` que renderice párrafos, listas con viñetas limpias y texto en negrita (`<strong className="font-semibold text-ink-900">`) para que las respuestas se lean como un informe ejecutivo de Bloomberg/SpaceX en vez de texto plano crudo.

3. **UX de Cabecera y Móvil**:
   - Agrega un botón sutil `"Limpiar"` (`text-[12px] text-ink-500 hover:text-ink-900`) en el header del chat cuando `messages.length > 0` para reiniciar la vista actual si el usuario quiere hacer otra consulta desde cero.
   - En móvil (`sm:hidden`), asegura que el panel ocupe `100dvh` (`h-dvh`) para que el teclado virtual del teléfono no esconda el input de escritura.

---

## Fase 5 — Verificación Obligatoria

Antes de terminar tu ejecución, corre en el directorio raíz:

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npx next build`

Si cualquiera de los 4 comandos arroja un error o warning bloqueante, corrígelo antes de finalizar. Responde con un resumen conciso de los archivos modificados y el resultado de las 4 verificaciones.
