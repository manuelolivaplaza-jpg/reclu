# Expansión de portafolios trackeables (fuera de EE.UU.)

Fecha de verificación: **2026-10-12**. Rama de trabajo: `fase-6-corredoras`. Este documento no cambia código ni schema.

No repite filas de `docs/expansion-portfolios.md`. Allí ya están los políticos de EE.UU., los 13F estadounidenses (Tiger, Coatue, Duquesne, Third Point, Baupost, DME, Soros, Renaissance, Bridgewater, Citadel, Viking) y los ETF ECH, EWW, EWZ, ICOL, NAFTRAC, BOVA11, ARKK, QQQ, SMH, IBIT, COPX y SPY. Chile (Renta 4, BTG, LarrainVial) sigue en `docs/sources.md`. CONSAR, CVM y Superfinanciera ya están anotados como segunda fase.

## Cómo leer el estado

**Verificado** significa que el 2026-10-12 se leyó el artefacto citado: `https://data.sec.gov/submissions/CIK##########.json` y el `primary_doc.xml` del `13F-HR` (periodo 2026-06-30 en todos los filers de la tabla 1), o la ficha / informe que la fila nombra.

**Parcial** significa que una parte se abrió y otra no. El número que no se leyó no se inventa.

**Por verificar** significa que no se abrió el archivo canónico. Una nota de prensa o un agregador no convierte la fila en feed.

Un 13F-HR es el libro largo de valores 13(f) listados en EE.UU., con hasta 45 días de rezago. No es el AUM del Form ADV. No trae cortos, la mayor parte de derivados, bonos, caja, tratamiento confidencial ni listings que no son 13(f). Un fondo europeo o un soberano puede ser enorme y mostrar aquí solo la tajada estadounidense.

**Unidad de `tableValueTotal`.** El formulario habla de miles. En esta tanda la mayoría de los XML cuadra en **dólares** (precio implícito = valor / acciones). La excepción leída línea por línea es **AKO**: el entero está en **miles**. No multiplicar el resto por 1.000. Donde no se cruzó una línea valor/acciones, la fila lo dice y la lectura en dólares es una inferencia (miles daría un AUM absurdo), no una prueba.

`tableEntryTotal` es líneas crudas, no emisores únicos. Varias clases del mismo nombre cuentan aparte.

## 1. Fondos internacionales con 13F

Prioridad: libro corto y seguible. País es el del gestor, no el de la bolsa. Gestor/fuente lleva el CIK sin ceros a la izquierda. Todos los `13F-HR` de abajo son del trimestre **2026-06-30**.

| slug | nombre | gestor/fuente | país | datos necesarios | estado |
|---|---|---|---|---|---|
| `tci` | TCI Fund Management Ltd | Christopher Hohn · CIK `1647251` | GB | Presentado el 2026-08-14. Accession `0001647251-26-000007`. **11** líneas. Entero `52769884406`, dólares ≈ **US$52.8B** (GE Aerospace 17,725,353,519 / 47,428,233 acciones ≈ US$374). Holdings report. Londres. Es el mejor clon corto de esta lista. El 13F omite lo que no es valor 13(f). | Verificado |
| `pif` | Public Investment Fund | PIF · CIK `1767640` | SA | Presentado el 2026-08-14. Accession `0001011438-26-000537` (agente de filing, no el CIK). **5** líneas. Entero `37908748002`, dólares ≈ **US$37.9B**. Combination report. En el XML se leyeron tres líneas: SpaceX 26,337,528,228 / 154,146,835; Uber 5,256,173,439 / 72,840,541; Electronic Arts 5,086,618,377 / 24,807,932. Las líneas 4 y 5 no se imprimieron: no citar otros tickers. No es Neom ni el libro local saudí. | Verificado |
| `cevian` | Cevian Capital II GP Ltd | Cevian · CIK `1365341` | JE / SE | Presentado el 2026-08-14. Accession `0000902664-26-003474`. **3** líneas. Entero `3697388724`, dólares ≈ **US$3.70B**. UBS Group 2,384,711,973 / 48,117,675; Autoliv 731,697,674 / 6,298,508; CRH 580,979,077 / 5,429,711. Dirección de filing en St Helier; la firma es el activista sueco. Solo la tajada con listing 13(f), no el libro europeo. | Verificado |
| `egerton` | Egerton Capital (UK) LLP | John Armitage · CIK `1581811` | GB | Presentado el **2026-07-21** (antes del cluster del 14 ago). Accession `0001581811-26-000007`. **23** líneas. Entero `10351358177`, dólares ≈ **US$10.4B**. Visa 1,463,159,112 / 4,264,651 ≈ US$343. Long/short: el 13F es solo el largo estadounidense. | Verificado |
| `ako` | AKO Capital LLP | AKO · CIK `1376879` | GB | Presentado el 2026-08-12. Accession `0001376879-26-000006`. **22** líneas. Entero de carátula `4292009`. El infotable **no** se llama `infotable.xml`: es `13F_report_20260630.xml`. La suma de `<value>` es 4,292,009 y está en **miles** ≈ **US$4.29B**. Amazon 272,145 miles / 1,141,835 acciones = US$238.34. Alcon 651,941 miles / 9,683,004 ≈ US$67.3. Nicolai Tangen fundó AKO y hoy dirige NBIM; este filing es de la LLP, no de Norges. No mezclarlos. | Verificado |
| `sb-advisers-uk` | SB Investment Advisers (UK) Ltd | SoftBank Vision Fund (libro listado) · CIK `1731509` | GB | Presentado el 2026-08-14. Accession `0001493152-26-038416`. **9** líneas. Entero `7662358625`, dólares ≈ **US$7.66B**. Coupang 5,029,349,039 / 289,542,259; Grab 1,514,773,453 / 401,796,672; Relay Therapeutics 522,101,858 / 27,904,963. No incluye unicornios privados. **No unir** con el CIK de SoftBank Group. | Verificado |
| `softbank-group` | SoftBank Group Corp. | SoftBank Group · CIK `1065521` | JP | Presentado el 2026-08-14. Accession `0001062993-26-004387`. Infotable `form13fInfoTable.xml`, **33** líneas, suma = carátula `18174540337`, dólares ≈ **US$18.2B**. Intel 12,141,739,167 / 86,956,522; T-Mobile US 1,677,300,000 / 10,000,000; Symbotic 899,000,000 / 20,000,000. La carátula parseada dice holdings report. Afiliadas presentan sus propios 13F. Varias clases pueden partir un mismo nombre: citar líneas crudas. | Verificado |
| `hhlr` | HHLR Advisors, Ltd. | ex Hillhouse Capital Advisors · CIK `1762304` | KY | Presentado el 2026-08-14. Accession `0000919574-26-005568`. **35** líneas. Entero `832072843`. Combination report. Firma Audrey Woon. Lectura en dólares ≈ **US$832M** porque en miles serían ~US$832B. **No se cruzó precio × acciones en una línea.** No es el libro privado de Hillhouse. No citar AUM de trimestres anteriores: no se releyó ese XML. | Verificado el filing. Unidad: inferida |
| `lansdowne` | Lansdowne Partners (UK) LLP | Lansdowne · CIK `1608485` | GB | Presentado el 2026-08-14. Accession `0000919574-26-005378`. **67** líneas crudas (no el conteo colapsado de agregadores). Entero `2430717155`. Holdings report. Londres. Lectura en dólares ≈ **US$2.43B**. **No se cruzó una línea valor/acciones.** El browse HTML de EDGAR a veces muestra antes un 13F viejo; manda el submissions JSON. | Verificado el filing. Unidad: inferida |
| `mubadala` | Mubadala Investment Co PJSC | Mubadala · CIK `1704268` | AE | Presentado el 2026-08-14. Accession `0001140361-26-032980`. **72** líneas. Entero `34771171317`, dólares ≈ **US$34.8B**. Combination report. GlobalFoundries 32,928,873,232 / 399,573,756 = **94.7%** del valor 13F. Después IBIT 490,092,617 / 14,721,917 y ARM 319,807,957 / 901,960. No es una canasta diversificada. El AUM del sitio web no se usó. | Verificado |
| `temasek` | Temasek Holdings (Private) Ltd | Temasek · CIK `1021944` | SG | Presentado el 2026-08-07. Accession `0001021944-26-000013`. **196** líneas. Entero `37253810301`. Combination report. Lectura en dólares ≈ **US$37.3B**. **No se cruzó una línea.** Libro largo, mal clon. Filiales pueden entrar en el combination report. | Verificado el filing. Unidad: inferida |
| `norges` | Norges Bank | NBIM · CIK `1374170` | NO | Presentado el 2026-08-12. Accession `0001374170-26-000069`. **1,617** líneas. Entero `1003234964718`, dólares ≈ **US$1.00T**. Holdings report. No es clonable. El archivo global de nbim.no **no se descargó** en esta pasada: el verificado es solo el 13F. | Verificado el 13F. Libro global: por verificar |
| `baillie-gifford` | Baillie Gifford & Co | Baillie Gifford · CIK `1088875` | GB | Presentado el 2026-08-06. Accession `0001088875-26-000057`. **880** líneas crudas. Entero `110225053010`, dólares ≈ **US$110.2B** (en miles sería imposible). Holdings report. Edimburgo. No es un clon. El producto seguible de la misma casa es Scottish Mortgage, en la tabla 3, y es otra cartera. | Verificado |
| `gic` | GIC Private Ltd | GIC · CIK `936828` | SG | El submissions JSON **no tiene `13F-HR`**. Formularios vistos: 3/4, 144 y 13D/13G. Un Form 4 de un solo emisor no es un libro. No hay portafolio que trackear por este canal. | Verificado: ausencia de 13F |
| `qia` | Qatar Investment Authority | QIA · CIK `1441449` | QA | El submissions JSON **no tiene `13F-HR`**. Formularios vistos: 3/4, 144 y 13D/13G. Stakes históricos (VW, Heathrow, etc.) no salen de este CIK como cartera. | Verificado: ausencia de 13F |

Quedan fuera de la tabla, con 13F leído y libro demasiado largo para clonar: Canada Pension Plan Investment Board, CIK `1283718`, presentado el 2026-08-14, accession `0001104659-26-097308`, **1,694** líneas, entero `180776675190` (lectura dólares ≈ US$181B, unidad no cruzada en una línea). Public Sector Pension Investment Board (PSP), CIK `1396318`, presentado el 2026-08-13, accession `0001396318-26-000031`, **1,337** líneas, entero `38669816297` (≈ US$38.7B si dólares). El mismo día hay un `13F-HR/A` `0001396318-26-000033` que **no se diffó**.

No se consultó el CIK de Oasis, Marshall Wace, ADIA, Kuwait Investment Authority, Ontario Teachers, CDPQ, Future Fund, Aspex ni Tybourne. No aparecen arriba.

## 2. Mercados latinoamericanos

Lo que ya cubre el documento 1 (EWW, EWZ, ICOL, NAFTRAC, BOVA11, CONSAR, CVM, Superfinanciera) no se repite. México casi no entra: no se abrió ninguna cartera de casa mexicana.

| slug | nombre | gestor/fuente | país | datos necesarios | estado |
|---|---|---|---|---|---|
| `cibest-top-picks` | Top Picks de renta variable local | Bancolombia / Cibest Capital · `investigacioneseconomicas.grupocibest.com` (la home respondió 200) | CO | Texto público de octubre 2026, leído vía newsletter indexado y republicaciones (Valora Analitik / Yahoo, 2026-10-05; post de @Bancolombia_Inv el 2026-10-02). Pesos citados: Pf Grupo Sura 30%, Pf Grupo Argos 20%, Pf Davivienda Group 20%, Banco de Bogotá 20%, Grupo Éxito 10%. El PDF de campaña (`click.correobancolombia`, tinyurl) no es URL estable y **no se descargó el archivo**. Julio 2026 tenía otra composición. Sirve como cartera corta de convicción, no como dataset. | Parcial: pesos en texto indexado. PDF canónico por verificar |
| `xp-carteras` | Carteras recomendadas de octubre 2026 | XP Inc. · republicado por InfoMoney el 2026-10-01 | BR | InfoMoney cita cambios: Top Ações, BPAC11 de 5% a 10%, IGTI11 y SBSP3 de 7.5% a 10%, recortes en RDOR3 y GGBR4; dividendos, PETR4 de 12.5% a 15%, B3SA3 de 10% a 12.5%, VALE3 de 12.5% a 7.5%; small caps, COGN3 10%. **El PDF o el portal de XP no se abrió.** Es prensa secundaria, no la fuente. | Parcial. Fuente primaria por verificar |
| `cnv-fci-semanal` | Composición semanal de FCI | CNV, art. 34, Capítulo XI · ficha por fondo | AR | La home `cnv.gov.ar/SitioWeb/FondosComunesInversion` respondió 200. Se abrió un ejemplo real: Optimum Global Investment Grade, `DetallesFCI/63360`, cartera al **11/09/2026**, con líneas (CEDEARs y bonos). Galicia FIMA también publica composición semanal. No es la cartera modelo de una corredora. No hay un CSV único confirmado: hay que elegir fondo y leer su ficha. | Verificado el ejemplo. Lote masivo por verificar |
| `sbs-afp` | Rentabilidad de AFP | SBS Perú · página de rentabilidad nominal anualizada | PE | Se vio rentabilidad hasta **ago-2026**. No apareció un archivo público línea por línea de las carteras de Integra, Prima, Profuturo o Habitat. No inventar ese holdings file. | Parcial: rentabilidad sí. Carteras por verificar |
| `mx-casas` | Corredoras y bancos de México | GBM, Actinver, Banorte, Vector, carteras CNBV | MX | **No se abrió ninguna cartera, PDF ni dataset** en esta investigación. NAFTRAC y EWW (documento 1) siguen siendo el camino con pesos de emisor. No promover una “cartera recomendada” mexicana hasta bajar un archivo. | Por verificar |
| `br-otras-casas` | Consenso de otras casas brasileñas | Ágora, BTG Pactual, Itaú BBA, Genial, Santander, Banco do Brasil, Terra | BR | Aparecen en notas de InfoMoney como consenso. **No se bajó el PDF de ninguna.** No copiar pesos de esas notas a una ficha. CVM (documento 1) sigue sin un 13F limpio para Verde, Dynamo o SPX. | Por verificar |
| `co-otras-casas` | Otras casas de research en Colombia | Davivienda Corredores, Credicorp Capital, BTG Colombia, Alianza | CO | **No se abrió** un informe de cartera de ninguna. ICOL (documento 1) sigue siendo el benchmark diario. | Por verificar |
| `ar-corredoras` | Carteras modelo de corredoras argentinas | Balanz, IOL, Grupo Galicia research (distinto del FCI) | AR | **No se abrió** un libro de corredora detrás de login. Lo verificable hoy es el FCI semanal de la CNV, fila de arriba, no un “top picks” de broker. | Por verificar |

## 3. India, Japón, China y Reino Unido

| slug | nombre | gestor/fuente | país | datos necesarios | estado |
|---|---|---|---|---|---|
| `scottish-mortgage` | Scottish Mortgage Investment Trust | Baillie Gifford · ticker SMT | GB | Valuación mensual completa, no el factsheet. URL que devolvió el PDF: `scottishmortgage.com/api/document-download?bg-url=/en/uk/individual-investors/literature-library/funds/investment-trusts/portfolio-valuations/scottish-mortgage-valuation-31-august-2026/`. Valuación al **31 ago 2026**: SpaceX (US84615Q1031) 17.5% del total de activos, renta variable listada 76.4%, activos totales £17.75bn. Incluye privados. El factsheet al 30 sep 2026 es solo top 10 y da otros pesos (SpaceX 15.0%): no mezclar fechas. Distinto del 13F de Baillie Gifford & Co. | Verificado la valuación de agosto. Factsheet de septiembre: solo top 10 |
| `nippon-mensual` | Carteras mensuales de AMC | Nippon India MF, vía aviso del 9 may 2026 y factsheets de julio 2026. Hub AMFI: `amfiindia.com/online-center/portfolio-disclosure` | IN | SEBI obliga a cartera mensual por AMC, no a un API único. El aviso Nippon apunta el portafolio al 30 abr 2026 a `mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures` y a AMFI. Factsheets de julio 2026 (cartera al **30 jun 2026**) muestran el % completo en ETF concentrados (Nifty Pharma, PSU Bank). El Nifty 50 BeES a menudo publica solo top 10. **No se bajó el xlsx vigente.** Es mensual, no diario. Un reintento HTTP al hub de AMFI el 2026-10-12 hizo timeout (`WinError 10060`). | Parcial |
| `gpif` | Tenencias del GPIF | GPIF · `gpif.go.jp/en/` (respondió 200) | JP | La home en inglés lista “Portfolio holdings by asset category as of Mar 31, 2026”. El listado completo anual (“保有全銘柄”) al **31 mar 2026** se anunció el **3 jul 2026**. Un PDF de operaciones muestra top 10 doméstico, “1,749銘柄”, y top 10 extranjero (NVDA, AAPL, …). **El Excel no se parseó.** Anual, enorme, gestionado por mandatos externos: el GPIF no elige acciones in-house. Mal clon, buen archivo regulatorio. | Parcial: existencia y top 10. Archivo completo por verificar |
| `trahk-2800` | Tracker Fund of Hong Kong | 2800.HK | HK | El ETF existe. **No se abrió** el archivo oficial de tenencias (ni trahk ni el emisor). Yahoo e Investing.com discrepan en pesos, fechas y hasta en el nombre del gestor (Hang Seng Investment Management vs SSGA Asia). No usar esos pesos. | Por verificar |
| `jp-research` | Research de corredoras japonesas | Nomura, Daiwa, SMBC Nikko | JP | **No se abrió** ningún informe. No se comprobó si el research de acciones está detrás de login. No hay fila clonable. | Por verificar |
| `cn-fondos` | Informes trimestrales de fondos mainland | CSRC / AMAC | CN | **No se abrió** un informe trimestral ni un dataset de tenencias. No afirmar que exista un CSV limpio. | Por verificar |
| `uk-factsheets` | Factsheets de gestoras UK de libro largo | Fundsmith, Lindsell Train | GB | **No se abrieron.** Esos factsheets suelen ser top 10, no el libro. Scottish Mortgage (fila de arriba) es el único producto UK de esta pasada con valuación completa leída. | Por verificar |

## 4. ETFs temáticos de emisores que ya usamos

Emisores: BlackRock/iShares, Vanguard, State Street, Invesco. El 2026-10-12 se leyó el `<title>` (o el JSON-LD, en PID) de la ficha. **No se descargó ningún CSV de holdings.** “Ficha verificada” no es “archivo de tenencias verificado”. Al implementar hay que atar el CSV vigente, igual que se advirtió para ICOL en el documento 1.

El id de producto iShares `239763`, con slug pedido `ishares-global-energy-etf`, resolvió a **iShares Core S&P Mid-Cap ETF (IJH)**. No usar esa URL para energía. El ticker de energía global de iShares (IXC) **no se verificó**.

| slug | nombre | gestor/fuente | país | datos necesarios | estado |
|---|---|---|---|---|---|
| `xle` | State Street Energy Select Sector SPDR ETF | State Street · ticker XLE | US | Ficha viva: title “XLE: State Street® Energy Select Sector SPDR® ETF”. URL final bajo `/etfs/state-street-energy-select-sector-spdr-etf-xle`. Energía de EE.UU. (select sector), no global. CSV diario no descargado. | Parcial: ficha sí. Holdings por verificar |
| `vde` | Vanguard Energy ETF | Vanguard · ticker VDE | US | Title “VDE-Vanguard Energy ETF”. Energía de EE.UU. CSV no descargado. | Parcial |
| `xlv` | State Street Health Care Select Sector SPDR ETF | State Street · ticker XLV | US | Title “XLV: State Street® Health Care Select Sector SPDR® ETF”. Salud de EE.UU. CSV no descargado. | Parcial |
| `vht` | Vanguard Health Care ETF | Vanguard · ticker VHT | US | Title “VHT-Vanguard Health Care ETF”. CSV no descargado. | Parcial |
| `gld` | SPDR Gold Shares | State Street · ticker GLD | US | Title “GLD: SPDR® Gold Shares”. Oro físico, no una canasta de mineras. El “holding” es el metal. CSV/allocación no descargado. | Parcial |
| `iau` | iShares Gold Trust | BlackRock · ticker IAU · producto `239561` | US | Title “iShares Gold Trust \| IAU”. Misma salvedad que GLD: un solo activo. No es un libro de acciones. | Parcial |
| `vigi` | Vanguard International Dividend Appreciation ETF | Vanguard · ticker VIGI | US | Title confirma dividendos internacionales (appreciation, no high yield). Es el hueco de dividendos globales que SPY/QQQ no cubren. CSV no descargado. | Parcial |
| `pid` | Invesco International Dividend Achievers ETF | Invesco · ticker PID | US | `product-detail?ticker=PID` redirige a `invesco-international-dividend-achievers-etf.html`. JSON-LD: `"propertyID":"Ticker","value":"PID"`. Dividendos internacionales. CSV no descargado. | Parcial |
| `iwm` | iShares Russell 2000 ETF | BlackRock · ticker IWM · producto `239710` | US | Title “iShares Russell 2000 ETF \| IWM \| US Class”. Small caps de EE.UU. CSV no descargado. | Parcial |
| `vb` | Vanguard Morningstar Small-Cap ETF | Vanguard · ticker VB | US | Title “VB-Vanguard Morningstar Small-Cap ETF”. No es el Russell 2000. CSV no descargado. | Parcial |
| `fm-liquidado` | iShares MSCI Frontier and Select EM ETF | BlackRock · ticker FM | US | **No agregarlo.** El trading cesó después del cierre del **2025-01-06**, suspensión el 2025-01-07, efectivo de liquidación **US$27.234261** por acción el 2025-01-09. Entre BlackRock, Vanguard, State Street e Invesco no quedó verificado un ETF físico vivo de mercados frontera que lo reemplace. | Verificado: producto muerto |

`239500` es iShares Select Dividend (DVY): dividendos de EE.UU., no globales. No entra en la tabla para no tapar el hueco que sí cubren VIGI y PID.

No se abrieron fichas de IXC, IDV, IJR, VSS, IYE, IXJ, IYH ni DWX. No se afirma que su CSV responda 200.

## Qué no se verificó

- Unidades en dólares de HHLR, Lansdowne, Temasek, CPPIB y PSP: no se hizo el cruce valor/acciones. AKO, TCI, PIF (tres líneas), Cevian, Egerton, Mubadala, SoftBank Group y SB Investment Advisers UK sí se cruzaron.
- Nombres de las líneas 4 y 5 del PIF.
- Diferencia entre el 13F-HR y el 13F-HR/A de PSP del 2026-08-13.
- Archivo de tenencias globales en nbim.no.
- Excel completo del GPIF. xlsx mensual vigente de Nippon. Hub AMFI en el reintento de hoy (timeout).
- Holdings oficiales de 2800.HK y el nombre correcto del gestor.
- PDF canónico de Cibest / Bancolombia y PDF de XP. Cualquier cartera de GBM, Actinver, Banorte, Vector, Davivienda Corredores, Credicorp, BTG Colombia, Alianza, Balanz, IOL, Ágora, Itaú BBA, Genial, Santander Brasil, Banco do Brasil, Integra, Prima, Profuturo o Habitat.
- Research de Nomura, Daiwa, SMBC, Fundsmith y Lindsell Train. Informes de fondos mainland China.
- Cualquier CSV de holdings de la tabla 4.
- CIKs que no se consultaron en EDGAR (Oasis, Marshall Wace, ADIA y el resto del párrafo “quedan fuera”).

## Si más adelante se implementa

El mismo adaptador de `scrapers/sec13f.py` alcanza para TCI, PIF, Cevian, Egerton, AKO y SB Investment Advisers UK. En AKO el valor va en miles y el archivo no se llama `infotable.xml`. GIC y QIA no tienen 13F: no crearles ficha vacía. De Latinoamérica, lo único con líneas abiertas es el FCI semanal de la CNV, y no es una cartera recomendada. Scottish Mortgage es el único libro corto no-13F con posiciones completas leídas, con fecha de valuación distinta del factsheet.
