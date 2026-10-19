# Fuentes de datos — reclu.cl

Documentación de cada fuente scrapeada, su estado y limitaciones conocidas.
Estado verificado en vivo el **2026-10-18** (frente F3).

## Resumen

| Fuente | Portafolio | Estado | Notas |
|---|---|---|---|
| House Disclosure (oficial) | pelosi-tracker | ✅ Funcional (verificado en vivo) | disclosures-clerk.house.gov, sin login, PTRs en PDF. Trump NO se scrapea: no es miembro de la Cámara |
| OGE 278-T (oficial) | trump-compra | ✅ PDF público, parser OCR | extapps2.oge.gov, formulario 278-T de Donald Trump. Montos en tramos. Todo queda `pendiente` hasta revisión manual. Premium false (5 U.S.C. § 13107). |
| Senate eFD (oficial) | tuberville, mccormick, mullin-tracker | ✅ Funcional (requiere curl_cffi) | efdsearch.senate.gov — Akamai geo-bloquea IPs no-EE.UU. y rechaza httpx por huella TLS; funciona desde GitHub Actions (IPs de EE.UU.) |
| Renta 4 | renta4-moderada, renta4-moderada-ampliada | ✅ Funcional (verificado) | Hub → artículo → PDF semanal |
| BTG Pactual Chile | btg-cartera-recomendada | ✅ Funcional (verificado) | PDF estático público S3 |
| InfoProbidad | infoProbidad-cl | ✅ Funcional (SPARQL verificado 2026-10-18) | El CSV de la versión anterior NO existe; la fuente real es el endpoint SPARQL datos.cplt.cl/sparql |
| SEC 13F (EDGAR) | 25 fondos (ver `load_13f.py`) | ✅ Funcional | data.sec.gov, sin login. CIK verificados en docs de expansión |
| ARK Invest | arkk, arkg, arkw, arkq, arkf | ✅ Funcional (verificado 2026-10-18) | CSV diario del emisor con pesos exactos |
| Global X | copx, lit, bug, hero | ✅ Funcional | CSV con fecha, se sondea hacia atrás |
| iShares (BlackRock) | ech, eww, ewz, ibit | ✅ Funcional (verificado 2026-10-18) | CSV oficial: /us/products/{id}/{slug}/latest-holdings.csv |
| VanEck | smh | ✅ Funcional (verificado 2026-10-18) | XLSX diario de holdings del emisor |
| Capitol Trades | (ninguno) | ⛔ OBSOLETO — login wall | Fuente muerta; se mantiene solo como referencia. NO integrar |
| Invesco QQQ | (ninguno) | ⛔ 406 en todos los endpoints | Bloqueo HTTP 406 verificado 2026-10-18; sin CSV público accesible |
| LarrainVial | larrainvial-top-picks | ⛔ Login wall | Research tras login (clientes.larrainvial.com) |

## Flujo automatizado (GitHub Actions + Vercel Cron)

```
.github/workflows/scrapers.yml (L-V 11:00 UTC = 08:00 Chile)
    ↓ python run_all.py
    ↓ POSICIONES: house → senate → renta4 → btg → infoprobidad → 13f → etfs
    ↓ PRECIOS: prices (Yahoo EOD) → RENDIMIENTOS: compute_returns
    ↓ SNAPSHOTS: performance (series históricas)
    ↓ holdings upsert con previous_weight (detección de cambios)
    ↓ curl GET /api/run-pipeline con CRON_SECRET
    ↓
Vercel Cron (diario 13:00 UTC) también llama GET /api/run-pipeline con
    Authorization: Bearer ${CRON_SECRET}
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

## InfoProbidad (infoprobidad.py) — REESCRITO

**URL:** `https://datos.cplt.cl/sparql` (portal www.infoprobidad.cl)

**Estado:** ✅ Funcional (verificado en vivo 2026-10-18).

La versión anterior apuntaba a un CSV (`/descargas/declaraciones-<año>.csv`)
que **no existe** (404). La fuente real: el Consejo para la Transparencia
publica **Datos Abiertos Enlazados** con endpoint SPARQL público (licencia
CC 4.0, actualización semanal martes/viernes).

- El adapter consulta: Persona → `declara` → Declaración →
  `tieneAccionDerecho` → entidad (`derechoSobre`) y valor (`valorPlaza`,
  Money con valor + moneda CLP).
- Portafolio `infoProbidad-cl`: canasta de las entidades en que las
  autoridades chilenas declaran acciones, ponderadas por valor declarado.
- Es **información pública de patrimonio**, no un portafolio de inversión
  ni recomendación.
- Limitación: el SPARQL es un Virtuoso público y puede tardar/limitar;
  el adapter tolera fallos y la etapa NO es crítica.

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

## Orquestador (run_all.py)

Etapas (en orden): `house_disclosure` → `senate_disclosure` → `renta4` →
`btg_pactual` → `infoprobidad` → `sec13f` → `etfs` → `prices` →
`compute_returns` → `performance` → `oge_trump` → `radar_ia`.

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
- **Vercel Cron**: `vercel.json` → GET `/api/run-pipeline` diario 13:00
  UTC (solo detección + alertas + emails; los scrapers corren en Actions).
