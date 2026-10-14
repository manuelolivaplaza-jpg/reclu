"""Replace 13F issuer names stored in holdings.symbol with Yahoo tickers.

Rows were saved with the issuer name as the symbol (for example
'ABBOTT LABORATORIES' instead of 'ABT'). Yahoo price history needs the
ticker. Names that Yahoo does not match clearly are left unchanged.

Usage (from the scrapers directory):
    python resolve_tickers.py

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see base.get_db).
"""

from __future__ import annotations

import re
import time

import httpx

SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
USER_AGENT = "Mozilla/5.0"
# More than one quote so a foreign listing can lose to NYSE/NASDAQ.
QUOTES_COUNT = 10
REQUEST_DELAY_S = 0.3
PAGE_SIZE = 1000

# NYQ/NMS/NGM/NCM are Yahoo's codes for NYSE and Nasdaq.
_US_EXCHANGES = {"NYQ", "NMS", "NGM", "NCM", "NYSE", "NASDAQ"}
_FILLER = {
    "INC",
    "INCORPORATED",
    "CORP",
    "CORPORATION",
    "CO",
    "COMPANY",
    "LTD",
    "LIMITED",
    "LLC",
    "LP",
    "PLC",
    "SA",
    "AG",
    "NV",
    "DEL",
    "NEW",
    "THE",
    "CLASS",
    "COM",
    "COMMON",
    "STOCK",
    "SHARES",
    "HLDG",
    "HLDGS",
    "HOLDINGS",
    "GROUP",
    "GRP",
    "ETF",
    "FUND",
    "TRUST",
    "SHS",
    "ADS",
}
# Common stock, or a single-letter class share such as BRK-B. Rejects
# preferred lines such as JPM-PM.
_TICKER_RE = re.compile(r"^[A-Z]{1,5}(?:[.\-][A-Z])?$")


def looks_like_name(symbol: str) -> bool:
    """True when the stored symbol is an issuer name, not a ticker.

    Real tickers are short and have no spaces. Names have a space or are
    longer than 6 characters.
    """
    text = symbol.strip()
    return " " in text or len(text) > 6


def _alnum(value: str) -> str:
    return "".join(ch for ch in value.upper() if ch.isalnum())


def _significant_tokens(name: str) -> list[str]:
    raw = "".join(ch if ch.isalnum() else " " for ch in name.upper()).split()
    return [token for token in raw if len(token) >= 2 and token not in _FILLER]


def _is_us_listing(quote: dict) -> bool:
    exchange = str(quote.get("exchange") or "").upper()
    display = str(quote.get("exchDisp") or "").upper()
    if exchange in _US_EXCHANGES or display in {"NYSE", "NASDAQ"}:
        return True
    return "NASDAQ" in display or display.startswith("NYSE")


def _name_matches(name: str, quote: dict) -> bool:
    """Require the issuer's first significant word to appear on the quote."""
    tokens = _significant_tokens(name)
    if not tokens:
        return False
    blob = _alnum(f"{quote.get('longname') or ''} {quote.get('shortname') or ''}")
    if not blob:
        return False
    return tokens[0] in blob


def pick_ticker(name: str, quotes: list[dict]) -> str | None:
    """Pick a US ticker from Yahoo search quotes, or None if it is unclear."""
    matches: list[tuple[str, str]] = []
    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        quote_type = str(quote.get("quoteType") or "").upper()
        if quote_type not in {"EQUITY", "ETF"}:
            continue
        if not _is_us_listing(quote):
            continue
        symbol = str(quote.get("symbol") or "").strip().upper()
        if not _TICKER_RE.fullmatch(symbol):
            continue
        if symbol == name.strip().upper():
            continue
        if not _name_matches(name, quote):
            continue
        matches.append((quote_type, symbol))
    if not matches:
        return None
    for quote_type, symbol in matches:
        if quote_type == "EQUITY":
            return symbol
    return matches[0][1]


def fetch_quotes(name: str) -> list[dict]:
    """Search Yahoo Finance for an issuer name."""
    resp = httpx.get(
        SEARCH_URL,
        params={"q": name, "quotesCount": QUOTES_COUNT},
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
        follow_redirects=True,
    )
    resp.raise_for_status()
    payload = resp.json()
    quotes = payload.get("quotes") if isinstance(payload, dict) else None
    if not isinstance(quotes, list):
        return []
    return [quote for quote in quotes if isinstance(quote, dict)]


def resolve_name(name: str, cache: dict[str, str | None]) -> str | None:
    """Resolve one issuer name, using the in-memory cache."""
    key = name.strip()
    if key in cache:
        return cache[key]
    ticker: str | None = None
    try:
        ticker = pick_ticker(key, fetch_quotes(key))
    except Exception as exc:  # noqa: BLE001 — one failed lookup must not stop the run
        print(f"WARNING {name}: {exc}")
    cache[key] = ticker
    time.sleep(REQUEST_DELAY_S)
    return ticker


def _fetch_paged(db, columns: str, symbol: str | None = None) -> list[dict]:
    """Read holdings in pages. Pass symbol to limit to one stored value."""
    rows: list[dict] = []
    start = 0
    while True:
        query = db.table("holdings").select(columns).order("id")
        if symbol is not None:
            query = query.eq("symbol", symbol)
        batch = query.range(start, start + PAGE_SIZE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def distinct_symbols(db) -> list[str]:
    """Every distinct holdings.symbol, in sorted order."""
    found: set[str] = set()
    for row in _fetch_paged(db, "symbol"):
        symbol = row.get("symbol")
        if isinstance(symbol, str) and symbol.strip():
            found.add(symbol)
    return sorted(found)


def _is_unique_violation(exc: BaseException) -> bool:
    text = str(exc).lower()
    return "23505" in text or "duplicate key" in text or "idx_holdings_unique" in text


def apply_ticker(db, name: str, ticker: str) -> bool:
    """Set symbol to ticker on each row. On unique conflict, drop the old row.

    Returns True only when every row was updated or removed as a duplicate.
    """
    rows = _fetch_paged(db, "id", symbol=name)
    if not rows:
        print(f"WARNING {name}: sin filas para actualizar")
        return False
    ok = True
    for row in rows:
        row_id = row.get("id")
        if not row_id:
            ok = False
            print(f"WARNING {name}: fila sin id")
            continue
        try:
            db.table("holdings").update({"symbol": ticker}).eq("id", row_id).execute()
        except Exception as exc:  # noqa: BLE001 — keep going row by row
            if not _is_unique_violation(exc):
                ok = False
                print(f"WARNING {name} id={row_id}: {exc}")
                continue
            try:
                db.table("holdings").delete().eq("id", row_id).execute()
                print(f"WARNING {name}: fila {row_id} choca con {ticker}, se borra la vieja")
            except Exception as delete_exc:  # noqa: BLE001
                ok = False
                print(f"WARNING {name} id={row_id}: {delete_exc}")
    return ok


def main() -> None:
    from base import get_db

    db = get_db()
    names = [symbol for symbol in distinct_symbols(db) if looks_like_name(symbol)]
    cache: dict[str, str | None] = {}
    resolved = 0
    for name in names:
        ticker = resolve_name(name, cache)
        if not ticker:
            print(f"WARNING {name}: sin match claro, se deja el nombre")
            continue
        if apply_ticker(db, name, ticker):
            resolved += 1
            print(f"OK {name} -> {ticker}")
    print(f"{resolved}/{len(names)} nombres resueltos")


if __name__ == "__main__":
    main()
