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

from perf_store import save_real_series

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
    "gottheimer": "gottheimer-tracker",
    "cisneros": "cisneros-tracker",
    "hern": "hern-tracker",
    "delaney": "mcclain-delaney-tracker",
    "moskowitz": "moskowitz-tracker",
    "fields": "fields-tracker",
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
    client = httpx.Client(
        headers={"User-Agent": "Mozilla/5.0"},
        follow_redirects=True,
        timeout=httpx.Timeout(30.0, connect=10.0),
    )
    this_year = date.today().year
    txs: list[dict] = []
    for y in range(this_year, this_year - years, -1):
        try:
            links = _ptr_links(client, last_name, y)
        except Exception as e:  # noqa: BLE001
            print(f"  WARNING {last_name} {y}: {e}")
            continue
        for u in links:
            for attempt in range(3):
                try:
                    pdf = client.get(u)
                    pdf.raise_for_status()
                    txs.extend(_parse_ptr(pdf.content))
                    break
                except Exception as e:  # noqa: BLE001
                    if attempt == 2:
                        print(f"  WARNING PTR {u}: {e}")
                    else:
                        time.sleep(2 ** attempt)
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


def events_from_txs(txs: list[dict]) -> list[dict]:
    """PTR -> eventos: cada compra (P) abre US$1.000; la venta (S) cierra todo lo
    abierto de ese ticker al cierre de ese día. Ventas sin compra previa en la
    ventana se ignoran."""
    open_: dict[str, list[dict]] = {}
    events: list[dict] = []
    for t in sorted(txs, key=lambda t: t["date"]):
        tk = str(t["ticker"]).upper()
        d = t["date"].isoformat() if hasattr(t["date"], "isoformat") else str(t["date"])[:10]
        if t["type"] == "P":
            ev = {"ticker": tk, "entry": d, "exit": None, "side": 1}
            events.append(ev)
            open_.setdefault(tk, []).append(ev)
        elif t["type"] == "S":
            for ev in open_.pop(tk, []):
                ev["exit"] = d
    return events


def series_from_events(events: list[dict], fetch=None, sleep=time.sleep) -> list[dict]:
    """Serie diaria real (compra y mantención) con reintento por ticker.

    Reemplaza el promedio de PRECIOS de la canasta (un precio alto dominaba y
    cada cambio de canasta daba saltos falsos) y el recorrido O(n²) que dejaba
    pegado a moskowitz.
    """
    from event_series import compute_event_series

    if not events:
        return []
    fetch = fetch or fetch_eod
    start = min(e["entry"] for e in events)
    days = (date.today() - date.fromisoformat(start)).days + 15
    prices: dict[str, dict[str, float]] = {}
    tickers = sorted({e["ticker"] for e in events})
    for i, tk in enumerate(tickers):
        if i:
            sleep(SYMBOL_DELAY_SECONDS)
        rows: list = []
        for attempt in range(3):
            try:
                rows = fetch(tk, days)
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 2:
                    print(f"  WARNING precio {tk}: {exc}")
                else:
                    sleep(2 ** attempt)
        prices[tk] = {d: c for d, c in rows}
        if (i + 1) % 25 == 0:
            print(f"  precios {i + 1}/{len(tickers)}", flush=True)
    return compute_event_series(events, prices, "dollar")


def reconstruct_member(db, last_name: str, slug: str, years: int) -> int:
    pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute() if db is not None else None
    if db is not None and (not pf or not pf.data):
        print(f"-- {slug}: no está en la DB")
        return 0
    pid = pf.data["id"] if db is not None else None

    txs = _fetch_all_txs(last_name, years)
    if not txs:
        print(f"WARNING {last_name}: sin transacciones en {years} años")
        return 0
    events = events_from_txs(txs)
    if not events:
        print(f"WARNING {last_name}: sin compras en {years} años")
        return 0
    series = series_from_events(events)
    if not series:
        print(f"WARNING {last_name}: serie vacía")
        return 0
    print(f"{slug} ({last_name}): {len(txs)} tx, {len(events)} compras, {len(series)} días "
          f"{series[0]['date']} a {series[-1]['date']}, acumulado {series[-1]['value_pct']:+.2f}%")
    if db is None:
        return len(series)

    # Sin borrar historia: upsert real + borra solo estimadas en el rango escrito.
    save_real_series(db, pid, series)
    print(f"OK {slug}: guardado")
    return len(series)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", nargs="*", help="last names to limit to")
    ap.add_argument("--years", type=int, default=DEFAULT_YEARS)
    ap.add_argument("--dry-run", action="store_true", help="calcula sin escribir")
    args = ap.parse_args()
    db = None if args.dry_run else get_db()
    total = 0
    for last_name, slug in MEMBER_SLUG.items():
        if args.members and last_name not in args.members:
            continue
        print(f"\n=== {last_name} ({slug}) ===")
        total += reconstruct_member(db, last_name, slug, args.years)
    print(f"\n{total} puntos reales {'calculados (dry-run, nada guardado)' if db is None else 'guardados'}")


if __name__ == "__main__":
    main()
