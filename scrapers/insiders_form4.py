"""
SEC Form 4 — compras de ejecutivos (código P, mercado abierto).

Fuente (verificada 2026-10-19):
  Feed Atom de los últimos Form 4:
    https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4
    &company=&dateb=&owner=include&count=100&output=atom
  Cada filing enlaza a su índice. El XML ownershipDocument está en
    https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{archivo}.xml

Política de acceso de la SEC: User-Agent de sec13f.USER_AGENT y
time.sleep(0.15) entre requests (menos de 10 por segundo).

No se guardan direcciones del insider (rptOwnerStreet1, city, state, zip).
Solo nombre, cargo, emisor, ticker, fecha, código, acciones, precio y monto.

Portafolio: insiders-compras-1m. Pesos iguales entre las compras >= US$1M
de los últimos 90 días. previous_weight=0 solo si el ticker es nuevo.
"""

from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date, timedelta

from base import Holding, SourceAdapter, get_db, log
from sec13f import USER_AGENT

ATOM_URL = (
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent"
    "&type=4&company=&dateb=&owner=include&count=100&output=atom"
)
ATOM_NS = "{http://www.w3.org/2005/Atom}"
MIN_VALUE_USD = 1_000_000
HIGH_VALUE_USD = 10_000_000
LOOKBACK_DAYS = 90
PORTFOLIO_SLUG = "insiders-compras-1m"
PAUSE_S = 0.15

# Misma exclusión de entidades que el backtest (INC/LLC/LP/FUND/…).
ENTITY_RE = re.compile(
    r"\b(INC|LLC|L\.?P\.?|LTD|FUND|CORP|TRUST|HOLDINGS|PARTNERS|CAPITAL|GROUP|MANAGEMENT|N\.V\.|PLC|S\.A\.)\b",
    re.IGNORECASE,
)
SYMBOL_RE = re.compile(r"[A-Z0-9-]{1,6}")

TRADE_COLUMNS = (
    "accession",
    "issuer_cik",
    "symbol",
    "owner_name",
    "owner_title",
    "is_director",
    "is_officer",
    "trans_date",
    "filed_at",
    "code",
    "shares",
    "price",
    "value_usd",
    "shares_after",
    "source_url",
)


def _xml_root(xml_text: str) -> ET.Element:
    """Parsea XML ya decodificado. Quita el encoding del prólogo (Python 3.11)."""
    cleaned = re.sub(
        r"(<\?xml[^?]*?)\s+encoding=[\"'][^\"']+[\"']",
        r"\1",
        xml_text,
        count=1,
    )
    return ET.fromstring(cleaned)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _children(el: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in list(el) if _local(child.tag) == name]


def _child(el: ET.Element | None, name: str) -> ET.Element | None:
    if el is None:
        return None
    for child in list(el):
        if _local(child.tag) == name:
            return child
    return None


def _text(el: ET.Element | None, path: str) -> str:
    node: ET.Element | None = el
    for part in path.split("/"):
        node = _child(node, part)
        if node is None:
            return ""
    return (node.text or "").strip()


def _flag(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "y", "yes"}


def _num(value: str) -> float | None:
    raw = value.strip().replace(",", "")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def clean_symbol(raw: str) -> str:
    symbol = raw.upper().strip().replace(".", "-")
    symbol = re.sub(r"\s+", "", symbol)
    if not SYMBOL_RE.fullmatch(symbol):
        return ""
    return symbol


def is_entity_name(name: str) -> bool:
    return ENTITY_RE.search(name or "") is not None


def format_usd(value: float) -> str:
    """Entero con separador de miles es-CL (148.101.266)."""
    return f"{int(round(value)):,}".replace(",", ".")


def cik_digits(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    return str(int(digits))


def parse_form4(
    xml_text: str,
    *,
    accession: str = "",
    source_url: str = "",
    filed_at: str | None = None,
) -> list[dict]:
    """Una fila por transacción (no derivada o derivada). Sin direcciones.

    Las tenencias (nonDerivativeHolding) no son transacciones y se ignoran.
    El filtro de entrada (código P, officer/director, no entidad, >= US$1M)
    vive en qualifying_trade_rows.
    """
    try:
        root = _xml_root(xml_text)
    except ET.ParseError:
        return []
    if _local(root.tag) != "ownershipDocument":
        found = next((el for el in root.iter() if _local(el.tag) == "ownershipDocument"), None)
        if found is None:
            return []
        root = found

    issuer = _child(root, "issuer")
    symbol = clean_symbol(_text(issuer, "issuerTradingSymbol"))
    issuer_cik = cik_digits(_text(issuer, "issuerCik"))

    owner_el = _child(root, "reportingOwner")
    owner_id = _child(owner_el, "reportingOwnerId")
    relation = _child(owner_el, "reportingOwnerRelationship")
    owner_name = _text(owner_id, "rptOwnerName")
    owner_title = _text(relation, "officerTitle")
    is_director = _flag(_text(relation, "isDirector"))
    is_officer = _flag(_text(relation, "isOfficer"))

    signature = _text(_child(root, "ownerSignature"), "signatureDate")
    filed = (filed_at or signature or "")[:10]

    url = (source_url or "").strip()
    if not url and issuer_cik and accession:
        url = (
            "https://www.sec.gov/Archives/edgar/data/"
            f"{issuer_cik}/{accession.replace('-', '')}/"
        )

    rows: list[dict] = []
    tables = (
        ("nonDerivativeTable", "nonDerivativeTransaction", False),
        ("derivativeTable", "derivativeTransaction", True),
    )
    for table_name, tx_name, derivative in tables:
        for table in _children(root, table_name):
            for tx in _children(table, tx_name):
                shares = _num(_text(tx, "transactionAmounts/transactionShares/value"))
                price = _num(_text(tx, "transactionAmounts/transactionPricePerShare/value"))
                value = None
                if shares is not None and price is not None:
                    value = round(shares * price, 2)
                code = _text(tx, "transactionCoding/transactionCode").upper()
                rows.append(
                    {
                        "accession": accession,
                        "issuer_cik": issuer_cik or None,
                        "symbol": symbol,
                        "owner_name": owner_name,
                        "owner_title": owner_title or None,
                        "is_director": is_director,
                        "is_officer": is_officer,
                        "trans_date": _text(tx, "transactionDate/value")[:10],
                        "filed_at": filed,
                        "code": code,
                        "acquired": _text(
                            tx, "transactionAmounts/transactionAcquiredDisposedCode/value"
                        ).upper(),
                        "shares": shares,
                        "price": price,
                        "value_usd": value,
                        "shares_after": _num(
                            _text(tx, "postTransactionAmounts/sharesOwnedFollowingTransaction/value")
                        ),
                        "source_url": url,
                        "derivative": derivative,
                    }
                )
    return rows


def _is_open_market_insider(row: dict) -> bool:
    """Código P adquirido (A), officer o director, persona natural, ticker válido."""
    if row.get("derivative"):
        return False
    if row.get("code") != "P" or row.get("acquired") != "A":
        return False
    if not (row.get("is_officer") or row.get("is_director")):
        return False
    if is_entity_name(row.get("owner_name") or ""):
        return False
    if not row.get("symbol") or not row.get("owner_name"):
        return False
    if not row.get("trans_date") or not row.get("filed_at"):
        return False
    return True


def aggregate_same_day(rows: list[dict]) -> list[dict]:
    """Suma acciones y monto del mismo accession/ticker/persona/fecha/código.

    El precio queda como promedio ponderado. shares_after es el de la
    última transacción del día (orden del XML).
    """
    grouped: dict[tuple, dict] = {}
    order: list[tuple] = []
    for row in rows:
        key = (
            row.get("accession") or "",
            row.get("symbol") or "",
            row.get("owner_name") or "",
            row.get("trans_date") or "",
            row.get("code") or "",
        )
        if key not in grouped:
            grouped[key] = dict(row)
            grouped[key]["shares"] = 0.0
            grouped[key]["value_usd"] = 0.0
            order.append(key)
        bucket = grouped[key]
        shares = row.get("shares") or 0.0
        value = row.get("value_usd")
        if value is None and row.get("price") is not None:
            value = shares * (row.get("price") or 0.0)
        bucket["shares"] += shares
        bucket["value_usd"] += value or 0.0
        if row.get("shares_after") is not None:
            bucket["shares_after"] = row["shares_after"]
    out: list[dict] = []
    for key in order:
        bucket = grouped[key]
        shares = bucket["shares"] or 0.0
        bucket["value_usd"] = round(bucket["value_usd"], 2)
        bucket["shares"] = round(shares, 4)
        if shares:
            bucket["price"] = round(bucket["value_usd"] / shares, 6)
        out.append(bucket)
    return out


def qualifying_trade_rows(parsed: list[dict]) -> list[dict]:
    """Filtro del backtest: P+A, officer/director, no entidad, suma >= US$1M por (ticker, filed_at)."""
    filtered = [row for row in parsed if _is_open_market_insider(row)]
    aggregated = aggregate_same_day(filtered)
    totals: dict[tuple, float] = defaultdict(float)
    for row in aggregated:
        totals[(row["symbol"], row["filed_at"])] += row["value_usd"] or 0.0
    return [
        row
        for row in aggregated
        if totals[(row["symbol"], row["filed_at"])] >= MIN_VALUE_USD
    ]


def trade_key(row: dict) -> tuple:
    return (
        row.get("accession") or "",
        row.get("symbol") or "",
        row.get("owner_name") or "",
        row.get("trans_date") or "",
        row.get("code") or "",
    )


def unseen_rows(rows: list[dict], existing: set[tuple]) -> list[dict]:
    return [row for row in rows if trade_key(row) not in existing]


def build_events(rows: list[dict]) -> list[dict]:
    """Un evento por (ticker, fecha de presentación). El monto es la suma."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for row in rows:
        groups[(row["symbol"], row["filed_at"])].append(row)
    events: list[dict] = []
    for (symbol, filed_at), group in groups.items():
        primary = max(group, key=lambda row: row.get("value_usd") or 0.0)
        title = (primary.get("owner_title") or "") or ""
        events.append(
            {
                "accession": primary.get("accession") or "",
                "symbol": symbol,
                "owner_name": primary.get("owner_name") or "",
                "owner_title": title,
                "is_director": bool(primary.get("is_director")),
                "is_officer": bool(primary.get("is_officer")),
                "trans_date": primary.get("trans_date") or filed_at,
                "filed_at": filed_at,
                "value_usd": round(sum(row.get("value_usd") or 0.0 for row in group), 2),
                "source_url": primary.get("source_url") or "",
            }
        )
    events.sort(key=lambda event: (event["filed_at"], event["symbol"], event["owner_name"]))
    return events


def alert_identity(event: dict) -> tuple:
    return (event.get("symbol") or "", event.get("filed_at") or "", event.get("source_url") or "")


def alerts_for_unseen(events: list[dict], unseen: list[dict]) -> list[dict]:
    """Solo eventos que incluyen al menos una compra todavía no guardada."""
    fresh = {(row.get("symbol"), row.get("filed_at")) for row in unseen}
    return [event for event in events if (event["symbol"], event["filed_at"]) in fresh]


def drop_already_alerted(events: list[dict], seen: set[tuple]) -> list[dict]:
    return [event for event in events if alert_identity(event) not in seen]


def alert_severity(value_usd: float) -> str:
    return "high" if value_usd >= HIGH_VALUE_USD else "medium"


def alert_title(event: dict) -> str:
    title = (event.get("owner_title") or "").strip()
    if not title:
        title = "Director" if event.get("is_director") else "Ejecutivo"
    return f"Insider: {title} de {event['symbol']} compró US${format_usd(event['value_usd'])}"


def alert_payload(event: dict) -> dict:
    return {
        "symbol": event["symbol"],
        "owner_name": event["owner_name"],
        "owner_title": event.get("owner_title") or "",
        "value_usd": event["value_usd"],
        "trans_date": event["trans_date"],
        "filed_at": event["filed_at"],
        "source_url": event.get("source_url") or "",
    }


def trade_record(row: dict) -> dict:
    """Columnas de insider_trades. No copia acquired, derivative ni direcciones."""
    record = {
        "accession": row.get("accession") or "",
        "issuer_cik": row.get("issuer_cik") or None,
        "symbol": row["symbol"],
        "owner_name": row["owner_name"],
        "owner_title": row.get("owner_title") or None,
        "is_director": bool(row.get("is_director")),
        "is_officer": bool(row.get("is_officer")),
        "trans_date": row["trans_date"],
        "filed_at": row["filed_at"],
        "code": row["code"],
        "shares": row.get("shares"),
        "price": row.get("price"),
        "value_usd": row.get("value_usd"),
        "shares_after": row.get("shares_after"),
        "source_url": row.get("source_url") or "",
    }
    for key in record:
        low = key.lower()
        if any(token in low for token in ("street", "address", "city", "zip")):
            raise RuntimeError(f"columna de dirección rechazada: {key}")
    return record


def equal_weights(n: int) -> list[float]:
    if n <= 0:
        return []
    base = round(100.0 / n, 2)
    if n == 1:
        return [100.0]
    weights = [base] * (n - 1)
    weights.append(round(100.0 - base * (n - 1), 2))
    return weights


def holdings_from_symbols(symbols: list[str], *, as_of: date) -> list[Holding]:
    clean = sorted({symbol for symbol in symbols if symbol})
    weights = equal_weights(len(clean))
    return [
        Holding(
            symbol=symbol,
            name=symbol,
            weight=weight,
            asset_class="equity",
            currency="USD",
            as_of=as_of,
        )
        for symbol, weight in zip(clean, weights)
    ]


def symbols_in_window(rows: list[dict], *, today: date, lookback_days: int = LOOKBACK_DAYS) -> list[str]:
    cutoff = today - timedelta(days=lookback_days)
    symbols: set[str] = set()
    for row in rows:
        try:
            filed = date.fromisoformat(str(row.get("filed_at") or ""))
        except ValueError:
            continue
        if cutoff <= filed <= today:
            symbol = row.get("symbol") or ""
            if symbol:
                symbols.add(symbol)
    return sorted(symbols)


def parse_atom_feed(xml_text: str) -> list[dict]:
    """Filings del feed. Deduplica por accession y prefiere la entrada (Issuer)."""
    root = _xml_root(xml_text)
    found: dict[str, dict] = {}
    order: list[str] = []
    for entry in root.findall(f"{ATOM_NS}entry"):
        title = entry.findtext(f"{ATOM_NS}title") or ""
        term = ""
        for cat in entry.findall(f"{ATOM_NS}category"):
            if (cat.get("term") or "") and (cat.get("label") in (None, "", "form type") or not term):
                term = cat.get("term") or term
        if term and not term.startswith("4"):
            continue
        link = ""
        for el in entry.findall(f"{ATOM_NS}link"):
            if el.get("rel") in (None, "alternate"):
                link = el.get("href") or ""
                break
        entry_id = entry.findtext(f"{ATOM_NS}id") or ""
        summary = entry.findtext(f"{ATOM_NS}summary") or ""
        updated = entry.findtext(f"{ATOM_NS}updated") or ""
        acc_match = re.search(r"accession-number=(\d{10}-\d{2}-\d{6})", entry_id)
        if not acc_match or not link:
            continue
        accession = acc_match.group(1)
        filed_match = re.search(r"(\d{4}-\d{2}-\d{2})", summary)
        filed_at = filed_match.group(1) if filed_match else (updated[:10] if updated else "")
        cik_match = re.search(r"/Archives/edgar/data/(\d+)/", link)
        record = {
            "accession": accession,
            "index_url": link,
            "filed_at": filed_at,
            "issuer_cik": cik_match.group(1) if cik_match else "",
            "issuer_entry": "(Issuer)" in title,
        }
        if accession not in found:
            found[accession] = record
            order.append(accession)
        elif record["issuer_entry"] and not found[accession].get("issuer_entry"):
            found[accession] = record
    return [found[accession] for accession in order]


def folder_from_index_url(url: str) -> str:
    clean = url.split("?")[0]
    return re.sub(r"/[^/]*-index\.html?$", "", clean).rstrip("/")


def resolve_xml_url(index_body: str, folder: str) -> str | None:
    """Elige el XML del Form 4 dentro del índice (JSON de EDGAR o HTML)."""
    folder = folder.rstrip("/")
    body = index_body.lstrip()
    names: list[str] = []
    if body.startswith("{") or body.startswith("\ufeff{"):
        try:
            data = json.loads(index_body.lstrip("\ufeff"))
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            items = (data.get("directory") or {}).get("item") or []
            if isinstance(items, dict):
                items = [items]
            for item in items:
                name = str((item or {}).get("name") or "").strip()
                if name.lower().endswith(".xml") and "xsl" not in name.lower():
                    names.append(name)
    else:
        for href in re.findall(r'(?i)href="([^"]+\.xml)"', index_body):
            name = href.split("?")[0].split("/")[-1]
            if "xsl" in name.lower():
                continue
            if href.startswith("http"):
                names.append(href)
            else:
                names.append(name)

    def _url(name: str) -> str:
        if name.startswith("http"):
            return name
        return f"{folder}/{name}"

    for name in names:
        leaf = name.split("/")[-1].lower()
        if "form4" in leaf:
            return _url(name)
    for name in names:
        if name.split("/")[-1].lower() == "primary_doc.xml":
            return _url(name)
    if names:
        return _url(names[0])
    return None


def log_purchase(row: dict) -> None:
    """Línea de dry-run. Solo campos de mercado: nunca el XML ni la dirección."""
    title = row.get("owner_title") or ""
    log(
        f"[insiders_form4] DRY-RUN compra nueva (no escrita): {row.get('symbol')} "
        f"{row.get('owner_name')} ({title}) "
        f"US${format_usd(row.get('value_usd') or 0)} "
        f"fecha={row.get('trans_date')} presentado={row.get('filed_at')} "
        f"{row.get('source_url') or ''}"
    )


class InsidersForm4Adapter(SourceAdapter):
    name = "insiders_form4"
    portfolio_slug = PORTFOLIO_SLUG

    def __init__(self, dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.client.headers["User-Agent"] = USER_AGENT
        self.client.headers["Accept"] = "application/atom+xml,application/xml,application/json,text/html,*/*"
        self.pause_s = PAUSE_S
        self._request_count = 0

    def _get_text(self, url: str) -> str:
        if self._request_count:
            time.sleep(self.pause_s)
        self._request_count += 1
        response = self.client.get(url, timeout=30.0)
        response.raise_for_status()
        return response.text

    def _load_feed(self) -> list[dict]:
        try:
            text = self._get_text(ATOM_URL)
        except Exception:
            log("[insiders_form4] WARNING feed: no se pudo leer el Atom")
            return []
        try:
            filings = parse_atom_feed(text)
        except ET.ParseError:
            log("[insiders_form4] WARNING feed: Atom inválido")
            return []
        log(f"[insiders_form4] {len(filings)} filings en el feed")
        return filings

    def _download(self, filings: list[dict]) -> list[dict]:
        rows: list[dict] = []
        for filing in filings:
            accession = filing.get("accession") or ""
            try:
                folder = folder_from_index_url(filing["index_url"])
                index_body = self._get_text(f"{folder}/index.json")
                xml_url = resolve_xml_url(index_body, folder)
                if not xml_url and filing.get("index_url"):
                    html_body = self._get_text(filing["index_url"])
                    xml_url = resolve_xml_url(html_body, folder)
                if not xml_url:
                    log(f"[insiders_form4] WARNING {accession}: sin XML")
                    continue
                xml_text = self._get_text(xml_url)
                parsed = parse_form4(
                    xml_text,
                    accession=accession,
                    source_url=xml_url,
                    filed_at=filing.get("filed_at") or None,
                )
                if not parsed:
                    log(f"[insiders_form4] WARNING {accession}: sin transacciones")
                rows.extend(parsed)
            except Exception:
                log(f"[insiders_form4] WARNING {accession}: no se pudo leer el filing")
        log(f"[insiders_form4] {len(rows)} transacciones leídas")
        return rows

    def fetch_raw(self) -> list[dict]:
        return self._download(self._load_feed())

    def normalize(self, raw: list[dict]) -> list[Holding]:
        rows = qualifying_trade_rows(raw)
        today = date.today()
        return holdings_from_symbols(symbols_in_window(rows, today=today), as_of=today)

    def run(self, db=None) -> dict:
        if self.dry_run:
            return self._run_dry()
        if db is None:
            db = get_db()
        return self._run_write(db)

    def _run_dry(self) -> dict:
        raw = self.fetch_raw()
        rows = qualifying_trade_rows(raw)
        for row in rows:
            log_purchase(row)
        holdings = self.normalize(raw)
        if holdings:
            book = ", ".join(f"{h.symbol} {h.weight}%" for h in holdings)
            log(f"[insiders_form4] DRY-RUN libro (solo este feed): {book}")
        else:
            log("[insiders_form4] DRY-RUN: 0 compras >= US$1M en la ventana de 90 días")
        log(f"[insiders_form4] DRY-RUN: {len(rows)} compras NO escritas")
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "holdings": len(holdings),
            "trades": len(rows),
            "new_trades": len(rows),
            "alerts": len(build_events(rows)),
            "status": "ok" if rows else "empty",
            "dry_run": True,
        }

    def _known_accessions(self, db, accessions: list[str]) -> set[str]:
        if not accessions:
            return set()
        result = (
            db.table("insider_trades")
            .select("accession")
            .in_("accession", accessions)
            .execute()
        )
        return {row["accession"] for row in (result.data or []) if row.get("accession")}

    def _existing_trade_keys(self, db, accessions: list[str]) -> set[tuple]:
        if not accessions:
            return set()
        result = (
            db.table("insider_trades")
            .select("accession,symbol,owner_name,trans_date,code")
            .in_("accession", accessions)
            .execute()
        )
        keys: set[tuple] = set()
        for row in result.data or []:
            keys.add(
                (
                    row.get("accession") or "",
                    row.get("symbol") or "",
                    row.get("owner_name") or "",
                    str(row.get("trans_date") or "")[:10],
                    row.get("code") or "",
                )
            )
        return keys

    def _event_already_alerted(self, db, portfolio_id: str, event: dict) -> bool:
        """True si ya hay un new_trade con el mismo ticker, filing y URL."""
        result = (
            db.table("alerts")
            .select("id")
            .eq("portfolio_id", portfolio_id)
            .eq("type", "new_trade")
            .contains(
                "payload",
                {
                    "symbol": event["symbol"],
                    "filed_at": event["filed_at"],
                    "source_url": event.get("source_url") or "",
                },
            )
            .limit(1)
            .execute()
        )
        return bool(result.data)

    def _symbols_since(self, db, cutoff: date) -> list[str]:
        result = (
            db.table("insider_trades")
            .select("symbol,filed_at")
            .gte("filed_at", cutoff.isoformat())
            .execute()
        )
        symbols: list[str] = []
        for row in result.data or []:
            symbol = row.get("symbol") or ""
            if symbol:
                symbols.append(symbol)
        return symbols

    def _sync_holdings(self, db, trade_rows: list[dict]) -> int:
        today = date.today()
        local = symbols_in_window(trade_rows, today=today)
        remote = self._symbols_since(db, today - timedelta(days=LOOKBACK_DAYS))
        holdings = holdings_from_symbols(list(local) + list(remote), as_of=today)
        wanted = {holding.symbol: holding for holding in holdings}
        portfolio_id = self._resolve_portfolio_id(db)
        existing = (
            db.table("holdings")
            .select("id,symbol,weight,as_of")
            .eq("portfolio_id", portfolio_id)
            .execute()
        )
        by_symbol: dict[str, list[dict]] = defaultdict(list)
        for row in existing.data or []:
            by_symbol[row["symbol"]].append(row)

        for symbol, holding in wanted.items():
            current = sorted(by_symbol.get(symbol, []), key=lambda row: str(row.get("as_of") or ""))
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
            if abs(old_weight - holding.weight) >= 0.01 or not same_day:
                # Ticker ya existente: no repetir new_trade. 0 queda solo en el insert.
                payload["previous_weight"] = old_weight
            db.table("holdings").update(payload).eq("id", keep["id"]).execute()

        for symbol, current in by_symbol.items():
            if symbol in wanted:
                continue
            for row in current:
                db.table("holdings").delete().eq("id", row["id"]).execute()
        return len(wanted)

    def _run_write(self, db) -> dict:
        portfolio_id = self._resolve_portfolio_id(db)
        filings = self._load_feed()
        known = self._known_accessions(db, [filing["accession"] for filing in filings])
        fresh = [filing for filing in filings if filing["accession"] not in known]
        log(f"[insiders_form4] {len(fresh)} filings nuevos de {len(filings)}")
        raw = self._download(fresh)
        rows = [row for row in qualifying_trade_rows(raw) if row.get("source_url")]
        accessions = sorted({row["accession"] for row in rows if row.get("accession")})
        existing = self._existing_trade_keys(db, accessions)
        new_rows = unseen_rows(rows, existing)
        events = build_events(rows)
        to_alert = alerts_for_unseen(events, new_rows)

        if new_rows:
            db.table("insider_trades").upsert(
                [trade_record(row) for row in new_rows],
                on_conflict="accession,symbol,owner_name,trans_date,code",
            ).execute()
            log(f"[insiders_form4] {len(new_rows)} compras escritas")
        else:
            log("[insiders_form4] sin compras nuevas")

        to_alert = [
            event
            for event in to_alert
            if not self._event_already_alerted(db, portfolio_id, event)
        ]
        for event in to_alert:
            db.table("alerts").insert(
                {
                    "portfolio_id": portfolio_id,
                    "type": "new_trade",
                    "severity": alert_severity(event["value_usd"]),
                    "title": alert_title(event),
                    "payload": alert_payload(event),
                    "is_published": True,
                }
            ).execute()
        if to_alert:
            log(f"[insiders_form4] {len(to_alert)} alertas publicadas")

        holding_count = self._sync_holdings(db, rows)
        return {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "holdings": holding_count,
            "trades": len(rows),
            "new_trades": len(new_rows),
            "alerts": len(to_alert),
            "status": "ok" if rows or filings else "empty",
            "dry_run": False,
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Form 4 SEC → compras de ejecutivos")
    parser.add_argument("--dry-run", action="store_true", help="Lee la SEC y no escribe en Supabase")
    args = parser.parse_args()
    adapter = InsidersForm4Adapter(dry_run=args.dry_run)
    result = adapter.run()
    log(f"[insiders_form4] Result: {result}")
