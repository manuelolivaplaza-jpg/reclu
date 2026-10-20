"""Declaraciones OGE 278-T de funcionarios del gabinete de EE.UU.

Generaliza el parser de F13 (`oge_trump.parse_278t`) para cualquier funcionario
listado en `scrapers/data/oge_officials.json`. Sin red ni base en el parseo:
cada fila entra como `status='pendiente'` y solo las verificadas generan
holdings y alertas.

Legal: 5 U.S.C. § 13107(c)(1)(B). Los datos son públicos y gratuitos; el
portafolio queda `premium=false` (ver migración 036 y
`src/lib/public-disclosure.ts`).
"""

from __future__ import annotations

import html
import json
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from oge_trump import (
    AMOUNT,
    DisclosureTrade,
    classify_side,
    extract_pdf_text,
    load_ticker_map,
    lookup_ticker,
    signed_from_filename,
    _parse_amount,
)

DATA_DIR = Path(__file__).resolve().parent / "data"
CONFIG_PATH = DATA_DIR / "oge_officials.json"

SIDE_WORD = re.compile(r"\b([A-Za-z0-9\\]{4,24})\b")
DATE_ANY_YEAR = re.compile(r"\b(\d{1,2})\s*/\s*(\d{1,2})\s*/(\d{4})\b")
TICKER_IN_DESC = re.compile(r"\(([A-Z][A-Z0-9.\-]{0,7})\)")
ENDNOTE = re.compile(r"\s+See\s+Endnotes?\s*$", re.I)

MIN_DISCLOSURE_USD = 1_001


@dataclass(frozen=True)
class Official:
    """Un funcionario configurado en `oge_officials.json`."""

    slug: str
    filer: str
    display_name: str
    position: str
    agency: str
    index_url: str
    portfolio_name: str


def load_config(path: Path | None = None) -> dict:
    return json.loads((path or CONFIG_PATH).read_text(encoding="utf-8"))


def load_officials(path: Path | None = None) -> list[Official]:
    """Lee la lista configurable y valida los campos mínimos."""
    raw = load_config(path)
    officials: list[Official] = []
    seen: set[str] = set()
    for item in raw.get("officials") or []:
        missing = [
            key
            for key in (
                "slug",
                "filer",
                "display_name",
                "position",
                "agency",
                "index_url",
                "portfolio_name",
            )
            if not str(item.get(key) or "").strip()
        ]
        if missing:
            raise ValueError(f"funcionario sin campos {missing}: {item!r}")
        official = Official(
            slug=str(item["slug"]).strip(),
            filer=str(item["filer"]).strip(),
            display_name=str(item["display_name"]).strip(),
            position=str(item["position"]).strip(),
            agency=str(item["agency"]).strip(),
            index_url=str(item["index_url"]).strip(),
            portfolio_name=str(item["portfolio_name"]).strip(),
        )
        if official.slug in seen:
            raise ValueError(f"slug duplicado en oge_officials.json: {official.slug}")
        seen.add(official.slug)
        officials.append(official)
    return officials


def _iso(month: str, day: str, year: str) -> str | None:
    m, d, y = int(month), int(day), int(year)
    if 2000 <= y <= 2100 and 1 <= m <= 12 and 1 <= d <= 31:
        return f"{y:04d}-{m:02d}-{d:02d}"
    return None


def _ticker_from_description(description: str) -> tuple[str | None, str]:
    match = TICKER_IN_DESC.search(description)
    if not match:
        return None, description
    symbol = match.group(1)
    clean = (description[: match.start()] + description[match.end() :]).strip()
    return symbol, re.sub(r"\s{2,}", " ", clean)


def parse_278t_official(
    text: str,
    *,
    report_url: str,
    report_signed: str | None = None,
    report_published: str | None = None,
    filer: str,
    ticker_map: dict[str, dict] | None = None,
) -> list[DisclosureTrade]:
    """Parsea un 278-T de cualquier año y funcionario.

    Acepta tickers entre paréntesis (`iShares ... (EWG)`), que es el formato
    habitual de los informes del gabinete. La fecha exige año explícito para
    no confundir encabezados ni datos de contacto con transacciones.
    """
    table = ticker_map if ticker_map is not None else load_ticker_map()
    flat = re.sub(r"\s+", " ", text or "")
    trades: list[DisclosureTrade] = []
    seen: set[int] = set()

    for match in SIDE_WORD.finditer(flat):
        side = classify_side(match.group(1))
        if not side:
            continue
        rest = flat[match.end() : match.end() + 90]
        date_match = DATE_ANY_YEAR.search(rest[:30])
        if not date_match:
            # "Salesforce" o "Sales" en una descripción no son una columna TYPE.
            continue
        window = flat[max(0, match.start() - 170) : match.start()]
        # Evita que "30 DAYS AGO" del encabezado se tome como número de fila.
        line_match = re.search(
            r"(\d{1,3})\s+((?!(?:DAYS|RECEIVED|OVER|AMOUNT|NOTIFICATION)\b)"
            r"[A-Za-z][^$]{1,120})$",
            window,
        )
        if not line_match:
            continue
        line_no = int(line_match.group(1))
        if line_no < 1 or line_no > 900 or line_no in seen:
            continue
        description = re.sub(r"\s+", " ", line_match.group(2)).strip(" -|")
        description = ENDNOTE.sub("", description).strip()
        if len(description) < 3:
            continue

        trans_date = _iso(date_match.group(1), date_match.group(2), date_match.group(3))
        if trans_date is None:
            continue
        consumed = date_match.end()
        tail = rest[consumed:]
        yn = re.match(r"\s*(Yes|Yos|No|Vos)\b", tail, re.I)
        if yn:
            tail = tail[yn.end() :]
        amount = AMOUNT.search(tail)
        lo, hi = _parse_amount(amount.group(0)) if amount else (None, None)

        symbol, clean_desc = _ticker_from_description(description)
        hit = lookup_ticker(description, table) or lookup_ticker(clean_desc, table)
        if symbol:
            asset = "etf" if "ETF" in description.upper() else "equity"
        elif hit:
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
                trans_date_uncertain=False,
                amount_min=lo,
                amount_max=hi,
                asset_class=asset,
            )
        )
    trades.sort(key=lambda row: row.line_no)
    return trades


def reports_from_payload(payload: dict, official: Official) -> list[dict]:
    """Extrae los PDF 278-T del JSON del índice público de la OGE."""
    reports: list[dict] = []
    seen: set[str] = set()
    for row in payload.get("data") or []:
        name = str(row.get("name") or "").strip()
        if name.lower() != official.filer.lower():
            continue
        kind = str(row.get("type") or "")
        if "278 transaction" not in kind.lower() and "278t" not in kind.lower():
            continue
        href = re.search(r"href=['\"]([^'\"]+)['\"]", kind)
        if not href:
            continue
        url = html.unescape(href.group(1)).replace("\\/", "/")
        if ".pdf" not in url.lower() or url in seen:
            continue
        published = str(row.get("docDate") or "")[:10] or None
        reports.append(
            {
                "url": url,
                "official": official,
                "report_signed": signed_from_filename(url),
                "report_published": published,
            }
        )
        seen.add(url)
    reports.sort(key=lambda item: item.get("report_signed") or "", reverse=True)
    return reports


def _midpoint(trade: DisclosureTrade) -> float:
    if trade.amount_min is None:
        return 0.0
    if trade.amount_max is None:
        return float(trade.amount_min)
    return (float(trade.amount_min) + float(trade.amount_max)) / 2.0


def holdings_for_trades(
    trades: list[DisclosureTrade],
    *,
    min_amount_usd: int = MIN_DISCLOSURE_USD,
) -> list[dict]:
    """Compras verificadas con ticker. El peso usa el punto medio del tramo."""
    chosen = [
        trade
        for trade in trades
        if trade.status == "verificada"
        and trade.side == "purchase"
        and trade.symbol
        and trade.asset_class in ("equity", "etf")
        and trade.amount_min is not None
        and trade.amount_min >= min_amount_usd
    ]
    if not chosen:
        return []
    mids = [_midpoint(row) for row in chosen]
    total = sum(mids) or 1.0
    return [
        {
            "symbol": row.symbol,
            "name": row.description,
            "weight": round(100.0 * mid / total, 2),
            "previous_weight": 0.0,
            "asset_class": row.asset_class,
            "currency": "USD",
            "as_of": row.trans_date or row.report_published or row.report_signed,
        }
        for row, mid in zip(chosen, mids)
    ]


def _cl_money(amount: int) -> str:
    return f"{int(amount):,}".replace(",", ".")


def alerts_for_trades(
    trades: list[DisclosureTrade],
    *,
    display_name: str,
) -> list[dict]:
    """Una alerta por compra/venta verificada. Las pendientes no alertan."""
    alerts: list[dict] = []
    for row in trades:
        if row.status != "verificada" or not row.symbol:
            continue
        if row.side not in ("purchase", "sale"):
            continue
        lo = _cl_money(row.amount_min or 0)
        hi = _cl_money(row.amount_max) if row.amount_max is not None else ""
        span = f"{lo}–{hi}" if hi else f"{lo}+"
        verb = "compró" if row.side == "purchase" else "vendió"
        alerts.append(
            {
                "type": "new_trade",
                "severity": "high" if (row.amount_min or 0) >= 5_000_001 else "medium",
                "title": f"{display_name} {verb} {row.symbol} (US${span})",
                "is_published": True,
                "payload": {
                    "filer": row.filer,
                    "symbol": row.symbol,
                    "side": row.side,
                    "description": row.description,
                    "trans_date": row.trans_date,
                    "report_published": row.report_published,
                    "amount_min": row.amount_min,
                    "amount_max": row.amount_max,
                    "source_url": row.report_url,
                },
            }
        )
    return alerts


class OgeOfficialsAdapter:
    """Descarga 278-T de cada funcionario y publica solo filas verificadas."""

    name = "oge_officials"

    def __init__(
        self,
        dry_run: bool = False,
        *,
        max_reports: int = 10,
        officials: list[Official] | None = None,
    ) -> None:
        self.dry_run = dry_run
        self.max_reports = max_reports
        self.officials = officials if officials is not None else load_officials()
        self._ticker_map = load_ticker_map()

    def fetch_raw(self) -> list[dict]:
        import httpx

        headers = {
            "User-Agent": "Mozilla/5.0 reclu-scraper/1.0",
            "Accept": "application/json,text/html,*/*",
        }
        reports: list[dict] = []
        with httpx.Client(headers=headers, timeout=60.0, follow_redirects=True) as client:
            for official in self.officials:
                try:
                    index = client.get(official.index_url)
                    index.raise_for_status()
                    found = reports_from_payload(index.json(), official)
                except Exception as exc:  # noqa: BLE001
                    print(f"[oge_officials] índice no disponible para {official.display_name}: {exc}")
                    continue
                if not found:
                    print(f"[oge_officials] sin 278-T para {official.display_name}")
                    continue
                for meta in found[: self.max_reports]:
                    response = client.get(meta["url"])
                    if response.status_code != 200 or not response.content.startswith(b"%PDF"):
                        print(
                            f"[oge_officials] no se pudo bajar {meta['url']} "
                            f"({response.status_code})"
                        )
                        continue
                    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
                        handle.write(response.content)
                        pdf_path = Path(handle.name)
                    try:
                        text = extract_pdf_text(pdf_path)
                    finally:
                        pdf_path.unlink(missing_ok=True)
                    reports.append({**meta, "text": text})
        return reports

    def parse_reports(self, raw: list[dict]) -> list[DisclosureTrade]:
        trades: list[DisclosureTrade] = []
        for report in raw:
            official = report["official"]
            trades.extend(
                parse_278t_official(
                    report.get("text") or "",
                    report_url=report["url"],
                    report_signed=report.get("report_signed"),
                    report_published=report.get("report_published"),
                    filer=official.filer,
                    ticker_map=self._ticker_map,
                )
            )
        return trades

    def normalize(self, raw: list[dict]) -> list[dict]:
        return holdings_for_trades(self.parse_reports(raw))

    def run(self, db=None) -> dict:
        raw = self.fetch_raw()
        trades = self.parse_reports(raw)
        pending = sum(1 for trade in trades if trade.status == "pendiente")
        by_official: dict[str, int] = {}
        for trade in trades:
            by_official[trade.filer] = by_official.get(trade.filer, 0) + 1
        summary = {
            "source": self.name,
            "officials": len(self.officials),
            "reports": len(raw),
            "parsed": len(trades),
            "pending": pending,
            "by_official": by_official,
            "holdings": 0,
            "alerts": 0,
            "status": "ok",
            "dry_run": self.dry_run,
        }
        print(
            f"[oge_officials] {'DRY-RUN ' if self.dry_run else ''}"
            f"{len(self.officials)} funcionarios, {len(raw)} informes, "
            f"{len(trades)} filas, {pending} pendientes. "
            "Sin alerta hasta revisión manual."
        )
        if self.dry_run or db is None:
            return summary

        self._save_pending(db, trades)
        verified = self._load_verified(db, [report["url"] for report in raw])
        for official in self.officials:
            rows = [row for row in verified if row.filer == official.filer]
            summary["holdings"] += self._save_holdings(
                db, official, holdings_for_trades(rows)
            )
            summary["alerts"] += self._save_alerts(
                db, official, alerts_for_trades(rows, display_name=official.display_name)
            )
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
        for row in result.data or []:
            description = row.get("description") or ""
            symbol, clean_desc = _ticker_from_description(description)
            hit = lookup_ticker(description, self._ticker_map) or lookup_ticker(
                clean_desc, self._ticker_map
            ) or {}
            loaded.append(
                DisclosureTrade(
                    filer=row.get("filer") or "",
                    report_url=row["report_url"],
                    report_signed=row.get("report_signed"),
                    report_published=row.get("report_published"),
                    line_no=row.get("line_no") or 0,
                    description=description,
                    symbol=row.get("symbol") or symbol,
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

    def _portfolio_id(self, db, official: Official) -> str:
        found = (
            db.table("portfolios")
            .select("id")
            .eq("slug", official.slug)
            .single()
            .execute()
        )
        if not found.data:
            raise RuntimeError(
                f"Falta el portafolio {official.slug}. Aplica la migración 036."
            )
        return found.data["id"]

    def _save_holdings(self, db, official: Official, holdings: list[dict]) -> int:
        if not holdings:
            return 0
        portfolio_id = self._portfolio_id(db, official)
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
            if existing and existing.data:
                continue
            db.table("holdings").insert(
                {
                    "portfolio_id": portfolio_id,
                    "symbol": holding["symbol"],
                    "name": holding["name"],
                    "weight": holding["weight"],
                    "asset_class": holding["asset_class"],
                    "currency": "USD",
                    "as_of": holding["as_of"],
                    "previous_weight": 0.0,
                }
            ).execute()
            written += 1
        return written

    def _save_alerts(self, db, official: Official, alerts: list[dict]) -> int:
        if not alerts:
            return 0
        portfolio_id = self._portfolio_id(db, official)
        current = (
            db.table("alerts")
            .select("payload")
            .eq("portfolio_id", portfolio_id)
            .eq("type", "new_trade")
            .execute()
        )
        seen = {
            ((row.get("payload") or {}).get("symbol"), (row.get("payload") or {}).get("source_url"))
            for row in current.data or []
        }
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


def main() -> None:
    """Vista rápida de la configuración: `python oge_officials.py --list`."""
    import argparse

    parser = argparse.ArgumentParser(description="Declaraciones OGE 278-T de funcionarios")
    parser.add_argument("--list", action="store_true", help="Listar los funcionarios configurados")
    parser.add_argument("--dry-run", action="store_true", help="No escribir en Supabase")
    args = parser.parse_args()
    if args.list:
        for official in load_officials():
            print(f"{official.slug:16s} {official.display_name:22s} {official.position}")
        return
    OgeOfficialsAdapter(dry_run=args.dry_run).run(None)


if __name__ == "__main__":
    main()
