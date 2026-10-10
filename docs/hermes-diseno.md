# Brief de ejecución — diseño reclu.cl estilo Autopilot

Léelo completo antes de tocar código. Ejecuta las fases en orden. No rediseñes por tu cuenta fuera de este documento. No cambies lógica de negocio.

El objetivo visual: que la home se sienta como el marketing de **Autopilot** (joinautopilot.com) con la contención de **SpaceX.com**. Blanco y negro. La tipografía es el diseño. Los números de rendimiento son el producto. Cero azul SaaS.

## Diagnóstico (no lo repitas, arréglalo)

Hoy el sitio está generado como plantilla Stripe / Linear / Vercel. La prueba está en el comentario de `src/app/globals.css` (“Inspired by Stripe / Linear / Vercel”) y en estos patrones, que hay que eliminar de la landing:

- Fuente Inter.
- Azul `#2563eb` como marca (`brand-600`, gradiente en el H1, iconos en cajas `bg-brand-50`).
- Hero centrado, pastilla “Nuevo”, grilla de fondo, glow radial, mock de email con tres puntitos de ventana.
- Grilla de 6 features con icono Lucide en cuadrado de color.
- “Cómo funciona” con iconos, línea degradada y números en círculos azules.
- Stats débiles (“10+”, “5”, “Diarias”, “100%”) y chips de fuentes con sombra.
- Cards con `shadow-card`, `hover:-translate-y-0.5` y borde que se pone azul.
- Banda final en degradado azul (`from-brand-700`).
- Eyebrows en mayúsculas con `tracking-widest text-brand-600` en cada sección.
- Logo: cuadrado azul con línea de gráfico. El “.cl” va en azul.

Eso es lo genérico. Autopilot no hace nada de eso.

## Qué es Autopilot, en reglas que sí puedes implementar

Referencia de lenguaje, no de producto. reclu **no** copia trades ni ejecuta órdenes. El copy legal se queda. Solo cambia la forma.

1. Fondo `#ffffff`. Texto `#0a0a0a`. Gris de apoyo `#6b6b6b`. Líneas `#e6e6e6`.
2. El verde y el rojo existen solo en cifras de rendimiento. Nunca como color de marca, nunca en fondos grandes, nunca en iconos.
3. Un titular enorme, corto, negro, alineado a la izquierda, tracking apretado, interlineado menor que 1. En 1440px de ancho el H1 mide como mínimo 88px.
4. Un botón primario: píldora negra, texto blanco. El secundario es un enlace de texto con flecha, no un botón con borde.
5. Casi sin sombras. Separación por espacio y por filetes de 1px.
6. Una idea por pantalla. Mucho aire (`padding` vertical 7–9rem en desktop).
7. Al menos una banda a sangre completa en negro con una sola frase en blanco. Ese es el momento SpaceX.
8. Las carteras se muestran como filas tipográficas (nombre grande, porcentaje enorme, sparkline fina), no como cards de dashboard.
9. Cero iconos en la landing. Cero emojis como adorno. Cero fotos de stock. Cero degradados. Cero glass. Cero bento. Cero grilla de puntos.

## Qué no puedes hacer

- No toques `supabase/`, `scrapers/`, `src/lib/queries.ts`, `src/app/actions/`, `src/app/api/`, `src/lib/supabase/`, tests, ni el esquema. Si un componente necesita datos, usa los que ya recibe.
- No cambies precios, límites del plan gratis (2 portafolios), ni frases legales (“no ejecutamos órdenes”, “no es asesoría”).
- No inventes testimonios, logos de prensa, ni métricas de usuarios.
- No agregues dependencias. Ni Framer Motion, ni librerías de animación, ni kits de componentes. La fuente sale de `next/font/google`.
- No agregues dark mode.
- Antes de editar UI de Next, lee la guía que corresponda en `node_modules/next/dist/docs/`. Este proyecto es Next.js 16 y no coincide con lo que recuerdas de versiones viejas. Obedece los avisos de deprecación.
- No dejes la landing “un poco más limpia” sobre la estructura actual. Hay que reemplazar secciones, no retocarlas.

## Sistema visual (cúmplelo al pie de la letra)

### Color

En `src/app/globals.css`, reemplaza la paleta. Valores:

| Token | Valor | Uso |
|---|---|---|
| `--color-background` | `#ffffff` | página |
| `--color-ink-950` / `--color-ink-900` | `#0a0a0a` | texto, botones, bandas |
| `--color-ink-600` / `--color-ink-500` | `#6b6b6b` | texto secundario |
| `--color-ink-300` / línea | `#e6e6e6` | filetes, bordes |
| `--color-ink-100` / `--color-ink-50` | `#f6f6f6` | único gris de superficie, y poco |
| `--color-positive` | `#0f7a32` | solo números positivos |
| `--color-negative` | `#c81e1e` | solo números negativos |
| `--color-positive-bg` / `--color-negative-bg` | quítalos del diseño | no uses pastillas de color detrás de un porcentaje |

Remapea `--color-brand-50` … `--color-brand-900` a una escala de grises que termina en `#0a0a0a` en `brand-600` y `#000000` en `brand-700`–`900`. Así el azul desaparece del dashboard y de las páginas legales en el mismo paso, aunque alguna clase `text-brand-600` sobreviva. Después, en la landing, no uses clases `brand-*`.

`--color-accent-*` deja de ser verde de marca. Si algo sigue usando `accent`, que caiga a negro o a `#0f7a32` solo si es una cifra.

Sombras: `--shadow-subtle`, `--shadow-card`, `--shadow-raised` y `--shadow-pop` pasan a `none`.

`--radius-card: 0px`.

Borra las utilities `bg-grid` y `bg-glow`. Si algo las usa, quita la clase en ese archivo.

Selección de texto: fondo `#0a0a0a`, texto blanco. Focus visible: outline de 1px `#0a0a0a`, offset 3px. Sin anillo azul.

### Tipografía

En `src/app/layout.tsx` cambia Inter por **Instrument Sans** (`next/font/google`, pesos 400, 500, 600). Variable CSS `--font-sans`. Quita los `font-feature-settings` de Inter.

Escala, definida como utilities en `globals.css` para no repetir clases arbitrarias:

- `type-display`: `font-weight: 500; letter-spacing: -0.045em; line-height: 0.92;` tamaño `clamp(2.75rem, 7.4vw, 6.5rem)`.
- `type-section`: `font-weight: 500; letter-spacing: -0.04em; line-height: 0.96;` tamaño `clamp(2.25rem, 4.6vw, 4.25rem)`.
- `type-body`: `font-size: 1.0625rem; line-height: 1.5; color: #6b6b6b;` medida máxima ~42rem cuando es un párrafo suelto.
- Cifras: `font-variant-numeric: tabular-nums; letter-spacing: -0.03em; font-weight: 500`.

No uses `uppercase tracking-widest` en eyebrows de sección. Si hace falta una etiqueta, es una línea de 13px, color `#6b6b6b`, sin mayúsculas forzadas, peso 400.

### Botones

En `src/components/ui/button.tsx`:

- `primary`: fondo `#0a0a0a`, texto blanco, `border-radius: 999px`, sin sombra. Hover: `#000`. Tamaño `lg`: alto 48px, padding horizontal 22px, texto 15px, peso 500.
- `secondary` se elimina del uso público. No lo dejes como segundo botón negro.
- `outline`: fondo transparente, borde 1px `#0a0a0a`, texto negro, píldora. Úsalo solo si un botón outline es inevitable (plan Gratis). En la landing el segundo CTA es un enlace, no este botón.
- `ghost`: texto `#0a0a0a`, sin fondo, sin pastilla gris en hover. Hover: opacidad 0.6.
- Focus outline negro, no `brand-500`.

### Logo

`src/components/logo.tsx`: el lockup es solo la palabra `reclu` en Instrument Sans, peso 600, tracking `-0.04em`, color `#0a0a0a`, tamaño ~18px en el header. Sin SVG, sin cuadrado, sin gradiente, sin `.cl` de otro color. En footer sobre negro, el mismo wordmark en blanco vía una prop `tone="inverse"`.

### Contenedor

`container-page`: `max-width: 1120px`, padding horizontal `1.25rem` en móvil y `2.5rem` desde `md`. El H1 vive dentro de ese contenedor, alineado a la izquierda, y puede ocupar todo el ancho.

## Nueva home

`src/app/page.tsx` queda así, y nada más:

```tsx
<SiteHeader />
<main id="main">
  <Hero />
  <SourceLine />
  <PortfolioStage />
  <Statement />
  <HowItWorks />
  <Pricing />
  <FAQ />
  <Close />
</main>
<SiteFooter />
```

Deja de renderizar `Features`, `SocialProof`, `PortfoliosTeaser`, `LivePortfolios` y `FinalCTA`. Puedes borrar esos exports si ya nadie los importa. No mantengas las secciones viejas “por si acaso” comentadas.

### 1. Header — `src/components/site-header.tsx`

- Fondo blanco sólido. Filete inferior 1px `#e6e6e6`. Alto 64px. Sin blur, sin `bg-white/85`.
- Izquierda: wordmark. Centro u derecha de los links: `Portafolios` → `/explore`, `Cómo funciona` → `/#como-funciona`, `Precios` → `/#precios`. Texto 14px, `#0a0a0a`, peso 400. Hover: opacidad 0.55.
- `Entrar` es texto, no botón (`/login`). `Empezar` es `ButtonLink` primary hacia `/signup`.
- Móvil: el mismo filete, menú a pantalla completa blanca, links en `type-section` chico (clamp ~32px), no una lista de pills. CTA negro al fondo del menú.

### 2. Hero — reescribe `src/components/sections/hero.tsx`

Sin fondo decorativo. Padding superior ~7.5rem desktop, ~4.5rem móvil. Alineado a la izquierda.

- H1, clase `type-display`, color `#0a0a0a`, máximo ancho ~16 caracteres por línea:

  **Sigue las carteras que mueven el mercado.**

- Párrafo, `type-body`, margen superior 1.5rem, máximo ~36rem:

  Políticos de EE.UU., corredoras chilenas y fondos. Una alerta en tu correo cuando algo cambia. Sin órdenes. Sin ruido.

- Fila de acciones, margen superior 2rem: botón `Empezar` (primary, lg, href `/signup`) y al lado un enlace de texto `Ver portafolios →` hacia `/explore`. El enlace es 15px, negro, subrayado solo en hover. En móvil se apilan, alineados a la izquierda, no al centro.
- Una línea de 13px `#6b6b6b` debajo: `Gratis en 2 portafolios. Sin tarjeta.`
- No hay pastilla “Nuevo”. No hay H1 a dos colores. No hay mock de correo. No hay `HeroChart` en el hero.

Debajo del texto, todavía dentro del hero, con margen superior ~4.5rem, va una muestra de tres filas. Es el mismo componente visual que `PortfolioStage`, con estos datos ilustrativos (ya existen en `live-portfolios.tsx`; muévelos a un módulo `src/components/sections/portfolio-data.ts` y úsalo en los dos sitios):

| Nombre | Meta | Retorno | Holdings |
|---|---|---|---|
| Pelosi Tracker | Políticos EE.UU. | +31.4% | NVDA, AAPL, MSFT |
| AI World War III | Temáticos | +42.8% | NVDA, TSM, AMD |
| Renta 4 Moderada | Corredoras Chile | +12.6% | COPEC, SQM-B, BSANTANDER |

Cada fila: filete superior 1px `#e6e6e6`. Grid de tres columnas en desktop (nombre / sparkline / retorno). En móvil, nombre y retorno en la misma línea, sparkline debajo a ancho completo.

- Nombre en 22–28px, peso 500, tracking `-0.03em`.
- Meta en 13px `#6b6b6b`, debajo del nombre. País como código `US` o `CL`, no como emoji.
- Retorno en `clamp(2rem, 4vw, 3.25rem)`, peso 500, tabular, `#0f7a32` si es positivo. Sin icono de trending. Sin pastilla.
- Sparkline negra de 1.5px, sin relleno de área, sin gradiente azul. Reutiliza `src/components/sparkline.tsx` si el trazo puede ser negro; si el componente pinta verde o azul, cámbialo para aceptar `stroke` y usa `#0a0a0a`.
- La fila entera enlaza a `/portfolio/[slug]`. Hover: el nombre pasa a subrayado. Sin lift, sin sombra, sin borde azul.
- Última fila cierra con filete inferior.

`src/components/hero-chart.tsx` se puede quedar en el repo si el detalle de portafolio no lo usa. No lo montes en la home. Si solo lo usaba el hero, bórralo.

### 3. SourceLine — nuevo componente en `src/components/sections/source-line.tsx`

Una sola línea, no una sección con título. Filete superior e inferior. Padding vertical 1.25rem. Texto 13px `#6b6b6b`, centrado, separado por puntos medios:

`Capitol Trades · Renta 4 · LarrainVial · BTG Pactual · InfoProbidad · SEC 13F`

Sin chips, sin sombras, sin stats “10+”.

### 4. PortfolioStage — reemplaza `live-portfolios.tsx`

Sección con id `portafolios` por si algún link viejo apunta ahí; el nav nuevo apunta a `/explore`, así que el id es opcional.

- Label de 13px: `Esta semana`.
- H2 `type-section`: `Lo que está moviéndose.`
- Debajo, las mismas filas del hero más una cuarta: Claude Portfolio, Temáticos, +28.3%, GOOGL AMZN NVDA, slug `claude-portfolio`.
- A la derecha del H2, en desktop, enlace `Ver todos →` a `/explore`.
- No uses `Badge`. No uses banderas. No uses `Flame`.

### 5. Statement — nuevo, reemplaza `features.tsx`

Sección a sangre, fondo `#0a0a0a`, texto blanco. Padding vertical `clamp(6rem, 14vw, 10rem)`. Una sola frase, clase `type-section` pero en blanco, máximo ~16ch, alineada a la izquierda dentro del contenedor:

**No invertimos por ti. Te avisamos cuando ellos se mueven.**

Debajo, 15px, blanco al 62%:

Cuatro fuentes públicas. Un correo cuando hay un cambio. Tu plata sigue en tu corredora.

Sin iconos, sin grilla, sin botón. Esta sección absorbe el mensaje de “solo notificaciones” y el de “fuentes”. No reconstruyas la grilla de 6 features en otro archivo.

### 6. Cómo funciona — reescribe `how-it-works.tsx`

Fondo blanco. id `como-funciona`.

H2 `type-section`: `Tres pasos.`

Luego tres columnas en desktop, una en móvil, separadas por filetes verticales de 1px solo desde `lg` (la primera no lleva filete a la izquierda). Sin iconos, sin círculos, sin línea conectora.

Cada paso:

- Número `01` `02` `03` en 13px `#6b6b6b`.
- Título en ~28px, peso 500, tracking `-0.03em`: `Elige.` / `Vigilamos.` / `Llega a tu correo.`
- Párrafo 15px `#6b6b6b`, margen superior 0.75rem. Reutiliza el sentido de los textos actuales, más corto:

  1. Explora políticos de EE.UU., carteras de Renta 4 y tesis temáticas. Sigues hasta dos en el plan gratis.
  2. Revisamos Capitol Trades, las corredoras y los filings, y normalizamos cada cambio.
  3. Te llega un correo con el movimiento y, en Pro, un resumen. Tú decides qué hacer.

### 7. Precios — reescribe `pricing.tsx`

id `precios`. H2: `Empieza en cero.`

Dos columnas, máximo ~880px, gap 1px sobre fondo `#e6e6e6` (el gap es el filete) o borde 1px. Radio 0. Sin badge “Más popular”. Sin `Sparkles`. Sin corona.

**Gratis**, fondo blanco:

- Etiqueta `Gratis` 13px `#6b6b6b`.
- Precio `$0` en `type-section`.
- `Para siempre` en 13px.
- Lista sin iconos de check verdes. Cada ítem es una línea con filete inferior y el texto a la izquierda. Features actuales, sin inventar otras.
- Botón outline a ancho completo: `Crear cuenta`.

**Pro**, fondo `#0a0a0a`, texto blanco:

- Etiqueta `Pro` 13px blanco al 60%.
- Precio `$9.990` en el mismo tamaño, blanco. `CLP / mes` en 13px blanco al 60%.
- Lista igual, filetes `rgba(255,255,255,0.16)`, texto blanco.
- Botón píldora blanca, texto negro: `Pasar a Pro` → `/signup?plan=pro`.

Debajo, una línea 13px: `Planes para equipos: hola@reclu.cl`. Link negro, subrayado en hover.

### 8. FAQ — reescribe el bloque FAQ de `faq.tsx`

H2: `Preguntas.`

Sin card contenedora, sin sombra. Cada pregunta es un `details` con filete superior 1px. Padding vertical 1.35rem.

- Pregunta en 22–26px, peso 500, tracking `-0.03em`, negro.
- El control es un `+` de 22px, negro, que rota a `×` al abrir. Sin círculo, sin color de marca.
- Respuesta 16px `#6b6b6b`, máximo ~40rem, margen superior 0.75rem.
- Conserva las seis preguntas y sus respuestas. No las reescribas para que suenen más marketing. Sí puedes bajar un adjetivo si una frase queda larga, sin cambiar el significado legal.

### 9. Close — reemplaza `FinalCTA` en `faq.tsx`

Fondo blanco. Padding vertical amplio. Sin caja, sin degradado, sin radio.

H2 `type-display`, máximo ~12ch: `Deja de revisar filings.`

Botón primario `Empezar` hacia `/signup`. Nada más.

### 10. Footer — `site-footer.tsx`

Fondo `#0a0a0a`. Wordmark blanco. Columnas Producto / Legal con los links actuales, 14px, blanco al 62%, hover blanco. El grupo “Recursos” se puede quedar si sus anclas siguen existiendo; si una ancla murió, apunta el link a la ruta real (`/explore`, `/#precios`, `/#como-funciona`, `/#faq`).

Línea inferior: `© {año} reclu.cl` y el disclaimer actual en 12px, blanco al 45%. El disclaimer no se acorta hasta perder el “no es asesoría”.

## Resto del sitio (después de que la home cumpla el checklist)

La home es el trabajo. Estas pantallas heredan el sistema para que el producto no vuelva al azul en el segundo clic. No las rediseñes como otro concepto: mismo blanco, mismos filetes, misma píldora negra, mismos titulares.

### Explorar — `src/app/explore/page.tsx`, `explore-filters.tsx`, `portfolio-card.tsx`

- H1 con `type-section`: `Portafolios.` Fondo blanco, no `bg-surface`.
- Filtros: texto 14px. El activo lleva subrayado de 1px negro, no pastilla `bg-brand-600`. El inactivo es `#6b6b6b`.
- El input de búsqueda: borde 1px `#e6e6e6`, radio 0, focus borde negro, sin anillo azul (`src/components/ui/input.tsx` también).
- `PortfolioCard` deja de ser una card con badge de color. En desktop puede seguir en grilla de 2 o 3, pero cada una es: filete 1px, radio 0, sin sombra, sin hover-lift. Nombre 20px peso 500. Retorno grande en verde o rojo, tabular, sin icono. Categoría en 13px gris. Link del título en negro, subrayado en hover, nunca `text-brand-700`.
- Quita las banderas emoji. Usa `US`, `CL` o `Global` en 11px tracking `0.08em`.
- El estado vacío es una frase, no una caja dashed con icono.

### Detalle — `src/app/portfolio/[slug]/page.tsx`

- H1 en `type-section`.
- El retorno YTD pasa a ser la segunda pieza más grande de la página, a la derecha en desktop, encima en móvil. Verde o rojo, sin pastilla.
- Holdings como tabla de filetes, header en 13px gris, sin fondo `bg-ink-50` gris fuerte.
- El bloque de resumen AI, si se pinta con `bg-brand-50`, pasa a fondo blanco con filete izquierdo de 2px negro. Texto negro y gris. Sin `Sparkles` de color.

### Auth — `login/page.tsx`, `signup/page.tsx`, `auth-form.tsx`

- Quita `bg-glow`. Página blanca.
- Wordmark arriba del form, centrado en la columna, no en la página entera como hero de SaaS. El form tiene `max-w-sm`, títulos en ~32px peso 500 tracking tight: `Entrar.` / `Crear cuenta.`
- Botón submit píldora negra a ancho completo.
- Links `text-brand-600` pasan a negro con subrayado.
- El footer de estas páginas puede ser una sola línea de disclaimer, no el footer de marketing completo. Si lo dejas, que sea el footer negro nuevo, no el gris anterior.

### Dashboard — `src/app/(dashboard)/layout.tsx`, `dashboard-nav-link.tsx`, páginas `dashboard`, `alerts`, `settings`, `compare`

- Fondo de la app: blanco, no `bg-surface` gris.
- Sidebar: link activo con filete izquierdo 2px negro y texto negro. Inactivo `#6b6b6b`. Sin `bg-brand-50`.
- Iconos Lucide permitidos aquí, 16px, stroke 1.5, color heredado del texto. Sin cajas de color detrás.
- Banner de upgrade: filete negro, sin `bg-brand-50` ni corona de color. Un botón píldora negro.
- Alertas: el bloque “Resumen AI” igual que en el detalle (filete izquierdo negro, fondo blanco).

### Páginas menores

`terminos`, `privacidad`, `disclaimer`, `not-found`, `error`, `loading`: cambia lo azul que quede (links, spinner, botones sueltos que no usan `Button`) a negro. El spinner de `loading.tsx` es un aro negro, no `border-t-brand-600`. No remaquetes el texto legal.

## Orden de trabajo

Haz un cambio coherente por fase y deja el proyecto compilando al final de cada una. No abras las cinco a la vez.

1. **Tokens, fuente, botón, logo, sombras a cero.** Revisa que no quede azul obvio en login y dashboard aunque la home siga vieja. Comando: `npm run typecheck`.
2. **Home nueva** (header, hero, source line, stage, statement, steps, pricing, FAQ, close, footer). Borra secciones muertas y sus imports.
3. **Explore, card, detalle.**
4. **Auth y dashboard.**
5. **Barrido final de azul.**

Barrido, desde la raíz del repo, y el resultado tiene que ser cero en `src/`:

- `brand-600`, `brand-500`, `brand-700`, `from-brand`, `to-brand`, `bg-brand`
- `bg-glow`, `bg-grid`
- `shadow-pop`, `shadow-raised`, `shadow-card`
- `text-brand-`

Si una clase `brand-*` sobrevive, o la borras o confirmas que el token ya es negro y que no se ve azul. La landing no debe contener ninguna.

Tampoco debe quedar en la landing: `Sparkles`, `Flame`, `BellRing`, `Brain`, `ShieldCheck`, `Crown`, `TrendingUp`.

## Checklist de aceptación

No des el trabajo por terminado si falla un punto.

- [ ] En 1440px el H1 de la home es negro, alineado a la izquierda, y mide al menos 88px.
- [ ] No hay azul en `/`, `/explore`, `/login`, `/signup`.
- [ ] El botón primario es una píldora negra.
- [ ] Hay una banda negra a sangre con una sola frase blanca.
- [ ] Las carteras de la home son filas con filete, porcentaje grande y sparkline negra. No hay mock de email ni ventana con tres puntos.
- [ ] No hay grilla de features con iconos, ni stats “10+ / 100%”, ni banda final en degradado.
- [ ] No hay sombras ni hover que levante cards.
- [ ] El wordmark es solo `reclu`, negro sobre blanco y blanco sobre negro.
- [ ] Precios siguen siendo $0 y $9.990 CLP. El plan Pro se lee en negativo (fondo negro).
- [ ] El disclaimer de no asesoría sigue visible en el footer.
- [ ] `npm run typecheck` pasa.
- [ ] `npm run test` pasa.
- [ ] Recorriste en el navegador, desktop ~1440 y móvil ~390: `/`, `/explore`, `/login`, `/signup`, y un detalle `/portfolio/pelosi-tracker` si la página carga sin sesión. Click en `Empezar`, en `Ver portafolios`, en una fila, en una pregunta del FAQ, y en el menú móvil. Si una de esas rutas exige Supabase y falla por env, dilo; no lo disimules.

## Copy que no debes “mejorar”

Estas frases son el tono. No las cambies por variantes más largas, más ingeniosas, ni en inglés.

| Lugar | Texto |
|---|---|
| H1 | Sigue las carteras que mueven el mercado. |
| Sub | Políticos de EE.UU., corredoras chilenas y fondos. Una alerta en tu correo cuando algo cambia. Sin órdenes. Sin ruido. |
| CTA | Empezar |
| Banda negra | No invertimos por ti. Te avisamos cuando ellos se mueven. |
| H2 pasos | Tres pasos. |
| H2 precios | Empieza en cero. |
| H2 cierre | Deja de revisar filings. |
| H2 carteras | Lo que está moviéndose. |

Si una frase no cabe en móvil, baja el `clamp` del estilo. No acortes el H1.
