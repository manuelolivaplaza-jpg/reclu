"""Reconstruct REAL historical portfolios from House PTR disclosures.

The Clerk's PTR PDFs carry, per transaction: the ticker (in parentheses),
the transaction type (P=purchase, S=sale, E=exchange), the transaction date,
and the amount band. By walking every PTR across several years we can replay
a member's actual disclosed trading into a real performance series — the same
event-driven method used for the congress bridge, but sourced from the
official filings (works even for members absent from the live 60-day feed).

House PTR text is UTF-16-ish with NUL padding; we normalize before parsing.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import time
from datetime import date

import httpx
from pypdf import PdfReader

sys.path.insert(0, ".")

from base import get_db
from prices import fetch_eod

BASE = "https://disclosures-clerk.house.gov"
SEARCH = f"{BASE}/FinancialDisclosure/ViewMemberSearchResult"
SYMBOL_DELAY_SECONDS = 0.35
DEFAULT_YEARS = 4  # how far back to walk

# member last name -> portfolio slug
MEMBER_SLUG = {
    "pelosi": "pelosi-tracker",
    "trump": "trump-trades",
    "cardenas": "cardenas-tracker",
    "gonzalez-colon": "gonzalez-colon-tracker",
}


def _clean(text: str) -> str:
    """Strip NULs and collapse the UTF-16-ish spacing the Clerk emits."""
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    return text


def _ptr_links(client: httpx.Client, last_name: str, year: int) -> list[str]:
    """Reuse the proven adapter's search (handles the CSRF dance correctly)."""
    from house_disclosure import HouseDisclosureAdapter

    ad = HouseDisclosureAdapter(politician=last_name)
    return ad._fetch_ptr_urls(year=year)


# a transaction row in a PTR looks like:
#   <asset text with (TICKER)> <P|S|E> MM/DD/YYYY MM/DD/YYYY $amount
_TX_RE = re.compile(
    r"\(([A-Z]{1,5})\)\s*\[[^\]]*\]\s*"      # (TICKER) [ST/OP]
    r"([PSE])\s*(?:\([^)]*\))?\s*"           # type
    r"(\d{2}/\d{2}/\d{4})\s+"                # tx date
    r"(\d{2}/\d{2}/\d{4})",                  # notify date
)


def _parse_ptr(pdf_bytes: bytes) -> list[dict]:
    text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf_bytes)).pages)
    text = _clean(text)
    txs: list[dict] = []
    for m in _TX_RE.finditer(text):
        tk, typ, txd, _notif = m.groups()
        try:
            d = date.fromisoformat(
                f"{txd[6:10]}-{txd[0:2]}-{txd[3:5]}"
            )
        except ValueError:
            continue
        txs.append({"ticker": tk, "type": typ, "date": d})
    return txs


def _fetch_all_txs(last_name: str, years: int) -> list[dict]:
    client = httpx.Client(headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True, timeout=40)
    this_year = date.today().year
    txs: list[dict] = []
    for y in range(this_year, this_year - years, -1):
        try:
            links = _ptr_links(client, last_name, y)
        except Exception as e:  # noqa: BLE001
            print(f"  WARNING {last_name} {y}: {e}")
            continue
        for u in links:
            try:
                pdf = client.get(u)
                pdf.raise_for_status()
                txs.extend(_parse_ptr(pdf.content))
            except Exception as e:  # noqa: BLE001
                print(f"  WARNING PTR {u}: {e}")
            time.sleep(0.3)
    txs.sort(key=lambda t: t["date"])
    return txs


def _replay(txs: list[dict]) -> dict[date, list[str]]:
    held: set[str] = set()
    timeline: dict[date, list[str]] = {}
    for t in txs:
        tk = t["ticker"].upper()
        if t["type"] == "P":
            held.add(tk)
        elif t["type"] == "S":
            held.discard(tk)
        timeline[t["date"]] = sorted(held)
    return timeline


def _series_from_timeline(timeline: dict[date, list[str]]) -> list[tuple[str, float]]:
    all_tickers: set[str] = set()
    for tk in timeline.values():
        all_tickers.update(tk)
    if not all_tickers:
        return []
    price: dict[str, dict[str, float]] = {}
    for i, tk in enumerate(sorted(all_tickers)):
        if i:
            time.sleep(SYMBOL_DELAY_SECONDS)
        try:
            rows = fetch_eod(tk, 1600)
            price[tk] = {d: c for d, c in rows}
        except Exception:  # noqa: BLE001
            price[tk] = {}

    def val(basket: list[str], day: str) -> float | None:
        vals = []
        for tk in basket:
            pm = price.get(tk, {})
            keys = [k for k in pm if k <= day]
            if keys:
                vals.append(pm[max(keys)])
        return sum(vals) / len(vals) if vals else None

    base = None
    series: list[tuple[str, float]] = []
    for d in sorted(timeline):
        basket = timeline[d]
        if not basket:
            continue
        v = val(basket, d.isoformat())
        if v is None:
            continue
        if base is None:
            base = v
            series.append((d.isoformat(), 0.0))
            continue
        series.append((d.isoformat(), round((v / base - 1.0) * 100.0, 4)))
    return series


def reconstruct_member(db, last_name: str, slug: str, years: int) -> int:
    pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
    if not pf or not pf.data:
        print(f"-- {slug}: no está en la DB")
        return 0
    pid = pf.data["id"]

    txs = _fetch_all_txs(last_name, years)
    if not txs:
        print(f"WARNING {last_name}: sin transacciones en {years} años")
        return 0
    timeline = _replay(txs)
    if len(timeline) < 2:
        print(f"WARNING {last_name}: muy pocos eventos ({len(timeline)})")
        return 0
    series = _series_from_timeline(timeline)
    if not series:
        print(f"WARNING {last_name}: serie vacía")
        return 0

    db.table("portfolio_performance").delete().eq("portfolio_id", pid).execute()
    for day, pct in series:
        db.table("portfolio_performance").upsert(
            {"portfolio_id": pid, "date": day, "value_pct": pct},
            on_conflict="portfolio_id,date",
        ).execute()
    print(f"OK {slug} ({last_name}): {len(series)} eventos reales {series[0][0]}→{series[-1][0]}")
    return len(series)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", nargs="*", help="last names to limit to")
    ap.add_argument("--years", type=int, default=DEFAULT_YEARS)
    args = ap.parse_args()
    db = get_db()
    total = 0
    for last_name, slug in MEMBER_SLUG.items():
        if args.members and last_name not in args.members:
            continue
        print(f"\n=== {last_name} ({slug}) ===")
        total += reconstruct_member(db, last_name, slug, args.years)
    print(f"\n{total} eventos reales guardados")


if __name__ == "__main__":
    main()
