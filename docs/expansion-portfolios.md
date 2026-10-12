# Expansión de portafolios trackeables

Fecha de verificación: **2026-10-12**. Rama de trabajo: `fase-6-corredoras`. Este documento no cambia código ni schema.

Ya están en el producto (no se repiten abajo como filas nuevas): `pelosi-tracker` (Nancy Pelosi, D-CA, Cámara) y `trump-trades`. En 13F, `scrapers/sec13f.py` ya tiene Berkshire Hathaway (`1067983`), Pershing Square (`1336528`), Appaloosa LP (`1656456`) y un CIK etiquetado Scion (`1644424`).

## Cómo leer los datos

**Verificado** significa que el 2026-10-12 se leyó `https://data.sec.gov/submissions/CIK##########.json` y, cuando se indica valor o número de líneas, el `primary_doc.xml` del 13F-HR más reciente en EDGAR.

**Estimado** significa cifra de un agregador (Capitol Trader, Kapitol.ai, congressflow, spotthemoney, 13f.finance, FolioFact). Esos conteos de trades **no coinciden entre sí** (a veces por un orden de magnitud): cuentan piernas de opciones, cónyuge, duplicados y ventanas históricas distintas. No se recontaron los PDF oficiales. No se publican aquí retornos porcentuales de políticos: los sitios que los calculan no comparten una metodología auditable.

El bridge CongressInvests (`scrapers/congress_api.py`, `https://congressinfor-production.up.railway.app`) une Senado y Cámara. Endpoints públicos relevantes: `/trades/recent`, `/trades`, `/trades/{ticker}`. El trade trae `member` como texto libre. No hay slug oficial: al implementar hay que matchear el nombre tal como lo devuelve el bridge. La fuente legal sigue siendo el PTR de la Cámara (`disclosures-clerk.house.gov`) y el eFD del Senado (`efdsearch.senate.gov`). Los montos del STOCK Act son **rangos**, no acciones exactas, con hasta 45 días de rezago.

Un 13F-HR es el libro largo de valores 13(f) al cierre del trimestre, presentado hasta 45 días después. No incluye cortos, la mayor parte de derivados, bonos, caja ni posiciones confidenciales. No es el AUM del Form ADV.

**Unidad de `tableValueTotal`:** el formulario dice “thousands”, pero varios filers entregan un entero que solo cuadra con el tamaño público del libro si se lee como **dólares**. Duquesne y Baupost sí cuadran leídos como miles. En la tabla se anota la lectura coherente y el entero crudo. No multiplicar por 1.000 sin mirar el XML.

## Hallazgos sobre los cuatro 13F que ya están

| Fondo en código | CIK en código | Qué dice EDGAR el 2026-10-12 |
|---|---|---|
| Berkshire Hathaway | `1067983` | Nombre `BERKSHIRE HATHAWAY INC`. Último `13F-HR` presentado el 2026-08-14. CIK correcto. |
| Pershing Square | `1336528` | Nombre `Pershing Square Capital Management, L.P.`. Último `13F-HR` es el trimestre **2026-03-31**, presentado el 2026-05-15 (11 líneas; `tableValueTotal` 13714299861, lectura dólares ≈ US$13.7B). No aparece un 13F-HR del Q2 2026. |
| Appaloosa | `1656456` | Nombre `Appaloosa LP`. Último `13F-HR` el 2026-08-14. CIK correcto. |
| Scion Asset Management | `1644424` | Ese CIK es hoy **`CareQuo, LLC`** y no tiene `13F-HR`. El filer real es **`Scion Asset Management, LLC`, CIK `0001649339`**. Su último `13F-HR` es el trimestre 2025-09-30, presentado el 2025-11-03 (8 líneas; entero 1381198076, lectura dólares ≈ US$1.38B). No hay 13F de Q4 2025 ni de 2026 en el submissions JSON. No tratar a Burry como feed vivo hasta que vuelva a presentar. |

## 1. Políticos de EE.UU.

Además de Pelosi y Trump. Ordenados por valor de producto: frecuencia reciente y documentación, no por fama. Crenshaw, Wasserman Schultz y Goldman van incluidos porque se pidieron; la nota dice si el volumen real es bajo.

Fuente de todas las filas: CongressInvests (Senado + Cámara por miembro). País: US.

| slug | nombre | gestor/fuente | país | notas/datos necesarios |
|---|---|---|---|---|
| `gottheimer-tracker` | Joshua Gottheimer | CongressInvests · D · Cámara · NJ | US | El más activo en el leaderboard de Capitol Trader al 2026-10-12: **2.318** trades acumulados (estimado), último trade citado 2025-09-25. Capitol Trader y spotthemoney lo muestran operando todavía en sep-2026. Financial Services e Intelligence: el conflicto de comité es el gancho, no un hallazgo nuevo. Hace falta el string `member` del bridge. |
| `khanna-tracker` | Rohit (Ro) Khanna | CongressInvests · D · Cámara · CA | US | Mayor frecuencia por línea en varios agregadores (Kapitol.ai cita **28.551** trades y ~US$182M; congressflow cita **11.575** y ~US$178M; ambos estimados, dato “through Sep 2026”). Distrito de Silicon Valley, libro sesgado a tech. El conteo está inflado por muchas líneas chicas: no clonar un “portafolio” sin deduplicar. |
| `mccaul-tracker` | Michael T. McCaul | CongressInvests · R · Cámara · TX | US | De los libros más grandes en dólares. congressflow: **3.467** trades, volumen estimado ~US$345M, último trade citado 2026-06-29. Kapitol.ai habla de ~US$530M (otra ventana). Gran parte es del cónyuge. Foreign Affairs. Guardar owner (self/spouse) si el bridge lo trae; hoy `congress_api.py` no lo expone. |
| `cisneros-tracker` | Gilbert Ray Cisneros, Jr. | CongressInvests · D · Cámara · CA | US | Frecuencia alta y reciente. Capitol Trader: **1.956** trades, último 2026-08-28. spotthemoney (12 meses): **1.182** trades, lag medio ~27 días. Muchas líneas, tickets chicos (Kapitol.ai ~US$21M). Sirve como feed de actividad, no como libro de convicción. |
| `tuberville-tracker` | Thomas Hawley Tuberville | CongressInvests · R · Senado · AL | US | El senador más seguido por volumen. congressflow: **1.200** trades, ~US$38M estimados, último 2026-06-09. Defensa, energía y opciones; cobertura reiterada por timing y por su asiento en Armed Services. Fuente Senado (eFD), no el clerk de la Cámara. |
| `hern-tracker` | Kevin Hern | CongressInvests · R · Cámara · OK | US | Activo en 2026. Capitol Trader: **578** trades, último 2026-09-15. congressflow: **1.018** trades y ~US$118M estimados. Patrimonio ligado a franquicias; el interés es la cadencia, no un solo ticker. |
| `mcclain-tracker` | Lisa C. McClain | CongressInvests · R · Cámara · MI | US | Una de las cuentas con más líneas en 2025-2026. Capitol Trader: **1.189** trades, último citado 2026-02-06. Yield Theory (ventana 2025-2026): **1.434** líneas, rango agregado estimado US$2.9M–US$24.9M, ticker más repetido NVDA. Liderazgo republicano de la Cámara: confirmar el cargo al publicar la ficha. |
| `delbene-tracker` | Suzan DelBene | CongressInvests · D · Cámara · WA | US | Menos trades que Gottheimer, mucho más tamaño. congressflow: **319** trades y volumen estimado ~US$242M, último 2026-09-14. Patrimonio ligado a Microsoft (cónyuge). Prioridad por dólares, no por número de PTR. |
| `mccormick-tracker` | David H. McCormick | CongressInvests · R · Senado · PA | US | Senador desde 2025, ex CEO de Bridgewater. spotthemoney (12 meses): **238** trades, último filing citado 2026-08-27. Yield Theory: rango agregado estimado US$52M–US$125M, muy concentrado (cita BITB). Banking Committee. Cruce útil con el 13F de Bridgewater, que es otra entidad. |
| `moskowitz-tracker` | Jared Moskowitz | CongressInvests · D · Cámara · FL | US | Activo y visible. congressflow: **364** trades, ~US$3.7M estimados, último 2026-07-13. spotthemoney (12 meses): **114** trades. Tickets menores; entra por cadencia 2026, no por tamaño. |
| `greene-tracker` | Marjorie Taylor Greene | CongressInvests · R · Cámara · GA | US | Capitol Trader al 2026-10-12: **295** trades, último 2025-11-21. Alto seguimiento mediático, no está en el top de actividad 2026. Un agregador (Yield Theory) la marca “former”; Capitol Trader todavía la lista en Cámara. **Confirmar si sigue en el cargo antes de publicar.** |
| `goldman-tracker` | Daniel S. Goldman | CongressInvests · D · Cámara · NY | US | Pedido explícito. Capitol Trader: **1.058** trades, último citado **2025-02-11**. congressflow: **1.247** trades, ~US$33M estimados, misma fecha de último trade. Heredero Levi Strauss, libro histórico grande. Puede estar inactivo en 2026: no promocionarlo como feed frecuente hasta ver un PTR nuevo en el bridge. |
| `crenshaw-tracker` | Daniel Crenshaw | CongressInvests · R · Cámara · TX | US | Pedido explícito. **No es un trader frecuente.** Agregadores serios cuentan decenas de operaciones en toda la carrera (HillStreetBets 23; NexusTrade 41; congressflow solo 8 en su ventana), casi todas en el rango US$1.001–US$15.000. Última actividad citada: 2026-06-01 (AAPL, AMZN, GOOG, META, USOU). NOTUS (2026-07-23) reportó disclosure tardía de opciones de META, pasados los 45 días del STOCK Act. Interés: visibilidad y la nota de compliance, no el volumen. Energy & Commerce / Intelligence según cobertura pública. |
| `wasserman-schultz-tracker` | Debbie Wasserman Schultz | CongressInvests · D · Cámara · FL | US | Pedida explícita. Actividad **moderada y de tickets chicos**, muchas líneas de hijo dependiente. Veridion (snapshot 2026-10-12): **130** filas, 75 compras / 51 ventas, último filing 2026-07-14, último trade citado 2026-06-17 (ICHR). Trendlyne en la misma fecha cuenta solo **24** trades en su ventana. Appropriations (Agriculture, Energy and Water, Military Construction). No rankea con Gottheimer o Khanna. |
| `fields-tracker` | Cleo Fields | CongressInvests · D · Cámara · LA | US | Entra por tamaño de tickets, no por conteo. Yield Theory (2025-2026): **237** líneas, rango agregado estimado US$12.5M–US$33.1M, ticker más repetido NVDA, lag medio ~20 días. Cobertura secundaria de compras NVDA de rango US$1M–US$5M y mayores. Volver a leer el PTR antes de citar el monto en la UI. |

Quedan fuera a propósito, pese a aparecer en rankings: John Boozman (R-AR, Senado) porque una parte grande parece ser T-bills (`TBLL`); Susie Lee (D-NV), April McClain Delaney (D-MD), Jefferson Shreve (R-IN), Markwayne Mullin (R-OK, Senado), Sheldon Whitehouse (D-RI) y Scott Peters (D-CA) son el siguiente corte si se amplía de 15. Ex miembros (David Perdue, Kelly Loeffler, Greg Gianforte, Tom MacArthur) no tienen feed futuro.

## 2. Gestores 13F adicionales

Todos los CIKs de esta tabla se confirmaron en `data.sec.gov` el 2026-10-12. País: US. Gestor/fuente lleva el CIK sin ceros a la izquierda, igual que `FUNDS` en `sec13f.py`.

| slug | nombre | gestor/fuente | país | notas/datos necesarios |
|---|---|---|---|---|
| `tiger-global` | Tiger Global Management LLC | Chase Coleman · CIK `1167483` | US | 13F-HR Q2 2026 presentado el 2026-08-14. **46** líneas. `tableValueTotal` 23981506027, lectura dólares ≈ **US$24.0B**. Libro corto y seguible. Mejor candidato a clonar de esta lista. |
| `coatue` | Coatue Management LLC | Philippe Laffont · CIK `1135730` | US | 13F-HR Q2 2026 el 2026-08-14. **211** líneas. Entero 48629053706, lectura dólares ≈ **US$48.6B**. Firma el primary doc Philippe Laffont (visto en el 13F Q2 2026). Tech growth. Más nombres que Tiger; igual es un libro de convicción, no un market-maker. |
| `duquesne` | Duquesne Family Office LLC | Stanley Druckenmiller · CIK `1536411` | US | 13F-HR Q2 2026 el 2026-08-14. **95** líneas. Entero **5210860**, lectura en miles ≈ **US$5.21B** (esta sí cuadra con la convención del formulario). Family office, alta rotación, muy seguido. No es Duquesne Capital (el hedge fund cerrado en 2010). |
| `third-point` | Third Point LLC | Daniel Loeb · CIK `1040273` | US | 13F-HR Q2 2026 el 2026-08-14. **43** líneas. Entero 4679571988, lectura dólares ≈ **US$4.68B**. Activista, libro concentrado. |
| `baupost` | Baupost Group LLC/MA | Seth Klarman · CIK `1061768` | US | 13F-HR Q2 2026 el 2026-08-13. **23** líneas. Entero **5415853**, lectura en miles ≈ **US$5.42B**. Value, pocas posiciones. El 13F es solo la parte listada en EE.UU.; Klarman tiene mucho fuera de 13(f). |
| `greenlight` | Greenlight (filer vigente: DME Capital Management, LP) | David Einhorn · CIK `1489933` | US | **No usar** `1079114` (`GREENLIGHT CAPITAL INC`): su último `13F-HR` es el 2024-02-14. El filer vivo es DME, CIK verificado `1489933`, 13F-HR Q2 2026 el 2026-08-14, **95** líneas, entero 3908853490, lectura dólares ≈ **US$3.91B**. DME = David Michael Einhorn; el XML confirma el nombre de la entidad, no trae el apellido en el tag de firma que se parseó. |
| `soros` | Soros Fund Management LLC | Family office Soros · CIK `1029160` | US | 13F-HR Q2 2026 el 2026-08-14. **266** líneas. Entero 8143628824, lectura dólares ≈ **US$8.14B**. Sigue presentando. No es un track record de George Soros operando el Quantum Fund. |
| `renaissance` | Renaissance Technologies LLC | Peter Brown (fundador Jim Simons, fallecido en 2024) · CIK `1037389` | US | 13F-HR Q2 2026 el 2026-08-13. **3.140** líneas. Entero 72617871974, lectura dólares ≈ **US$72.6B**. **Este 13F no es Medallion.** Medallion no publica cartera. El filing es el libro institucional externo (RIEF y vehículos similares), muy diversificado: mal clon, buena marca. |
| `bridgewater` | Bridgewater Associates, LP | Firma de Ray Dalio (el 13F es de la LP, no de una persona) · CIK `1350694` | US | 13F-HR Q2 2026 el 2026-08-14. **997** líneas. Entero 24376086530, lectura dólares ≈ **US$24.4B**. Es un recorte long-only del libro All Weather / Pure Alpha, sin los shorts que definen la estrategia. Marca enorme, señal de stock-picking baja. |
| `citadel` | Citadel Advisors LLC | Ken Griffin · CIK `1423053` | US | 13F-HR Q2 2026 el 2026-08-14. **16.127** líneas. Entero 875096281441, lectura dólares ≈ **US$875B**. Ese número es valor bruto de líneas largas 13(f), inflado por market making. No es AUM ni un portafolio clonable. Incluirlo solo como “qué compró el mercado institucional”, no como cartera modelo. |
| `viking-global` | Viking Global Investors LP | Andreas Halvorsen · CIK `1103804` | US | Extra, no estaba en la lista pedida, CIK igual verificado. 13F-HR Q2 2026 el 2026-08-14. **90** líneas. Entero 35079228595, lectura dólares ≈ **US$35.1B**. Long/short equity con libro 13F usable. Mejor quinto clon que Citadel o Renaissance. |

No hace falta “CIK por verificar” en esta lista: los once números salieron del submissions JSON. Millennium (`1273087`) y Point72 (`1603466`) también tienen 13F-HR al 2026-08-14, y se dejan fuera por el mismo problema que Citadel (miles de líneas, poca convicción por nombre).

## 3. Otros portafolios: ETFs y Latinoamérica

Prioridad: pesos **exactos y diarios** (el emisor publica la cartera del ETF) antes que un regulador que publica un agregado mensual. Los ETF de país listados en EE.UU. (ECH, EWW, EWZ, ICOL) salen por el mismo caño que QQQ: holdings diarios de BlackRock, sin scrapear la bolsa local. Tickers confirmados por uso de mercado; al implementar, atar cada uno a la ficha vigente del emisor por si cambió el CSV.

| slug | nombre | gestor/fuente | país | notas/datos necesarios |
|---|---|---|---|---|
| `arkk` | ARK Innovation ETF | Cathie Wood · ARK Invest · ticker ARKK | US | Cartera diaria en CSV en el sitio de ARK (ficha ARKK). Pocos nombres, alta rotación, muy seguida. El mismo adaptador cubre ARKG/ARKW/ARKQ/ARKF si más adelante se quieren. No es un 13F: ARK Investment Management también presenta 13F, pero el CSV diario es mejor. |
| `qqq` | Invesco QQQ Trust | Invesco · ticker QQQ | US | Nasdaq-100. Holdings diarios en la ficha de Invesco. Sirve de benchmark tech al lado de Pelosi/Khanna. Pesos oficiales, no hay que estimarlos. |
| `smh` | VanEck Semiconductor ETF | VanEck · ticker SMH | US | Semis, tema ya usado en la home (`semiconductores`). Holdings diarios de VanEck. Más limpio que armar la temática a mano. |
| `ibit` | iShares Bitcoin Trust | BlackRock · ticker IBIT | US | El vehículo de bitcoin más seguido. Holdings diarios de iShares (casi un solo activo). Cruza con McCormick, que reporta BITB en agregadores. |
| `copx` | Global X Copper Miners ETF | Global X · ticker COPX | US | Mineras de cobre globales, con peso chileno relevante para la audiencia de reclu. Holdings diarios de Global X. Mejor proxy público que scrapear cada minera del IPSA. |
| `ech` | iShares MSCI Chile ETF | BlackRock · ticker ECH | US | Canasta MSCI Chile, holdings diarios de iShares. Complementa Renta 4 / BTG / LarrainVial con un benchmark de mercado, no con otra corredora. |
| `eww` | iShares MSCI Mexico ETF | BlackRock · ticker EWW | US | México vía listing de EE.UU. Holdings diarios. Más fácil de operar que el IPC local. |
| `ewz` | iShares MSCI Brazil ETF | BlackRock · ticker EWZ | US | Brasil vía listing de EE.UU. Holdings diarios. Cubre el grueso de la demanda sin entrar a CVM. |
| `icol` | iShares MSCI Colombia ETF | BlackRock · ticker ICOL | US | Colombia vía listing de EE.UU. Confirmar el CSV en la ficha iShares al implementar (el ticker es el de mercado; no se re-descargó el archivo en esta investigación). |
| `naftrac` | NAFTRAC | BlackRock México · ticker NAFTRAC | MX | ETF local del S&P/BMV IPC. Cartera pública en BlackRock México. Es el benchmark de la BMV, análogo a un IPSA etfizado. Moneda y horario distintos a los de EE.UU.: hace falta FX y calendario de la BMV en precios. |
| `bova11` | iShares Ibovespa | BlackRock Brasil · ticker BOVA11 | BR | ETF local del Ibovespa en B3. PCF / composición pública del emisor y de B3. Misma salvedad de moneda (BRL) y de calendario. |
| `consar-siefores` | Carteras de siefores | CONSAR (regulador) | MX | Composición de las siefores de las Afores, dataset público mensual (no diario) en consar.gob.mx. No es un gestor estrella: es el ahorro previsional mexicano. Elegir **una** siefore de acumulación (p. ej. la básica de mayor equity de XXI Banorte o Profuturo) al implementar; el regulador publica el agregado, no un 13F con CUSIP limpio. Calidad menor que NAFTRAC. |
| `cvm-carteiras` | Fondos de inversión CVM | CVM · dados.cvm.gov.br | BR | **No hay un equivalente limpio al 13F** para Verde, Dynamo o SPX. El dato abierto de CVM trae cadastro e informes; la cartera línea por línea de un FIM suele venir agregada, con rezago, o no estar en el archivo público. No prometer “el libro de Stuhlberger” hasta bajar un informe real y ver columnas. Mientras tanto, BOVA11 y EWZ cubren Brasil. |
| `superfinanciera-afp` | Portafolios de AFP | Superintendencia Financiera | CO | Porvenir, Protección y Colfondos publican composición con rezago regulatorio, no un libro diario. ICOL (fila de arriba) es el camino usable. Dejar esta fila como segunda fase: hace falta identificar el informe periódico vigente y ver si trae emisores o solo clases de activo. |
| `spy` | SPDR S&P 500 | State Street · ticker SPY | US | Benchmark, no un producto “estrella”. Holdings diarios de SSGA. Sirve para el comparador (`/compare`) contra cualquier político o 13F. IVV o VOO son intercambiables. |

Chile no se amplía aquí: Renta 4 ya está verificada y BTG / LarrainVial siguen como están en `docs/sources.md`. InfoProbidad es declaraciones de patrimonio, no un portafolio de inversión.

## Orden sugerido si se implementa después

1. 13F de libro corto, mismo adaptador que ya existe: Tiger, Coatue, Duquesne, Third Point, Baupost, DME (`1489933`). Corregir el CIK de Scion a `1649339` y aceptar que el feed está quieto desde el Q3 2025.
2. Políticos con actividad 2026 en más de un agregador: Gottheimer, Khanna, McCaul, Cisneros, Tuberville, Hern, DelBene, McCormick. Filtrar por `member` en el bridge; no scrapear Capitol Trades (login wall, ya documentado).
3. ETFs diarios de un solo emisor: ARKK, QQQ, SMH, ECH, COPX. Dejan de ser carteras “modelo” armadas a mano.
4. Dejar para el final: Citadel, Renaissance, Bridgewater (marca sin clon), Crenshaw, Wasserman Schultz, Goldman (hasta ver un PTR de 2026), CVM y Superfinanciera.

## Qué no se verificó

- No se llamó al bridge de CongressInvests miembro por miembro (el free tier rate-limita). Los nombres de arriba hay que matchearlos contra `member` real.
- No se abrieron los PDF de la Cámara ni del Senado. Los conteos de trades son de agregadores y se contradicen.
- No se confirmó en el sitio del Congreso si Marjorie Taylor Greene sigue en el cargo. Un agregador dice que no; Capitol Trader al 12 oct 2026 todavía la rankea.
- No se descargaron los CSV de ARK, iShares, Invesco, VanEck, Global X, BlackRock México ni B3. El formato de cada holdings file hay que fijarlo al escribir el adapter.
- No se leyó el Form ADV. Las cifras de esta nota son valor del 13F, no AUM regulatorio.
- El `(thousands)` del 13F no se aplicó a ciegas: donde el entero ya es el tamaño del fondo en dólares, multiplicar por mil daría billones falsos.
