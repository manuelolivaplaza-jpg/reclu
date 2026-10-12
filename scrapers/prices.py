"""End-of-day price feed for reclu.cl.

Downloads daily closing prices from Yahoo Finance (free, no API key) and
upserts them into the `prices` table so portfolio returns and charts are
based on real market data instead of hardcoded numbers.

Usage:
    PRICE_SYMBOLS="NVDA,AAPL,^GSPC" python prices.py

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see base.get_db).
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import httpx

YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# Default basket: mega-cap tech + S&P 500 index. Override with PRICE_SYMBOLS.
DEFAULT_SYMBOLS = [
    "NVDA",
    "AAPL",
    "MSFT",
    "GOOGL",
    "AMZN",
    "META",
    "TSLA",
    "AVGO",
    "^GSPC",
]


def fetch_eod(symbol: str, days: int = 365) -> list[tuple[str, float]]:
    """Fetch end-of-day closes for a symbol from Yahoo Finance.

    Returns a list of (iso_date, close) tuples, skipping null closes.
    """
    resp = httpx.get(
        YAHOO_URL.format(symbol=symbol),
        params={"range": f"{days}d", "interval": "1d"},
        headers={"User-Agent": USER_AGENT},
        timeout=30.0,
        follow_redirects=True,
    )
    resp.raise_for_status()
    result = resp.json()["chart"]["result"][0]
    timestamps = result["timestamp"]
    closes = result["indicators"]["quote"][0]["close"]

    rows: list[tuple[str, float]] = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        date = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        rows.append((date, close))
    return rows


def upsert_prices(db, symbol: str, rows: list[tuple[str, float]]) -> None:
    """Upsert (symbol, date, close) rows into the prices table."""
    if not rows:
        return
    payload = [{"symbol": symbol, "date": date, "close": close} for date, close in rows]
    db.table("prices").upsert(payload, on_conflict="symbol,date").execute()


def refresh_all(db, symbols: list[str]) -> dict[str, int]:
    """Refresh prices for all symbols, tolerating per-symbol failures."""
    ok = 0
    for symbol in symbols:
        try:
            rows = fetch_eod(symbol)
            upsert_prices(db, symbol, rows)
            print(f"OK {symbol}: {len(rows)} rows")
            ok += 1
        except Exception as e:  # noqa: BLE001 - keep going on any single-symbol error
            print(f"WARNING {symbol}: {e}")
        time.sleep(1)
    print(f"{ok}/{len(symbols)} OK")
    return {"ok": ok, "total": len(symbols)}


def main() -> None:
    from base import get_db

    env = os.environ.get("PRICE_SYMBOLS", "")
    symbols = env.split(",") if env else DEFAULT_SYMBOLS
    refresh_all(get_db(), symbols)


if __name__ == "__main__":
    main()
