"""Benchmark index series for reclu.cl (S&P 500, IPSA).

Downloads historical closes for benchmark indices from Yahoo Finance (same
free endpoint as prices.py) and upserts them into the `benchmark_prices`
table created by supabase/migrations/011_rendimiento.sql.

Symbols (Yahoo):
  - ^GSPC  : S&P 500 index (US)
  - ^IPSA  : IPSA (Santiago Stock Exchange selective index)
  - SPY    : S&P 500 ETF (fallback for sources that reject ^GSPC)

Usage:
    python benchmarks.py                # default symbols, 2 years
    python benchmarks.py --dry-run      # no DB writes, prints sample rows
    python benchmarks.py --symbols ^GSPC,^IPSA --days 730

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see base.get_db),
except with --dry-run which never touches the database.
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import datetime, timezone

import httpx

YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# Default benchmarks. ^GSPC works on Yahoo's chart endpoint; ^IPSA is the
# selective index of the Santiago exchange. SPY is kept as an alternate.
DEFAULT_BENCHMARKS = ["^GSPC", "^IPSA"]
ALTERNATES = {"^GSPC": ["SPY"], "^IPSA": ["IPSA.SN", "SPIPSA.SN"]}
DEFAULT_DAYS = 730


def fetch_eod(symbol: str, days: int = DEFAULT_DAYS) -> list[tuple[str, float]]:
    """Fetch end-of-day closes for a benchmark symbol from Yahoo Finance.

    Returns a list of (iso_date, close) tuples, skipping null closes.
    Same contract as prices.fetch_eod so the two feeds stay interchangeable.
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
        rows.append((date, float(close)))
    return rows


def fetch_benchmark(symbol: str, days: int = DEFAULT_DAYS) -> list[tuple[str, float]]:
    """Fetch a benchmark series, falling back to alternate symbols.

    Tries the primary symbol first; on failure retries the known alternates
    so a single delisted ticker never breaks the benchmark feed.
    """
    candidates = [symbol] + ALTERNATES.get(symbol, [])
    last_error: Exception | None = None
    for candidate in candidates:
        try:
            rows = fetch_eod(candidate, days)
            if rows:
                return rows
        except Exception as exc:  # noqa: BLE001 — try the next alternate
            last_error = exc
    if last_error:
        raise last_error
    return []


def upsert_benchmarks(db, symbol: str, rows: list[tuple[str, float]]) -> None:
    """Upsert (symbol, date, close) rows into benchmark_prices."""
    if not rows:
        return
    payload = [{"symbol": symbol, "date": date, "close": close} for date, close in rows]
    db.table("benchmark_prices").upsert(payload, on_conflict="symbol,date").execute()


def refresh_all(db, symbols: list[str], days: int = DEFAULT_DAYS, dry_run: bool = False) -> dict[str, int]:
    """Refresh benchmark series, tolerating per-symbol failures."""
    ok = 0
    for symbol in symbols:
        try:
            rows = fetch_benchmark(symbol, days)
            if dry_run:
                if rows:
                    first_date, first_close = rows[0]
                    last_date, last_close = rows[-1]
                    print(
                        f"DRY-RUN {symbol}: {len(rows)} rows "
                        f"(first {first_date} @ {first_close}, last {last_date} @ {last_close})"
                    )
                else:
                    print(f"DRY-RUN {symbol}: 0 rows")
            else:
                upsert_benchmarks(db, symbol, rows)
                print(f"OK {symbol}: {len(rows)} rows")
            ok += 1
        except Exception as e:  # noqa: BLE001 — keep going on any single-symbol error
            print(f"WARNING {symbol}: {e}")
        time.sleep(1)
    print(f"{ok}/{len(symbols)} OK")
    return {"ok": ok, "total": len(symbols)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download benchmark index series")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes")
    parser.add_argument(
        "--symbols",
        default=",".join(DEFAULT_BENCHMARKS),
        help="Comma-separated benchmark symbols (default: ^GSPC,^IPSA)",
    )
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help="Days of history")
    args = parser.parse_args()

    symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    if not symbols:
        symbols = DEFAULT_BENCHMARKS

    if args.dry_run:
        refresh_all(None, symbols, days=args.days, dry_run=True)
    else:
        from base import get_db

        refresh_all(get_db(), symbols, days=args.days)


if __name__ == "__main__":
    main()
