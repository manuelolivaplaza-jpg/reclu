# Lista de imágenes para portfolios — reclu.cl

Análisis de 57 portfolios reales. **No hacen falta 57 imágenes únicas**: se
agrupan por arquetipo visual. Cada arquetipo es 1 imagen de Flow que se reusa
en varios portfolios del mismo tipo. Estética: **blanco y negro, filetes 1px,
abstracto, cero sombras/gradientes** (coherente con docs/hermes-diseno.md).

Proporción recomendada: **1:1** (imagen de perfil/avatar; se recorta a círculo en la UI).

> Confirmado en Flow: modelo **🍌 Nano Banana 2.1**, proporción **1:1**.

---

## Arquetipos (12 imágenes base)

| # | Arquetipo | Portfolios que cubre | Prompt sugerido (Flow / nano banana 2.1) |
|---|---|---|---|
| 01 | **Capitolio / Congreso** | Pelosi, Trump, Cisneros, Hern, Gottheimer, Fields, McClain Delaney, Moskowitz, Congress Buys (9) | Imagen abstracta B/N: silueta estilizada de un edificio de Capitolio/domo, líneas de arquitectura limpias, minimalista, mucho espacio negativo, alto contraste, sin texto. |
| 02 | **Toros / mercados** | Congress Buys, todos los políticos (versión alternativa) | Imagen abstracta B/N: silueta de toro de Wall Street reducida a líneas geométricas, minimalista, sin texto. |
| 03 | **Retrato legendario (inversor viejo)** | Buffett, Klarman, Ackman, Dalio, Loeb, Tepper, Druckenmiller (fondos value) | Retrato estilizado B/N de un inversor anciano genérico, iluminación dramática lateral, grano fino, estilo editorial financiero, sin texto, sin rostro real identificable. |
| 04 | **Retrato joven (nueva ola)** | Burry, Cathie Wood ARK, Chase Coleman (ARK, growth) | Retrato estilizado B/N de una persona joven profesional, mirada al frente, iluminación dramática, editorial, sin texto. |
| 05 | **Algoritmo / cuant** | Renaissance, Bridgewater, Soros, Duquesne (cuant) | Imagen abstracta B/N: red de nodos y líneas matemáticas, patrón algorítmico, profundidad sutil, sin texto. |
| 06 | **Soberano / fondo país** | PIF (Arabia), Mubadala (EAU), TCI, Cevian, Egerton, SoftBank (internacional) | Imagen abstracta B/N: geometría islámica/arquitectónica monumental, patrón simétrico, monumental, sin texto. |
| 07 | **Chip / semiconductores** | Carrera de Semiconductores (1) | Imagen abstracta B/N macro: superficie de un chip de silicio, circuitos, líneas finas, sin texto. |
| 08 | **Gráfico / datos** | Portadas "auto" alternativas, S&P 500 Top 10, Inverse Cramer | Imagen abstracta B/N: líneas de un gráfico de velas/acciones estilizadas, ascendente, minimalista, sin texto. |
| 09 | **Barrenador / energía** | Energías Renovables, Utilities Defensivas | Imagen abstracta B/N: aspas de turbina eólico o paneles solares en silueta, cielo despejado, minimalista, sin texto. |
| 10 | **Batería / litio** | Litio y Minería, Lithium & Battery (LIT), Copper Miners (COPX) | Imagen abstracta B/N macro: celdas de batería / mineral / venas de cobre, textura industrial, sin texto. |
| 11 | **Banca / finanzas** | Bancos Chilenos, Fintech Global, Latin Tech, Dividendos IPSA, Retail Chileno | Imagen abstracta B/N: fachada de banco clásico con columnas, líneas limpias, monumental, sin texto. |
| 12 | **Mapa / global** | AI World War III, Claude Portfolio, Cybersecurity (BUG), Video Games (HERO), Bonos del Tesoro, Dividend Aristocrats | Imagen abstracta B/N: red de líneas conectando puntos estilo mapa-mundi digital, nodos, sin texto. |

---

## Portadas especiales (opcionales, 1 c/u si se quiere marca propia)
- **Logo oficial de fondo** (Berkshire, ARK, Global X, etc.): usar el logo real del fondo con **uso editorial** (no copiar de Autopilot). Se sube manual a `cover_type='upload'`.
- **Retratos reales de políticos** (Pelosi, Trump): foto de dominio público del Congreso (son figuras públicas, sus retratos oficiales son de dominio público del gobierno de EE.UU.).

---

## Notas de producción (Flow)
1. **Agente ON** para respetar proporción 16:9.
2. Prompt en español, **"Sin texto"** siempre al final (evita que el modelo escriba letras).
3. Guardar en `C:\Users\manue\OneDrive\Desktop\reclu\public\covers\` con nombre `<arquetipo>.png`.
4. 1 reintento por imagen si el primero no sirve.

## Mi recomendación
Generar primero los **12 arquetipos base**. Con eso cubres los 57 portfolios
asignando 1 arquetipo por categoría/tema. Es escalable, coherente, y no
requiere 57 generaciones. Los logos oficiales y retratos van en fase 2.
