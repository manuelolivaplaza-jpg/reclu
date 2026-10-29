# Fuentes de datos — reclu.cl

Documentación de cada fuente scrapeada, su estado y limitaciones conocidas.
Estado verificado en vivo entre el **2026-10-18** y el **2026-10-20**
(frentes F3, F23–F36 y F57-A).

## Resumen

| Fuente | Portafolio | Estado | Notas |
|---|---|---|---|
| House Disclosure (oficial) | pelosi-tracker | ✅ Funcional (verificado en vivo) | disclosures-clerk.house.gov, sin login, PTRs en PDF. Trump NO se scrapea: no es miembro de la Cámara |
| OGE 278-T (oficial) | trump-compra | ✅ PDF público, parser OCR | extapps2.oge.gov, formulario 278-T de Donald Trump. Montos en tramos. Todo queda `pendiente` hasta revisión manual. Premium false (5 U.S.C. § 13107). |
| Senate eFD (oficial) | tuberville, mccormick, mullin-tracker | ✅ Funcional (requiere curl_cffi) | efdsearch.senate.gov — Akamai geo-bloquea IPs no-EE.UU. y rechaza httpx por huella TLS; funciona desde GitHub Actions (IPs de EE.UU.) |
| Renta 4 | renta4-moderada, renta4-moderada-ampliada | ✅ Funcional (verificado) | Hub → artículo → PDF semanal |
| BTG Pactual Chile | btg-cartera-recomendada | ✅ Funcional (verificado) | PDF estático público S3 |
| InfoProbidad | infoProbidad-cl | ✅ Funcional (SPARQL verificado 2026-10-18) | El CSV de la versión anterior NO existe; la fuente real es el endpoint SPARQL datos.cplt.cl/sparql |
| Superintendencia de Pensiones | afp-modelo-acciones-cl | ✅ Modo A (cuadro 14, verificado 2026-10-19) | AFP Modelo, acciones chilenas, hasta mayo 2026. Desde junio el portal cifra el parámetro. No se guardan CUSIP. `afp-consenso-chile` sigue siendo la semilla demo de la 006 |
| SEC 13F (EDGAR) | 29 fondos (ver `load_13f.py`) | ✅ Funcional | data.sec.gov, sin login. CIK verificados en docs de expansión. F25 sumó Norges Bank, SNB, Gates Foundation e Icahn (top 50 en Norges/SNB) |
| SEC Form 4 (insiders) | insiders-compras-1m | ✅ Funcional (feed verificado 2026-10-19) | Compras P de officers y directores ≥ US$1M. Señal informativa: en el 1S-2026 no le ganó al SPY. Sin direcciones del insider |
| ARK Invest | arkk, arkg, arkw, arkq, arkf | ✅ Funcional (verificado 2026-10-18) | CSV diario del emisor con pesos exactos |
| Global X | copx, lit, bug, hero | ✅ Funcional | CSV con fecha, se sondea hacia atrás |
| iShares (BlackRock) | ech, eww, ewz, ibit | ✅ Funcional (verificado 2026-10-18) | CSV oficial: /us/products/{id}/{slug}/latest-holdings.csv |
| VanEck | smh | ✅ Funcional (verificado 2026-10-18) | XLSX diario de holdings del emisor |
| Capitol Trades | (ninguno) | ⛔ OBSOLETO — login wall | Fuente muerta; se mantiene solo como referencia. NO integrar |
| Invesco QQQ | (ninguno) | ⛔ 406 en todos los endpoints | Bloqueo HTTP 406 verificado 2026-10-18; sin CSV público accesible |
| LarrainVial | larrainvial-top-picks | ⛔ Login wall | Research tras login (clientes.larrainvial.com) |
| X (@elonmusk) | musk-dice | 🔧 Archivo verificado; sin API en producción | Menciones en `scrapers/data/musk_menciones.json`. Solo id, fecha, cita y URL. La API de X exige plan de pago |
| CNBC Lightning Round (Mad Money) | inverse-cramer-real | ✅ RSS verificado 2026-10-19 | Artículos públicos. Se guarda solo ticker, fecha, cita de hasta 10 palabras y URL. El proxy `inverse-cramer` (SQQQ/PSQ) no se toca. Términos de uso de CNBC: pendientes de que Manu los revise antes de lanzar |
| SEC Schedule 13D (EDGAR EFTS) | activistas-13d | ✅ Funcional (verificado 2026-10-19) | `efts.sec.gov` sin clave; `primary_doc.xml` con emisor, filer, % de la clase y fecha del evento. User-Agent de `sec13f` y <10 req/s (política SEC). Sin direcciones ni personas autorizadas |
| SEC Form 10-12B (EDGAR EFTS) | spinoffs-12m | ✅ Funcional (verificado 2026-10-19) | EFTS con `forms=10-12B` (incluye enmiendas `/A`), ventana de 12 meses. Una fila por CIK; `status` es heurística (ticker presente en `display_names`). Sin teléfonos ni direcciones |
| SEC XBRL frames — recompras | recompras-top20 | ✅ Funcional (verificado 2026-10-19) | `data.sec.gov/api/xbrl/frames` (`PaymentsForRepurchaseOfCommonStock`) y `company_tickers.json`; % de capitalización aproximado con acciones en circulación y Yahoo. Dominio público |
| Polymarket (Data API + Gamma API) | polymarket-ballenas | ✅ Funcional (verificado 2026-10-19) | Sin clave. Solo apuestas ≥ US$10.000 en política/economía; se descartan deportes por tag. Billetera seudónima y alias público, sin bio/foto/redes. Términos de uso de Polymarket no revisados |
| CMF — dividendos | dividendos-cl | ✅ Funcional (verificado 2026-10-19) | Grilla pública `acc_dividendos1grid.php`; el WAF de la CMF bloquea datacenters: `curl_cffi`, 1 req/s y backoff. Dato oficial, informativo (Ley Fintec), sin datos personales |
| CMF — hechos esenciales | hechos-esenciales-cl | ✅ Funcional (verificado 2026-10-19) | Portada de últimos 7 días sin captcha; el buscador completo (`hechos2.php`) exige captcha y no se usa. Link permanente `ver_sgd.php`; sin datos personales |
| CMF — 12 mayores accionistas | — (tabla `cl_top_shareholders`) | ✅ Funcional (verificado 2026-10-19) | Pestaña 5 de la ficha del emisor; periodo trimestral por POST. Personas naturales anonimizadas como `Persona natural (#n)`, sin nombre ni RUT (Leyes 19.628/21.719) |
| CMF — fondos mutuos (Circular 1333) | fondos-mutuos-acciones-cl | ✅ Funcional (verificado 2026-10-20) | Archivo `;` de ~3,5 MB (`ffm_download.php`, `cartera=NACI`); top 5 fondos de acciones nacionales. Patrimonio aproximado por suma de valorizaciones; sin datos personales |
| BICE / MBI — carteras recomendadas | bice-acciones-destacadas, mbi-acciones-recomendadas, consenso-corredoras-cl | ✅ Funcional (dry-run 2026-10-19) | PDF público de cada corredora; BICE tiene URL fija y MBI se descubre en `/publicaciones`. Solo nemotécnico, peso, fecha y URL. Sin condiciones de reutilización explícitas: revisar antes de uso comercial |
| OGE 278-T — funcionarios del gabinete | bessent-oge, lutnick-oge, hegseth-oge | ✅ Funcional (índice verificado 2026-10-19) | `extapps2.oge.gov`; parser de F13. Todo entra `pendiente` y solo la revisión humana genera holdings/alertas. 5 U.S.C. § 13107: público, gratuito y fuera del muro |
| Truth Social / menciones de Trump | trump-dice | ✅ Archivo curado verificado | `scrapers/data/trump_dice_menciones.json` (15 menciones con cita y URL; el portafolio usa M04-M15, 12 con entrada desde 2025-08-07). No hay API: la fuente de verdad es el archivo. Las candidatas quedan `pendiente` y no generan holding ni alerta |
| CongressInvests API (bridge) | — (solo reconstrucción histórica) | 🔧 Bridge de terceros, fuera de `run_all.py` | `congressinfor-production.up.railway.app`; no es fuente oficial ni está en el cron. Lo usa `reconstruct_congress.py`; tolera caídas devolviendo lista vacía |

## Flujo automatizado (GitHub Actions + Vercel Cron)

```
.github/workflows/scrapers.yml (L-V 11:00 UTC = 08:00 Chile)
    ↓ python run_all.py
    ↓ POSICIONES: house → senate → renta4 → btg → infoprobidad → 13f → etfs
    ↓ PRECIOS: prices (Yahoo EOD) → RENDIMIENTOS: compute_returns
    ↓ SNAPSHOTS: performance (series históricas)
    ↓ trump_dice → insiders_form4 → oge_trump → spensiones → musk_dice → inverse_cramer
    ↓ stages/*.py (orden alfabético): activists_13d → buybacks → cmf_accionistas
       → cmf_dividendos → cmf_fondos → cmf_hechos → corredoras_cl → oge_officials
       → polymarket → spinoffs
    ↓ radar_ia
    ↓ holdings upsert con previous_weight (detección de cambios)
    ↓ curl GET /api/run-pipeline con CRON_SECRET
    ↓
(D44: sin Vercel Cron; el workflow es el único disparo, con !cancelled())
    ↓
/api/run-pipeline → Edge detect-changes: delta ≥0.5pp → alerts
    (is_published=false) → resúmenes OpenRouter → is_published=true
    → Edge send-alerts: Resend emails a followers según plan
```

El endpoint `/api/run-pipeline` SIEMPRE exige el Bearer token (GET y POST).
Sin `CRON_SECRET` configurado responde 503 y no ejecuta nada.

## House Financial Disclosure (house_disclosure.py)

**URL:** `https://disclosures-clerk.house.gov/FinancialDisclosure`

**Estado:** ✅ Funcional, verificado en vivo.

Fuente **oficial** de la Cámara de EE.UU. — sin login wall.

- Buscador: `/FinancialDisclosure/ViewSearch` (form → POST a
  `ViewMemberSearchResult` con `LastName`, `FilingYear`, `State`,
  `District` y un `__RequestVerificationToken` CSRF).
- PTRs: `public_disc/ptr-pdfs/{year}/{id}.pdf` (Periodic Transaction
  Reports = las compras/ventas reales).
- El adapter busca por apellido, descarga los PTRs del año, extrae texto
  con pypdf y parsea `(<TICKER>) [ST|OP] <P|S|E> <fecha> <monto>`.
- Trump se ELIMINÓ de la lista: no es miembro de la Cámara y no presenta
  PTRs ahí (su tracker se alimenta de menciones públicas, no de PTRs).

---

## Senate eFD (senate_disclosure.py) — NUEVO

**URL:** `https://efdsearch.senate.gov`

**Estado:** ✅ Funcional con `curl_cffi` (flujo verificado contra el
endpoint público `/search/report/data/`).

Fuente **oficial** del Senado — Periodic Transaction Reports electrónicos.

- **Aviso legal obligatorio**: el sitio exige aceptar el aviso del Ethics
  in Government Act antes de buscar. El scraper hace el POST
  `{prohibition_agreement: 1, csrfmiddlewaretoken}` en cada corrida.
- Búsqueda: POST a `/search/report/data/` con `report_types=[11]` (PTR)
  y ventana de fechas → filas `[first, last, office, <link>, filed]`.
- Reportes: `/search/view/ptr/{uuid}` — tabla HTML con transacciones
  (fecha, ticker, activo, tipo, monto rango). Los PDFs escaneados
  (`/search/view/paper/`) se omiten y quedan registrados en el log.
- **Por qué curl_cffi**: Akamai rechaza httpx/requests/curl con 403 por la
  huella TLS. curl_cffi impersona Chrome. Además geo-bloquea IPs fuera de
  EE.UU. — por eso esta etapa corre bien en GitHub Actions (IPs EE.UU.)
  pero no desde redes locales de Chile.
- Senadores seguidos: `SENATORS` en `politicians.py` (Tuberville,
  McCormick, Mullin). Mismos montos-rango y rezago de 45 días que House.
- Nota legal (E.G.A. §105(c)): los reportes no pueden usarse con fines
  comerciales, de crédito ni políticos.

---

## InfoProbidad (infoprobidad.py) — agregado por RUT

**URL:** `https://datos.cplt.cl/sparql` (portal [www.infoprobidad.cl](https://www.infoprobidad.cl/))

**Estado:** ✅ Endpoint SPARQL verificado. Licencia **CC BY 4.0** (atribución obligatoria).

La versión anterior agrupaba por el nombre de la sociedad y partía el
símbolo de la primera palabra, así que "LATAM" y "LATAM AIRLINES GROUP S.A."
salían duplicadas. Ahora la consulta agrupa por `ip:rutJuridica`, filtra
`ip:ultimaDecDeclarante` y descarta `rut=0` y sociedades deportivas.

- Se publica solo el agregado: cuántas autoridades declaran acciones de
  cada empresa, el valor total declarado (`ip:valorPlaza`) y la fecha más
  reciente. La consulta no pide dirección, estado civil, régimen
  patrimonial, bienes, pasivos ni datos de familiares.
- Nombres de autoridades: flag `INFOPROBIDAD_NOMBRES` apagado (`0`). Aunque
  se ponga en `1`, esta versión no los consulta ni los guarda.
- Portafolio `infoProbidad-cl` (el slug no cambia): canasta solo de
  emisoras con nemotécnico en `scrapers/data/infoprobidad/rut_nemotecnico.json`,
  peso proporcional al número de autoridades. No es una cartera para copiar
  ni hay rendimiento simulado.
- Alerta `threshold` si una empresa sube 5 o más autoridades entre corridas.
  El payload no lleva nombres de personas.
- Tabla `infoprobidad_empresas` (migración 021), lectura pública.
- Limitación: el SPARQL es un Virtuoso público y puede tardar; la etapa
  no es crítica. El docstring histórico dice martes y viernes; no hay
  página oficial que lo confirme. La declaración más reciente vista el
  2026-10-19 es del 2026-10-10.

---

## SEC 13F (sec13f.py + load_13f.py)

**URL:** `https://data.sec.gov` (submissions JSON + info-table XML)

**Estado:** ✅ Funcional. 25 fondos configurados.

Fondos (CIK verificados en `docs/expansion-portfolios*.md`): Berkshire,
Scion, Pershing Square, Appaloosa, Tiger Global, Coatue, Duquesne,
Third Point, Baupost, Viking, TCI, PIF, Cevian, Egerton, SoftBank,
SB Investment Advisers, Mubadala, Lansdowne, Renaissance, Bridgewater,
Soros + los nuevos de F3: **DME Capital (Greenlight/Einhorn, 1489933 —
el CIK histórico 1079114 dejó de presentar en 2024), AKO Capital
(1376879), HHLR Advisors (1762304), Temasek (1021944)**.

- El 13F es el libro largo 13(f) trimestral con hasta 45 días de rezago;
  no incluye cortos, derivados ni caja.
- AKO: infotable no estándar (`13F_report_*.xml`) y valor en **miles**
  (ver `SPECIAL_INFOTABLE` en sec13f.py).

---

## SEC Form 4 — compras de ejecutivos (insiders_form4.py)

**URL:** `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&count=100&output=atom`

**Estado:** ✅ Feed Atom verificado el 2026-10-19. Dominio público, sin login.

Portafolio `insiders-compras-1m` ("Compras de ejecutivos"): canasta de
igual peso con las compras en mercado abierto (código P, adquirido A) de
officers y directores por US$1 millón o más, presentadas en los últimos
90 días. `source=sec_form4`.

- El adapter lee el Atom de EDGAR (`count=100`), baja el índice y el XML
  del Form 4 con pausa de 0,15 s y el User-Agent de `sec13f.py`
  ("reclu research admin@reclu.cl"). Máximo de la SEC: 10 solicitudes
  por segundo.
- Histórico trimestral (no corre en el cron): Insider Transactions Data
  Sets, ZIP con TSV. Índice en
  `https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets`.
- Plazo legal: el Form 4 se presenta dentro de 2 días hábiles.
- **No se guardan direcciones** (`rptOwnerStreet1`, ciudad, estado, zip).
  Solo nombre, cargo, emisor, ticker, fecha, código, acciones, precio y
  monto. La tabla `insider_trades` no tiene columnas de dirección.
- Cada alerta `new_trade` lleva `payload.source_url` y sale publicada.
- **No es una estrategia ganadora.** Backtest 1S-2026 (corte de precios
  2026-10-16, corrida 2026-10-19): 270 eventos, promedio −1,80% contra
  SPY +8,11%. Le ganó al SPY en 88 de 270. Aviso fijo en la ficha:
  "Simulación histórica con fines informativos. No es recomendación de
  inversión."
- Etapa no crítica en `run_all.py`, después de `performance` y antes de
  `radar_ia`. `--dry-run` no escribe.

---

## ETFs de emisor (etfs.py)

Cuatro emisores, todos públicos y sin key:

| Emisor | Formato | Ejemplo verificado |
|---|---|---|
| ARK Invest | CSV diario estable por fondo | arkk (2026-10-16, TSLA 9.76%) |
| Global X | CSV con fecha (se sondea 1-5 días atrás) | copx, lit, bug, hero |
| iShares | `latest-holdings.csv` por product id | ECH 239618 (Banco de Chile 12.17%), EWW 239670, EWZ 239612, IBIT 333011 (BTC 100%) |
| VanEck | XLSX diario de holdings | SMH (NVDA 20.06%) |

- iShares: el slug del path se ignora; manda el **product id** numérico.
  Descubierto 2026-10-18 leyendo el link oculto `holdings-csv-link` de la
  ficha del fondo.
- QQQ (Invesco): **no accesible** (406 en todos los endpoints probados,
  con y sin headers de navegador). Documentado como fuente muerta.
- ICOL (Colombia): el fondo ya no existe en el catálogo de iShares.

---

## Renta 4 (renta4.py)

**URL base:** `https://www.renta4.cl`

**Estado:** ✅ Funcional (verificado). Hub → artículo → PDF semanal público.

Tickers chilenos: BCS, formato `COPEC.SN`, `SQM-B.SN`. El adapter
normaliza quitando el sufijo.

---

## Superintendencia de Pensiones (spensiones.py)

**URL:** `https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php?fecpro=AAAAMM&idu=50&listado=14`

**Estado:** ✅ Modo A verificado en `--dry-run` el 2026-10-19. El modo navegador queda detrás de `--navegador` y no está verificado en vivo.

Fuente pública de la Superintendencia de Pensiones. El portafolio `afp-modelo-acciones-cl` es el Cuadro 14: diversificación de AFP Modelo en acciones nacionales, por tipo de fondo y sector. Cifras en MMUS$. El peso en reclu es la participación del emisor en esa cartera de acciones chilenas, no el porcentaje del fondo completo.

- `idu=50` es solo AFP Modelo. Otros `idu` probados (0–15 y 30–70) no devolvieron datos. El consolidado de todas las AFP no se consigue por esta vía.
- Hasta mayo de 2026 el endpoint antiguo responde el cuadro. Desde junio de 2026 devuelve vacío (0 o ~363 bytes): el portal pasa a `genera_desagregada_xsl_v2.0.php?param=…` con el parámetro cifrado, y curl no lo baja.
- El scraper camina el mes en curso hacia atrás (hasta 18 meses) hasta una respuesta de más de 1000 bytes que contenga "CUADRO".
- **No se publican códigos CUSIP.** La página trae aviso de copyright de CUSIP (American Bankers Association / FactSet). Solo se guardan el nemotécnico y el emisor.
- Desfase: la cartera de cada mes aparece varias semanas después. El desfase exacto no se midió. La ficha lo dice: "La SP publica con desfase; no es la cartera de hoy."
- Referencia de mercado en la ficha: **ECH en CLP (proxy del IPSA)**. Yahoo `^IPSA` no trae datos. ECH es iShares MSCI Chile (ya está en la etapa `etfs`). No es el IPSA oficial. Los precios `.SN` de Yahoo no traen volumen desde el 2026-09-16.
- `afp-consenso-chile` (migración 006) no se modifica: seguidores y retorno de demostración. Propuesta: alimentarlo con el consolidado cuando el modo navegador funcione, o desactivarlo.
- Términos de reutilización: no se encontraron condiciones explícitas. Revisarlas antes de tratar la fuente como cerrada.
- Etapa opcional en `run_all.py`, después de `performance` y antes de `radar_ia`. El cron no invoca `--navegador`.

---

## BTG Pactual Chile (btg_pactual.py)

**URL:** PDF estático público en S3 (`Cartera_Concentrada_RVL.pdf`).

**Estado:** ✅ Funcional (verificado 2026-10-16).

---

## Capitol Trades (capitol_trades.py) — OBSOLETO

**URL:** `https://www.capitoltrades.com`

**Estado:** ⛔ Login wall. Las páginas públicas devuelven `data:[]`.

Se mantiene el archivo por referencia, pero **no está en ninguna etapa**
de `run_all.py`. Si algún día reabre el dataset público, agregar una
etapa no-crítica.

---

## OGE 278-T (oge_trump.py)

Informe periódico de transacciones del presidente. El índice PAS de
nominados no lista a Trump; el PDF vive igual en `Presiden.nsf` y está
anotado en `scrapers/data/trump_oge/known_reports.json`. Si el índice
empieza a enlazar PDFs `Donald-J-Trump*278T`, el scraper los suma.

- Parser puro `parse_278t`. Fechas que no calzan con `M/D/2026` quedan
  `trans_date_uncertain`. "lourchaso" y variantes OCR → purchase.
- Ticker en `scrapers/data/trump_oge/descripcion_ticker.json`. Sin ticker
  no entra a holdings (la mayoría son bonos municipales).
- Cada fila se guarda `pendiente`. Solo `verificada` (revisión humana)
  crea holdings de compras ≥ US$1M en acciones/ETF y la alerta
  `new_trade` con `payload.source_url`.
- Texto: `pdftotext -layout`, si no hay, pypdf. OCR con pytesseract solo
  si el PDF no trae capa de texto.

---

## X — Elon Musk dice (musk_dice.py)

**URL:** posts públicos de `https://x.com/elonmusk`. La fuente de verdad de
esta entrega es `scrapers/data/musk_menciones.json` (archivo completo, corte
2026-10-19). Contexto: CNBC, 2021-01-29,
`https://www.cnbc.com/2021/01/29/elon-musks-tweets-are-moving-markets.html`.

**Estado:** 🔧 Menciones históricas ya verificadas. No se llama a la API de X
desde el scraper: hace falta un plan de pago y los términos piden mostrar el
post embebido o enlazado.

- Portafolio `musk-dice`, `source` `musk_mentions`. Usa `public.mentions` de
  la migración 014. No hay tabla nueva.
- Cada fila guarda el id del post, la fecha, una cita corta y la URL de X.
  La alerta `mention` lleva `payload.speaker = Elon Musk` y `payload.source_url`.
- ETSY y GME entran al 50%. CDR (Varsovia, PLN) es solo mención. Tesla es
  `empresa_propia`: se muestra como contexto y no genera holding ni alerta.
- `--detectar` deja candidatas en `pendiente` (`$TICKER` o "buy" más el
  nombre de una empresa del catálogo). Una pendiente no se inserta ni alerta.
- `--dry-run` no escribe en Supabase. Etapa `musk_dice` en `run_all.py`,
  después de `performance` y antes de `radar_ia`, no crítica.

---

## CNBC Lightning Round (inverse_cramer.py)

RSS público de Mad Money, verificado el 2026-10-19:

`https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15838459`

El artículo sale hacia las 18:55 ET, con el mercado cerrado. La entrada
simulada es el cierre del día hábil siguiente. Regla inversa, igual peso,
30 días hábiles. Los cortos llevan peso positivo y el nombre `Corto: TICKER`
(`holdings.weight` no admite negativos). Solo se persiste ticker, fecha,
sentido, una cita de hasta 10 palabras y el enlace. Un artículo nuevo del
RSS sin cita en el JSON queda `pendiente` y no genera alerta ni posición.

El portafolio proxy `inverse-cramer` (SQQQ/PSQ en `load_thematic.py`) no se
modifica.

## Orquestador (run_all.py)

Etapas (en orden): `house_disclosure` → `senate_disclosure` → `renta4` →
`btg_pactual` → `infoprobidad` → `sec13f` → `etfs` → `prices` →
`compute_returns` → `performance` → `trump_dice` → `insiders_form4` →
`oge_trump` → `spensiones` → `musk_dice` → `inverse_cramer` →
`stages/*.py` (alfabético: `activists_13d`, `buybacks`, `cmf_accionistas`,
`cmf_dividendos`, `cmf_fondos`, `cmf_hechos`, `corredoras_cl`,
`oge_officials`, `polymarket`, `spinoffs`) → `radar_ia`.

- `--only <etapas>` / `--skip <etapas>`: selección de etapas.
- `--dry-run`: fetch + parse + resumen **sin escribir nada** en Supabase.
- `--list`: lista las etapas.
- Etapas **críticas** (house, senate, renta4, btg): su fallo cambia el
  exit code a 1. Las demás fallan con warning y la corrida sigue.
- Capitol Trades NO corre por defecto (obsoleto). Trump se eliminó de
  House (no es miembro de la Cámara).

## Cómo correr

```bash
cd scrapers
pip install -r requirements.txt
export SUPABASE_URL="https://<proj>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Todo (escribe en Supabase)
python run_all.py

# Solo probar, sin escribir nada
python run_all.py --dry-run

# Solo una etapa
python run_all.py --only etfs

# Ver etapas disponibles
python run_all.py --list
```

## Programación

- **GitHub Actions** (recomendado): `.github/workflows/scrapers.yml` —
  L-V 11:00 UTC, con `workflow_dispatch` manual, cache de pip, artifact
  con el log y el disparo final de `/api/run-pipeline`. Secrets:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `CRON_SECRET`.
- **Vercel Cron**: eliminado en D44 (era un duplicado del último paso del
  workflow).
