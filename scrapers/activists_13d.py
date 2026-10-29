"""SEC Schedule 13D — inversionistas activistas (más de 5% con intención).

Fuente (verificada 2026-10-19):
  EDGAR full-text search, sin clave y con User-Agent obligatorio:
    https://efts.sec.gov/LATEST/search-index?q=&forms=SCHEDULE%2013D
      &dateRange=custom&startdt=YYYY-MM-DD&enddt=YYYY-MM-DD
  Cada hit trae la fecha, el formulario (13D o 13D/A) y los display_names:
  primero el emisor con su ticker y CIK, después el filer con su CIK.
  Desde 2024 el documento principal es XML (primary_doc.xml), que aporta
  la fecha del evento y el porcentaje de la clase.

Política de acceso de la SEC: User-Agent de sec13f.USER_AGENT y pausa de
0,12 s entre requests (menos de 10 por segundo).

No se guardan direcciones: ni del emisor, ni del filer, ni de las personas
autorizadas. Solo emisor, ticker, filer, porcentaje, fechas y URL pública.

Portafolio activistas-13d: canasta igual-pesada con una posición por emisor
que haya presentado un 13D en los últimos 90 días. Las alertas son de tipo
new_trade y su payload.source_url apunta al filing.
"""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta

from base import Holding, SourceAdapter, get_db, log
from sec13f import USER_AGENT, largest_remainder

EFTS_URL = "https://efts.sec.gov/LATEST/search-index"
EFTS_PAGE_SIZE = 100
EFTS_MAX_PAGES = 10
LOOKBACK_DAYS = 90
PORTFOLIO_SLUG = "activistas-13d"
PAUSE_S = 0.12
MIN_PERCENT = 5.0
HIGH_PERCENT = 10.0
# En la primera corrida no se alerta todo el backfill de 90 días: solo lo
# recién presentado. La tabla y el portafolio sí cubren los 90 días.
ALERT_LOOKBACK_DAYS = 7
# El dry-run valida el parseo con una muestra para no descargar cientos de XML.
DRY_RUN_DOCS = 20

ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/primary_doc.xml"

CIK_SUFFIX_RE = re.compile(r"\s*\(CIK\s+(?P<cik>\d+)\)\s*$", re.IGNORECASE)
TICKER_TAIL_RE = re.compile(r"\s*\((?P<tickers>[^()]*)\)\s*$")
SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{0,9}$")

FILING_COLUMNS = (
    "accession",
    "issuer_name",
    "issuer_cik",
    "symbol",
    "filer_name",
    "percent_of_class",
    "event_date",
    "filed_at",
    "form",
    "is_amendment",
    "source_url",
)


def clean_symbol(raw: str) -> str:
    symbol = (raw or "").upper().strip().replace(".", "-")
    symbol = re.sub(r"\s+", "", symbol)
    if not symbol or not SYMBOL_RE.fullmatch(symbol):
        return ""
    return symbol


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def split_display_name(raw: str) -> dict:
    """Separa "Emisor  (TICKER, TICKER2)  (CIK 000...)" en sus partes."""
    text = _clean_text(raw)
    cik = ""
    match = CIK_SUFFIX_RE.search(text)
    if match:
        cik = match.group("cik")
        text = text[: match.start()].strip()

    tickers: list[str] = []
    tail = TICKER_TAIL_RE.search(text)
    if tail and "CIK" not in tail.group("tickers").upper():
        tickers = [part.strip() for part in tail.group("tickers").split(",") if part.strip()]
        text = text[: tail.start()].strip()

    symbol = ""
    candidates = [clean_symbol(ticker) for ticker in tickers]
    candidates = [candidate for candidate in candidates if candidate]
    if candidates:
        # El primer ticker es el principal; si viene con sufijo de warrant,
        # se prefiere una acción común cuando exista.
        plain = [candidate for candidate in candidates if "-" not in candidate]
        symbol = (plain or candidates)[0]

    return {
        "name": text,
        "cik": str(int(cik)) if cik else "",
        "symbol": symbol,
    }


def parse_efts_payload(payload: dict) -> list[dict]:
    """Hits de EFTS -> filings sin el XML. Deduplica por accession."""
    filings: dict[str, dict] = {}
    for hit in (payload.get("hits") or {}).get("hits") or []:
        source = hit.get("_source") or {}
        accession = (source.get("adsh") or "").strip()
        if not accession:
            accession = (hit.get("_id") or "").split(":", 1)[0].strip()
        if not accession or accession in filings:
            continue

        names = source.get("display_names") or []
        issuer = split_display_name(names[0] if names else "")
        filer = split_display_name(names[1] if len(names) > 1 else "")
        ciks = source.get("ciks") or []
        issuer_cik = issuer["cik"] or (str(int(str(ciks[0]))) if ciks else "")
        if not issuer_cik and len(ciks) > 1:
            issuer_cik = str(int(str(ciks[1])))

        form = (source.get("form") or source.get("file_type") or "").strip()
        filings[accession] = {
            "accession": accession,
            "issuer_name": issuer["name"],
            "issuer_cik": issuer_cik,
            "symbol": issuer["symbol"],
            "filer_name": filer["name"],
            "percent_of_class": None,
            "event_date": "",
            "filed_at": (source.get("file_date") or "")[:10],
            "form": form or "SCHEDULE 13D",
            "is_amendment": form.upper().endswith("/A"),
            "source_url": ARCHIVE_URL.format(
                cik=issuer_cik or "0",
                accession=accession.replace("-", ""),
            ),
        }
    return list(filings.values())


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(el: ET.Element | None, name: str) -> ET.Element | None:
    if el is None:
        return None
    for child in list(el):
        if _local(child.tag) == name:
            return child
    return None


def _text(el: ET.Element | None, name: str) -> str:
    node = _child(el, name)
    return _clean_text(node.text or "") if node is not None else ""


def _first(root: ET.Element, name: str) -> ET.Element | None:
    return next((el for el in root.iter() if _local(el.tag) == name), None)


def _percentage(raw: str) -> float | None:
    cleaned = (raw or "").replace("%", "").replace(",", ".").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _iso_date(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def parse_primary_doc(xml_text: str) -> dict:
    """Datos del primary_doc.xml: emisor, filer, % de clase y fecha.

    No se leen direcciones ni datos de contacto.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return {}

    issuer = _first(root, "issuerInfo")
    reporting = _first(root, "reportingPersonInfo")
    issuer_name = _text(issuer, "issuerName") or _text(_first(root, "item1"), "issuerName")
    filer_name = _text(reporting, "reportingPersonName")
    percent = _percentage(_text(reporting, "percentOfClass"))
    event_date = _iso_date(_text(_first(root, "coverPageHeader"), "dateOfEvent"))

    issuer_cik = re.sub(r"\D", "", _text(issuer, "issuerCIK"))
    return {
        "issuer_name": issuer_name,
        "issuer_cik": str(int(issuer_cik)) if issuer_cik else "",
        "filer_name": filer_name,
        "percent_of_class": percent,
        "event_date": event_date,
    }


def merge_document(filing: dict, document: dict) -> dict:
    """Combina el hit de EFTS con el XML. El XML manda en nombre y porcentaje."""
    merged = dict(filing)
    if document.get("issuer_name"):
        merged["issuer_name"] = document["issuer_name"]
    if document.get("issuer_cik"):
        merged["issuer_cik"] = document["issuer_cik"]
    if document.get("filer_name") and not merged.get("filer_name"):
        merged["filer_name"] = document["filer_name"]
    merged["percent_of_class"] = document.get("percent_of_class")
    merged["event_date"] = document.get("event_date") or merged.get("filed_at") or ""
    if merged.get("issuer_cik"):
        merged["source_url"] = ARCHIVE_URL.format(
            cik=merged["issuer_cik"],
            accession=merged["accession"].replace("-", ""),
        )
    return merged


def filing_record(filing: dict) -> dict:
    """Columnas de activist_filings. Sin direcciones."""
    record = {column: filing.get(column) for column in FILING_COLUMNS}
    record["issuer_name"] = record["issuer_name"] or "Emisor sin nombre"
    record["filer_name"] = record["filer_name"] or "Filer sin nombre"
    record["form"] = record["form"] or "SCHEDULE 13D"
    record["is_amendment"] = bool(record["is_amendment"])
    record["source_url"] = record["source_url"] or ""
    record["filed_at"] = record["filed_at"] or date.today().isoformat()
    return record


def holdings_from_filings(filings: list[dict], as_of: date | None = None) -> list[Holding]:
    """Una posición igual-pesada por emisor con ticker. Sin duplicados."""
    as_of = as_of or date.today()
    latest: dict[str, dict] = {}
    for filing in filings:
        symbol = (filing.get("symbol") or "").upper()
        if not symbol:
            continue
        current = latest.get(symbol)
        if current is None or str(filing.get("filed_at") or "") >= str(current.get("filed_at") or ""):
            latest[symbol] = filing
    if not latest:
        return []
    # D45: 617 x round(100/617, 2) sumaba 98,72; se reparte el resto.
    items = sorted(latest.items())
    weights = largest_remainder([1.0] * len(items))
    return [
        Holding(
            symbol=symbol,
            name=(filing.get("issuer_name") or symbol)[:120],
            weight=weights[i],
            asset_class="equity",
            exchange=None,
            currency="USD",
            as_of=as_of,
        )
        for i, (symbol, filing) in enumerate(items)
    ]


def alert_title(filing: dict) -> str:
    percent = filing.get("percent_of_class")
    pct = f"{percent:g}% de la clase" if percent is not None else "más del 5%"
    verb = "actualizó su 13D" if filing.get("is_amendment") else "presentó un 13D"
    return f"Activista: {filing.get('filer_name') or 'un fondo'} {verb} en {filing.get('symbol')} ({pct})"


def alert_payload(filing: dict) -> dict:
    return {
        "accession": filing.get("accession") or "",
        "symbol": filing.get("symbol") or "",
        "issuer_name": filing.get("issuer_name") or "",
        "filer_name": filing.get("filer_name") or "",
        "percent_of_class": filing.get("percent_of_class"),
        "event_date": filing.get("event_date") or "",
        "filed_at": filing.get("filed_at") or "",
        "source_url": filing.get("source_url") or "",
    }


def alert_severity(filing: dict) -> str:
    percent = filing.get("percent_of_class")
    return "high" if percent is not None and percent >= HIGH_PERCENT else "medium"


class Activists13DAdapter(SourceAdapter):
    name = "activists_13d"
    portfolio_slug = PORTFOLIO_SLUG

    def __init__(self, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.client.headers["User-Agent"] = USER_AGENT
        self.pause_s = PAUSE_S
        self._request_count = 0

    def _get(self, url: str, **kwargs):
        if self._request_count:
            time.sleep(self.pause_s)
        self._request_count += 1
        response = self.client.get(url, timeout=30.0, **kwargs)
        response.raise_for_status()
        return response

    def fetch_efts(self, today: date | None = None) -> list[dict]:
        """Todos los 13D/13D-A del período, paginando EFTS."""
        end = today or date.today()
        start = end - timedelta(days=LOOKBACK_DAYS)
        base_params = {
            "q": "",
            "forms": "SCHEDULE 13D",
            "dateRange": "custom",
            "startdt": start.isoformat(),
            "enddt": end.isoformat(),
            "size": EFTS_PAGE_SIZE,
        }
        collected: dict[str, dict] = {}
        total = None
        for page in range(EFTS_MAX_PAGES):
            params = dict(base_params, **{"from": page * EFTS_PAGE_SIZE})
            response = self._get(EFTS_URL, params=params, headers={"Accept": "application/json"})
            payload = response.json()
            if total is None:
                total = ((payload.get("hits") or {}).get("total") or {}).get("value")
            hits = (payload.get("hits") or {}).get("hits") or []
            if not hits:
                break
            for filing in parse_efts_payload(payload):
                collected.setdefault(filing["accession"], filing)
            if len(hits) < EFTS_PAGE_SIZE:
                break
            if total is not None and len(collected) >= int(total):
                break
        filings = list(collected.values())
        log(f"[activists_13d] {len(filings)} filings 13D desde {start} hasta {end}")
        return filings

    def fetch_documents(self, filings: list[dict]) -> list[dict]:
        """Descarga y combina el primary_doc.xml de cada filing."""
        rows: list[dict] = []
        for filing in filings:
            accession = filing.get("accession") or ""
            try:
                response = self._get(filing["source_url"], headers={"Accept": "application/xml,text/xml,*/*"})
                document = parse_primary_doc(response.text)
            except Exception:  # noqa: BLE001 — un XML roto no tumba la etapa
                log(f"[activists_13d] WARNING {accession}: no se pudo leer primary_doc.xml")
                document = {}
            rows.append(merge_document(filing, document))
        return rows

    def fetch_raw(self) -> list[dict]:
        return self.fetch_documents(self.fetch_efts())

    def normalize(self, raw: list[dict]) -> list[Holding]:
        return holdings_from_filings(raw)

    def run(self, db=None) -> dict:
        if self.dry_run:
            return self._run_dry()
        if db is None:
            db = get_db()
        return self._run_write(db)

    def _run_dry(self) -> dict:
        filings = self.fetch_efts()
        sample = filings[:DRY_RUN_DOCS]
        rows = self.fetch_documents(sample)
        for row in rows:
            log(
                f"[activists_13d] DRY-RUN {row['filed_at']} {row.get('symbol') or '—'} "
                f"{row.get('issuer_name')} / {row.get('filer_name')} "
                f"{row.get('percent_of_class')}% {row['source_url']}"
            )
        holdings = self.normalize(rows)
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "filings": len(filings),
            "documents_read": len(rows),
            "holdings": len(holdings),
            "status": "ok" if filings else "empty",
            "dry_run": True,
        }

    def _known_accessions(self, db, accessions: list[str]) -> set[str]:
        known: set[str] = set()
        # PostgREST limita el largo de la URL: se consulta en tandas.
        for start in range(0, len(accessions), 100):
            chunk = accessions[start : start + 100]
            result = (
                db.table("activist_filings")
                .select("accession")
                .in_("accession", chunk)
                .execute()
            )
            known.update(
                row.get("accession") for row in result.data or [] if row.get("accession")
            )
        return known

    def _alerted_accessions(self, db, portfolio_id: str, cutoff: str) -> set[str]:
        """Accessions que ya tienen una alerta new_trade en el período."""
        result = (
            db.table("alerts")
            .select("payload")
            .eq("portfolio_id", portfolio_id)
            .eq("type", "new_trade")
            .gte("created_at", cutoff)
            .execute()
        )
        return {
            (row.get("payload") or {}).get("accession")
            for row in result.data or []
            if (row.get("payload") or {}).get("accession")
        }

    def _sync_holdings(self, db, portfolio_id: str) -> int:
        today = date.today()
        cutoff = today - timedelta(days=LOOKBACK_DAYS)
        result = (
            db.table("activist_filings")
            .select("symbol,issuer_name,filed_at,percent_of_class")
            .gte("filed_at", cutoff.isoformat())
            .execute()
        )
        holdings = holdings_from_filings(result.data or [], as_of=today)
        if not holdings:
            return 0

        existing = (
            db.table("holdings")
            .select("id,symbol,weight,as_of")
            .eq("portfolio_id", portfolio_id)
            .execute()
        )
        by_symbol: dict[str, list[dict]] = {}
        for row in existing.data or []:
            by_symbol.setdefault(row["symbol"], []).append(row)

        for holding in holdings:
            current = sorted(by_symbol.get(holding.symbol, []), key=lambda row: str(row.get("as_of") or ""))
            payload = {
                "portfolio_id": portfolio_id,
                "symbol": holding.symbol,
                "name": holding.name,
                "weight": holding.weight,
                "asset_class": holding.asset_class,
                "exchange": holding.exchange,
                "currency": holding.currency,
                "as_of": holding.as_of.isoformat(),
            }
            if not current:
                payload["previous_weight"] = 0.0
                db.table("holdings").insert(payload).execute()
                continue
            keep = current[-1]
            for extra in current[:-1]:
                db.table("holdings").delete().eq("id", extra["id"]).execute()
            old_weight = float(keep["weight"])
            same_day = str(keep.get("as_of") or "")[:10] == today.isoformat()
            if same_day and abs(old_weight - holding.weight) < 0.01:
                continue
            payload["previous_weight"] = old_weight
            db.table("holdings").update(payload).eq("id", keep["id"]).execute()

        wanted = {holding.symbol for holding in holdings}
        for symbol, rows in by_symbol.items():
            if symbol in wanted:
                continue
            for row in rows:
                db.table("holdings").delete().eq("id", row["id"]).execute()
        return len(holdings)

    def _run_write(self, db) -> dict:
        portfolio_id = self._resolve_portfolio_id(db)
        filings = self.fetch_efts()
        known = self._known_accessions(db, [filing["accession"] for filing in filings])
        fresh = [filing for filing in filings if filing["accession"] not in known]
        log(f"[activists_13d] {len(fresh)} filings nuevos de {len(filings)}")
        rows = self.fetch_documents(fresh)

        if rows:
            db.table("activist_filings").upsert(
                [filing_record(row) for row in rows],
                on_conflict="accession",
            ).execute()
            log(f"[activists_13d] {len(rows)} filings escritos")

        alerts = 0
        alert_cutoff = (date.today() - timedelta(days=ALERT_LOOKBACK_DAYS)).isoformat()
        alerted = self._alerted_accessions(db, portfolio_id, alert_cutoff)
        for row in rows:
            if not row.get("symbol"):
                continue
            if str(row.get("filed_at") or "") < alert_cutoff:
                continue
            if row["accession"] in alerted:
                continue
            percent = row.get("percent_of_class")
            if percent is not None and percent < MIN_PERCENT:
                continue
            db.table("alerts").insert(
                {
                    "portfolio_id": portfolio_id,
                    "type": "new_trade",
                    "severity": alert_severity(row),
                    "title": alert_title(row),
                    "payload": alert_payload(row),
                    "is_published": True,
                }
            ).execute()
            alerts += 1
        if alerts:
            log(f"[activists_13d] {alerts} alertas publicadas")

        holding_count = self._sync_holdings(db, portfolio_id)
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "filings": len(rows),
            "new_filings": len(rows),
            "alerts": alerts,
            "holdings": holding_count,
            "status": "ok" if rows or filings else "empty",
            "dry_run": False,
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Schedule 13D activistas (SEC EDGAR)")
    parser.add_argument("--dry-run", action="store_true", help="No escribir en Supabase")
    args = parser.parse_args()
    print(Activists13DAdapter(dry_run=args.dry_run).run(None))
