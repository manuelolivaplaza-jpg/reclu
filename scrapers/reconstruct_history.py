"""Reconstruct REAL historical 13F portfolios, quarter by quarter.

Unlike performance.py (which projects *today's* holdings backwards — a
"mark-to-market" approximation, not real history), this reads each fund's
actual 13F-HR filings over the past N quarters and rebuilds the portfolio as
it really was each quarter. Prices are real (Yahoo); weights are real (SEC).

For each quarter q we store a snapshot: {quarter, holdings:[(symbol,weight)]}.
Then a real performance series is computed by chaining quarters: the return
over each quarter uses that quarter's real weights, so the curve reflects the
fund's actual trading over time (buffett really did not hold X last year).

Usage:
    python reconstruct_history.py            # all 13F funds, 5 quarters
    python reconstruct_history.py --funds berkshire-hathaway-13f scion-13f
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, datetime

sys.path.insert(0, ".")

from base import get_db
from prices import fetch_eod
from sec13f import (
    ARCHIVES_URL,
    SUBMISSIONS_URL,
    SPECIAL_INFOTABLE,
    _get_json,
    _get_text,
    FUNDS,
)

QUARTER_DELAY_SECONDS = 0.4
SYMBOL_DELAY_SECONDS = 0.35
DEFAULT_QUARTERS = 5

# fund slug -> CIK (mirror of sec13f.FUNDS, which maps name -> CIK)
SLUG_BY_NAME = {
    "Berkshire Hathaway": "berkshire-hathaway-13f",
    "Scion Asset Management": "scion-13f",
    "Pershing Square": "pershing-square-13f",
    "Appaloosa": "appaloosa-13f",
    "Tiger Global": "tiger-global-13f",
    "Coatue": "coatue-13f",
    "Duquesne": "duquesne-13f",
    "Third Point": "third-point-13f",
    "Baupost": "baupost-13f",
    "Viking Global": "viking-global-13f",
    "TCI Fund Management": "tci-13f",
    "Public Investment Fund": "pif-13f",
    "Cevian Capital": "cevian-13f",
    "Egerton Capital": "egerton-13f",
    "SoftBank Group": "softbank-13f",
    "SB Investment Advisers": "sb-advisers-13f",
    "Mubadala": "mubadala-13f",
    "Lansdowne Partners": "lansdowne-13f",
    "Renaissance Technologies": "renaissance-13f",
    "Bridgewater Associates": "bridgewater-13f",
    "Soros Fund Management": "soros-13f",
}


def _all_13f_filings(cik: int, limit: int) -> list[tuple[str, str]]:
    """Return [(accession, filing_date)] of the most recent 13F-HR filings."""
    data = _get_json(SUBMISSIONS_URL.format(cik=cik))
    recent = data["filings"]["recent"]
    out: list[tuple[str, str]] = []
    for form, dt, acc in zip(recent["form"], recent["filingDate"], recent["accessionNumber"]):
        if form == "13F-HR":
            out.append((acc, dt))
        if len(out) >= limit:
            break
    return out


def _infotable_url(cik: int, accession: str, fund_name: str = "") -> str:
    acc_nodash = accession.replace("-", "")
    base = ARCHIVES_URL.format(cik=cik, accession_nodash=acc_nodash)
    special = SPECIAL_INFOTABLE.get(fund_name)
    if special:
        return f"{base}/{special}"
    index = _get_json(f"{base}/index.json")
    for item in index["directory"]["item"]:
        name = item["name"]
        if name.endswith(".xml") and name != "primary_doc.xml":
            return f"{base}/{name}"
    raise ValueError(f"no info table xml in accession {accession}")


def _parse_holdings(xml_text: str, fund_name: str) -> list[tuple[str, float]]:
    """Parse a 13F info table -> [(ticker_or_name, value_usd)]."""
    import xml.etree.ElementTree as ET

    root = ET.fromstring(xml_text)
    ns = {"n": "http://www.sec.gov/edgar/document/thirteenf/informationtable"}
    # fall back: many filings have no namespace prefix
    if root.find(".//n:infoTable", ns) is None:
        ns = {}
    rows: list[tuple[str, float]] = []
    for tbl in root.iter():
        tag = tbl.tag.split("}")[-1]
        if tag != "infoTable":
            continue
        def txt(field: str) -> str:
            for el in tbl.iter():
                if el.tag.split("}")[-1] == field:
                    return (el.text or "").strip()
            return ""

        name = txt("nameOfIssuer")
        value_raw = txt("value")
        try:
            value = float(value_raw or 0)
        except ValueError:
            value = 0.0
        if value <= 0:
            continue
        # prefer ticker, else issuer name
        cls = txt("titleOfClass")
        cusip = txt("cusip")
        label = name
        rows.append((label, value, cls, cusip))
    return rows


def _weights_from_values(rows: list[tuple], top: int = 40) -> list[tuple[str, float]]:
    """Convert [(label,value,cls,cusip)] -> normalized top-N weights (%)."""
    rows.sort(key=lambda r: r[1], reverse=True)
    rows = rows[:top]
    total = sum(r[1] for r in rows)
    if total <= 0:
        return []
    return [(r[0], 100.0 * r[1] / total) for r in rows]


def _resolve_symbol(label: str, cls: str, cache: dict) -> str | None:
    """Best-effort ticker from an issuer label using Yahoo search."""
    key = label.strip().upper()
    if key in cache:
        return cache[key]
    import httpx

    symbol = None
    try:
        r = httpx.get(
            "https://query1.finance.yahoo.com/v1/finance/search",
            params={"q": label, "quotesCount": 1},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        if r.status_code == 200:
            quotes = r.json().get("quotes", [])
            if quotes:
                symbol = quotes[0].get("symbol")
    except Exception:
        symbol = None
    cache[key] = symbol
    return symbol


def _chain_series(quarters: list[tuple[str, list[tuple[str, float]]]]) -> list[tuple[str, float]]:
    """Build a real performance series by chaining quarterly returns.

    quarters: [(quarter_end_date, [(symbol, weight_pct)])] oldest->newest.
    For each quarter we fetch the price at its start (prev quarter end) and
    end, compute the weighted return, and compound them into an index.
    Returns [(date, index_value)] where index starts at 100.
    """
    if len(quarters) < 2:
        return []
    index = 100.0
    series: list[tuple[str, float]] = [(quarters[0][0], index)]
    for i in range(1, len(quarters)):
        q_end, holdings = quarters[i]
        q_start = quarters[i - 1][0]
        rets: list[tuple[float, float]] = []  # (weight_frac, symbol_return)
        total_w = 0.0
        for symbol, weight in holdings:
            if symbol is None:
                continue
            try:
                rows = fetch_eod(symbol, 400)
            except Exception:
                continue
            if not rows:
                continue
            price_map = {d: c for d, c in rows}
            # price nearest to q_start and q_end
            def nearest(target: str):
                keys = [k for k in price_map if k <= target]
                return price_map[max(keys)] if keys else None

            p0 = nearest(q_start)
            p1 = nearest(q_end)
            if not p0 or not p1 or p0 <= 0:
                continue
            w = weight / 100.0
            rets.append((w, p1 / p0 - 1.0))
            total_w += w
        if total_w <= 0:
            continue
        weighted_ret = sum(w * r for w, r in rets) / total_w
        index *= 1.0 + weighted_ret
        series.append((q_end, round(index, 4)))
    return series


def reconstruct_fund(db, slug: str, cik: int, name: str, quarters: int, cache: dict) -> int:
    r = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
    if not r or not r.data:
        print(f"-- {slug} ({name}): no está en la DB, saltando")
        return 0
    pid = r.data["id"]

    filings = _all_13f_filings(cik, quarters + 1)
    if len(filings) < 2:
        print(f"WARNING {slug}: solo {len(filings)} filings 13F")
        return 0

    quarter_holdings: list[tuple[str, list[tuple[str, float]]]] = []
    for acc, fdate in filings:
        try:
            url = _infotable_url(cik, acc, name)
            xml_text = _get_text(url)
            rows = _parse_holdings(xml_text, name)
            weighted = _weights_from_values(rows)
            # resolve symbols
            resolved: list[tuple[str | None, float]] = []
            for label, w in weighted:
                sym = _resolve_symbol(label, "", cache)
                resolved.append((sym, w))
            quarter_holdings.append((fdate, resolved))
            print(f"  {name} {fdate}: {len(weighted)} holdings")
        except Exception as e:  # noqa: BLE001
            print(f"WARNING {name} {fdate}: {e}")
        time.sleep(QUARTER_DELAY_SECONDS)

    quarter_holdings.sort(key=lambda x: x[0])  # oldest first
    if len(quarter_holdings) < 2:
        return 0

    series = _chain_series(quarter_holdings)
    if not series:
        print(f"WARNING {slug}: serie vacía")
        return 0

    # store real performance points (table: portfolio_performance, cols: portfolio_id, date, value_pct)
    for day, idx in series:
        # convert index (base 100) to pct vs first point
        pct = idx - 100.0
        db.table("portfolio_performance").upsert(
            {
                "portfolio_id": pid,
                "date": day,
                "value_pct": pct,
            },
            on_conflict="portfolio_id,date",
        ).execute()
    print(f"OK {slug}: {len(series)} trimestres reales reconstruidos")
    return len(series)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--funds", nargs="*", help="slugs to limit to")
    ap.add_argument("--quarters", type=int, default=DEFAULT_QUARTERS)
    args = ap.parse_args()

    db = get_db()
    cache: dict = {}
    total = 0
    for name, cik in FUNDS.items():
        slug = SLUG_BY_NAME.get(name)
        if args.funds and slug not in args.funds:
            continue
        if slug is None:
            print(f"-- {name}: sin slug mapeado, saltando")
            continue
        print(f"\n=== {name} ({slug}) ===")
        total += reconstruct_fund(db, slug, cik, name, args.quarters, cache)
    print(f"\n{total} trimestres reales guardados en total")


if __name__ == "__main__":
    main()
