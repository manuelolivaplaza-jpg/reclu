"""OGE Form 278-T (Trump compra).

parse_278t() es puro: sin red y sin base. Cada fila entra como
status='pendiente'. Solo 'verificada' genera holdings y alertas.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data" / "trump_oge"


def extract_pdf_text(pdf_path: Path) -> str:
    """pdftotext -layout si está instalado; si no, la capa OCR de pypdf."""
    import shutil
    import subprocess

    exe = shutil.which("pdftotext")
    if exe:
        done = subprocess.run(
            [exe, "-layout", str(pdf_path), "-"],
            capture_output=True,
            check=False,
        )
        text = done.stdout.decode("utf-8", errors="replace")
        if len(text.strip()) > 200:
            return text
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    if len(text.strip()) > 200:
        return text
    return _ocr_pdf(pdf_path) or text


def _ocr_pdf(pdf_path: Path) -> str:
    """Opcional. Requiere tesseract y pytesseract; si faltan, devuelve ''."""
    try:
        import pytesseract
        from pypdf import PdfReader
    except ImportError:
        return ""
    reader = PdfReader(str(pdf_path))
    chunks: list[str] = []
    for page in reader.pages:
        if not page.images:
            continue
        for image in page.images:
            try:
                chunks.append(pytesseract.image_to_string(image.image) or "")
            except Exception:
                return ""
    return "\n".join(chunks)
MIN_EQUITY_USD = 1_000_001

BRACKETS = (
    (1001, 15000),
    (15001, 50000),
    (50001, 100000),
    (100001, 250000),
    (250001, 500000),
    (500001, 1_000_000),
    (1_000_001, 5_000_000),
    (5_000_001, 25_000_000),
    (25_000_001, 50_000_000),
)

DATE_OK = re.compile(r"^(\d{1,2})/(\d{1,2})/2026$")
VALID_DATE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(2026)")
SIDE_WORD = re.compile(r"\b([A-Za-z0-9\\]{4,24})\b")
YN = re.compile(r"\b(Yes|Yos|No|Vos)\b", re.I)
AMOUNT = re.compile(
    r"[$S]?\s*\d[\d\s,.]{0,18}\d\s*[-–—•·]\s*[$S]?\s*\d[\d\s,.]{0,18}\d"
)


def classify_side(token: str) -> str | None:
    letters = re.sub(r"[^a-z]", "", token.lower())
    if len(letters) < 4:
        return None
    if "exch" in letters:
        return "exchange"
    # "lourchaso", "ourchaso", "I0urchase", "purchaso"
    if "urch" in letters or "purch" in letters:
        return "purchase"
    if letters.startswith("sal") or "sale" in letters:
        return "sale"
    return None


def _norm_key(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def load_ticker_map(path: Path | None = None) -> dict[str, dict]:
    raw = json.loads((path or (DATA_DIR / "descripcion_ticker.json")).read_text(encoding="utf-8"))
    return {_norm_key(k): v for k, v in raw.items()}


def lookup_ticker(description: str, table: dict[str, dict]) -> dict | None:
    return table.get(_norm_key(description))


def _snap(lo: int, hi: int) -> tuple[int, int]:
    for a, b in BRACKETS:
        if abs(lo - a) <= max(50, int(a * 0.02)) and abs(hi - b) <= max(50, int(b * 0.02)):
            return a, b
    return lo, hi


def _parse_amount(raw: str) -> tuple[int | None, int | None]:
    text = raw.upper().replace("S", "").replace("$", "")
    text = text.replace(" ", "").replace(",", "").replace(".", "")
    for ch in ("–", "—", "•", "·"):
        text = text.replace(ch, "-")
    parts = [p for p in text.split("-") if p.isdigit()]
    if len(parts) < 2:
        return None, None
    # El OCR a veces pega el número de la fila siguiente al máximo.
    ordered = sorted(BRACKETS, key=lambda ab: len(str(ab[0])) + len(str(ab[1])), reverse=True)
    for lo, hi in ordered:
        if parts[0].startswith(str(lo)) and parts[1].startswith(str(hi)):
            return lo, hi
    return _snap(int(parts[0][:8]), int(parts[1][:8]))


def _iso(month: str, day: str) -> str | None:
    m, d = int(month), int(day)
    if 1 <= m <= 12 and 1 <= d <= 31:
        return f"2026-{m:02d}-{d:02d}"
    return None


@dataclass
class DisclosureTrade:
    filer: str
    report_url: str
    report_signed: str | None
    report_published: str | None
    line_no: int
    description: str
    symbol: str | None
    side: str
    trans_date: str | None
    trans_date_uncertain: bool
    amount_min: int | None
    amount_max: int | None
    asset_class: str = "other"
    status: str = "pendiente"


def parse_278t(
    text: str,
    *,
    report_url: str,
    report_signed: str | None = None,
    report_published: str | None = None,
    filer: str = "Donald J. Trump",
    ticker_map: dict[str, dict] | None = None,
) -> list[DisclosureTrade]:
    table = ticker_map if ticker_map is not None else load_ticker_map()
    flat = re.sub(r"\s+", " ", text)
    trades: list[DisclosureTrade] = []
    seen: set[int] = set()
    for match in SIDE_WORD.finditer(flat):
        side = classify_side(match.group(1))
        if not side:
            continue
        window = flat[max(0, match.start() - 140) : match.start()]
        line_match = re.search(r"(\d{1,3})\s+([A-Za-z][^$]{1,100})$", window)
        if not line_match:
            continue
        line_no = int(line_match.group(1))
        if line_no < 1 or line_no > 600 or line_no in seen:
            continue
        description = re.sub(r"\s+", " ", line_match.group(2)).strip(" -|")
        if len(description) < 3:
            continue
        rest = flat[match.end() : match.end() + 90]
        date_match = VALID_DATE.search(rest)
        trans_date: str | None = None
        uncertain = False
        consumed = 0
        if date_match and date_match.start() < 20:
            trans_date = _iso(date_match.group(1), date_match.group(2))
            uncertain = trans_date is None
            consumed = date_match.end()
        else:
            token = re.match(r"\s*(\S+)", rest)
            raw = token.group(1) if token else ""
            ok = DATE_OK.match(re.sub(r"\s+", "", raw))
            if ok:
                trans_date = _iso(ok.group(1), ok.group(2))
                uncertain = trans_date is None
            else:
                uncertain = True
            consumed = token.end() if token else 0
        tail = rest[consumed:]
        yn = YN.search(tail[:24])
        if yn:
            tail = tail[yn.end() :]
        amount = AMOUNT.search(tail)
        lo, hi = _parse_amount(amount.group(0)) if amount else (None, None)
        hit = lookup_ticker(description, table)
        if hit:
            asset = hit.get("asset_class") or "equity"
            symbol = hit.get("symbol")
        elif "ETF" in description.upper():
            asset, symbol = "etf", None
        else:
            asset, symbol = "other", None
        seen.add(line_no)
        trades.append(
            DisclosureTrade(
                filer=filer,
                report_url=report_url,
                report_signed=report_signed,
                report_published=report_published,
                line_no=line_no,
                description=description,
                symbol=symbol,
                side=side,
                trans_date=trans_date,
                trans_date_uncertain=uncertain,
                amount_min=lo,
                amount_max=hi,
                asset_class=asset,
            )
        )
    trades.sort(key=lambda row: row.line_no)
    return trades


def _midpoint(trade: DisclosureTrade) -> float:
    if trade.amount_min is None:
        return 0.0
    if trade.amount_max is None:
        return float(trade.amount_min)
    return (float(trade.amount_min) + float(trade.amount_max)) / 2.0


def qualifying_purchases(trades: list[DisclosureTrade]) -> list[DisclosureTrade]:
    """Compras verificadas de acciones/ETF por US$1M o más, con ticker."""
    chosen: list[DisclosureTrade] = []
    for trade in trades:
        if trade.status != "verificada" or trade.side != "purchase":
            continue
        if not trade.symbol or trade.asset_class not in ("equity", "etf"):
            continue
        if trade.amount_min is None or trade.amount_min < MIN_EQUITY_USD:
            continue
        chosen.append(trade)
    return chosen


def holdings_for_trades(trades: list[DisclosureTrade]) -> list[dict]:
    rows = qualifying_purchases(trades)
    mids = [_midpoint(row) for row in rows]
    total = sum(mids) or 1.0
    holdings = []
    for row, mid in zip(rows, mids):
        holdings.append(
            {
                "symbol": row.symbol,
                "name": row.description,
                "weight": round(100.0 * mid / total, 2),
                "previous_weight": 0.0,
                "asset_class": row.asset_class,
                "currency": "USD",
                "as_of": row.trans_date or row.report_published or row.report_signed,
            }
        )
    return holdings


def _cl_money(amount: int) -> str:
    return f"{int(amount):,}".replace(",", ".")


def alerts_for_trades(trades: list[DisclosureTrade]) -> list[dict]:
    """Ninguna alerta si la fila sigue en 'pendiente'."""
    alerts = []
    for row in qualifying_purchases(trades):
        lo = _cl_money(row.amount_min or 0)
        hi = _cl_money(row.amount_max) if row.amount_max is not None else ""
        span = f"{lo}–{hi}" if hi else f"{lo}+"
        alerts.append(
            {
                "type": "new_trade",
                "severity": "high" if (row.amount_min or 0) >= 5_000_001 else "medium",
                "title": f"Trump compró {row.symbol} (US${span})",
                "is_published": True,
                "payload": {
                    "symbol": row.symbol,
                    "trans_date": row.trans_date,
                    "report_published": row.report_published,
                    "amount_min": row.amount_min,
                    "amount_max": row.amount_max,
                    "source_url": row.report_url,
                },
            }
        )
    return alerts


INDEX_URL = "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index?OpenView&Start=1&Count=1000"
PDF_HREF = re.compile(
    r"(https?://[^\s\"'<>]*Donald-J-Trump[^\s\"'<>]*278-?T[^\s\"'<>]*\.pdf"
    r"|/201/Presiden\.nsf/[^\s\"'<>]*Donald-J-Trump[^\s\"'<>]*278-?T[^\s\"'<>]*\.pdf)",
    re.I,
)


def discover_pdf_urls(html: str) -> list[str]:
    found: list[str] = []
    for match in PDF_HREF.finditer(html or ""):
        url = match.group(1).replace("&amp;", "&").replace("%24FILE", "$FILE")
        if url.startswith("/"):
            url = "https://extapps2.oge.gov" + url
        if url not in found:
            found.append(url)
    return found


def signed_from_filename(url: str) -> str | None:
    match = re.search(r"(\d{1,2})[.\-](\d{1,2})[.\-](202\d)", url)
    if not match:
        return None
    month, day, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if 1 <= month <= 12 and 1 <= day <= 31:
        return f"{year}-{month:02d}-{day:02d}"
    return None


def load_known_reports() -> list[dict]:
    path = DATA_DIR / "known_reports.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


class OgeTrumpAdapter:
    """Descarga 278-T, guarda filas como pendiente y publica solo las verificadas."""

    name = "oge_trump"
    portfolio_slug = "trump-compra"

    def __init__(self, dry_run: bool = False) -> None:
        self.dry_run = dry_run

    def fetch_raw(self) -> list[dict]:
        import httpx
        import tempfile

        known = {item["url"]: item for item in load_known_reports()}
        headers = {"User-Agent": "Mozilla/5.0 reclu-scraper/1.0", "Accept": "text/html,*/*"}
        with httpx.Client(headers=headers, timeout=60.0, follow_redirects=True) as client:
            try:
                index = client.get(INDEX_URL)
                for url in discover_pdf_urls(index.text):
                    known.setdefault(url, {"url": url, "report_signed": signed_from_filename(url), "report_published": None})
            except Exception as exc:  # noqa: BLE001
                print(f"[oge_trump] indice PAS no disponible: {exc}")
            reports = []
            for url, meta in known.items():
                response = client.get(url)
                if response.status_code != 200 or not response.content.startswith(b"%PDF"):
                    print(f"[oge_trump] no se pudo bajar {url} ({response.status_code})")
                    continue
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
                    handle.write(response.content)
                    pdf_path = Path(handle.name)
                try:
                    text = extract_pdf_text(pdf_path)
                finally:
                    pdf_path.unlink(missing_ok=True)
                reports.append(
                    {
                        "url": url,
                        "text": text,
                        "report_signed": meta.get("report_signed") or signed_from_filename(url),
                        "report_published": meta.get("report_published"),
                    }
                )
        return reports

    def parse_reports(self, raw: list[dict]) -> list[DisclosureTrade]:
        trades: list[DisclosureTrade] = []
        for report in raw:
            trades.extend(
                parse_278t(
                    report.get("text") or "",
                    report_url=report["url"],
                    report_signed=report.get("report_signed"),
                    report_published=report.get("report_published"),
                )
            )
        return trades

    def normalize(self, raw: list[dict]) -> list[dict]:
        return holdings_for_trades(self.parse_reports(raw))

    def run(self, db=None) -> dict:
        raw = self.fetch_raw()
        trades = self.parse_reports(raw)
        pending = sum(1 for trade in trades if trade.status == "pendiente")
        summary = {
            "source": self.name,
            "portfolio": self.portfolio_slug,
            "reports": len(raw),
            "parsed": len(trades),
            "pending": pending,
            "holdings": 0,
            "alerts": 0,
            "status": "ok",
            "dry_run": self.dry_run,
        }
        print(
            f"[oge_trump] {'DRY-RUN ' if self.dry_run else ''}"
            f"{len(raw)} informes, {len(trades)} filas, {pending} pendientes. "
            "Sin alerta hasta revisión manual."
        )
        if self.dry_run or db is None:
            return summary
        self._save_pending(db, trades)
        verified = self._load_verified(db, [report["url"] for report in raw])
        summary["holdings"] = self._save_holdings(db, holdings_for_trades(verified))
        summary["alerts"] = self._save_alerts(db, alerts_for_trades(verified))
        return summary

    def _save_pending(self, db, trades: list[DisclosureTrade]) -> None:
        for trade in trades:
            existing = (
                db.table("disclosure_trades")
                .select("id, status")
                .eq("report_url", trade.report_url)
                .eq("line_no", trade.line_no)
                .maybe_single()
                .execute()
            )
            row = {
                "filer": trade.filer,
                "report_url": trade.report_url,
                "report_signed": trade.report_signed,
                "report_published": trade.report_published,
                "line_no": trade.line_no,
                "description": trade.description,
                "symbol": trade.symbol,
                "side": trade.side,
                "trans_date": trade.trans_date,
                "trans_date_uncertain": trade.trans_date_uncertain,
                "amount_min": trade.amount_min,
                "amount_max": trade.amount_max,
            }
            if existing and existing.data:
                if existing.data.get("status") != "pendiente":
                    continue
                db.table("disclosure_trades").update(row).eq("id", existing.data["id"]).execute()
            else:
                row["status"] = "pendiente"
                db.table("disclosure_trades").insert(row).execute()

    def _load_verified(self, db, urls: list[str]) -> list[DisclosureTrade]:
        if not urls:
            return []
        result = (
            db.table("disclosure_trades")
            .select("*")
            .eq("status", "verificada")
            .in_("report_url", urls)
            .execute()
        )
        loaded: list[DisclosureTrade] = []
        table = load_ticker_map()
        for row in result.data or []:
            hit = lookup_ticker(row.get("description") or "", table) or {}
            loaded.append(
                DisclosureTrade(
                    filer=row.get("filer") or "Donald J. Trump",
                    report_url=row["report_url"],
                    report_signed=row.get("report_signed"),
                    report_published=row.get("report_published"),
                    line_no=row.get("line_no") or 0,
                    description=row.get("description") or "",
                    symbol=row.get("symbol"),
                    side=row.get("side") or "purchase",
                    trans_date=row.get("trans_date"),
                    trans_date_uncertain=bool(row.get("trans_date_uncertain")),
                    amount_min=int(row["amount_min"]) if row.get("amount_min") is not None else None,
                    amount_max=int(row["amount_max"]) if row.get("amount_max") is not None else None,
                    asset_class=hit.get("asset_class") or "equity",
                    status="verificada",
                )
            )
        return loaded

    def _portfolio_id(self, db) -> str:
        found = db.table("portfolios").select("id").eq("slug", self.portfolio_slug).single().execute()
        if not found.data:
            raise RuntimeError("Falta el portafolio trump-compra. Aplica la migración 019.")
        return found.data["id"]

    def _save_holdings(self, db, holdings: list[dict]) -> int:
        if not holdings:
            return 0
        portfolio_id = self._portfolio_id(db)
        written = 0
        for holding in holdings:
            if not holding.get("as_of"):
                continue
            existing = (
                db.table("holdings")
                .select("id")
                .eq("portfolio_id", portfolio_id)
                .eq("symbol", holding["symbol"])
                .eq("as_of", holding["as_of"])
                .maybe_single()
                .execute()
            )
            payload = {
                "portfolio_id": portfolio_id,
                "symbol": holding["symbol"],
                "name": holding["name"],
                "weight": holding["weight"],
                "asset_class": holding["asset_class"],
                "currency": "USD",
                "as_of": holding["as_of"],
                "previous_weight": 0.0,
            }
            if existing and existing.data:
                continue
            db.table("holdings").insert(payload).execute()
            written += 1
        return written

    def _save_alerts(self, db, alerts: list[dict]) -> int:
        if not alerts:
            return 0
        portfolio_id = self._portfolio_id(db)
        current = db.table("alerts").select("payload").eq("portfolio_id", portfolio_id).eq("type", "new_trade").execute()
        seen = set()
        for row in current.data or []:
            payload = row.get("payload") or {}
            seen.add((payload.get("symbol"), payload.get("source_url")))
        written = 0
        for alert in alerts:
            key = (alert["payload"].get("symbol"), alert["payload"].get("source_url"))
            if key in seen:
                continue
            db.table("alerts").insert(
                {
                    "portfolio_id": portfolio_id,
                    "type": alert["type"],
                    "severity": alert["severity"],
                    "title": alert["title"],
                    "payload": alert["payload"],
                    "is_published": True,
                }
            ).execute()
            seen.add(key)
            written += 1
        return written
