# Idempotent DDL — run once in the Supabase SQL editor before this scraper.
# The scraper only upserts; it assumes the table already exists.
#
# create table if not exists public.portfolio_performance (
#   id uuid primary key default uuid_generate_v4(),
#   portfolio_id uuid not null references public.portfolios(id) on delete cascade,
#   date date not null,
#   value_pct numeric(12, 4) not null,
#   created_at timestamptz not null default now(),
#   unique (portfolio_id, date)
# );
#
# create index if not exists idx_portfolio_performance_portfolio_date
#   on public.portfolio_performance (portfolio_id, date);
#
# alter table public.portfolio_performance enable row level security;
#
# drop policy if exists "performance public read" on public.portfolio_performance;
# create policy "performance public read"
#   on public.portfolio_performance for select using (true);

"""Historical portfolio performance from current holdings and Yahoo EOD prices.

Daily value = sum(normalized weight * close). The series is rebased so the
first aligned day is 0%. One second between Yahoo symbol requests.

Usage (from the scrapers directory, with Supabase env vars set):
    python performance.py
"""

from __future__ import annotations

import time
from typing import Any

from prices import fetch_eod

PAGE_SIZE = 1000
SYMBOL_DELAY_SECONDS = 1


def _paged(build_query) -> list[dict[str, Any]]:
    """Read every row from a Supabase query, one page at a time."""
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        result = build_query().range(start, start + PAGE_SIZE - 1).execute()
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def get_portfolio_holdings(db, portfolio_id: str) -> list[tuple[str, float]]:
    """Current (symbol, weight) pairs for a portfolio.

    Holdings can repeat across as_of dates. The latest as_of wins per symbol.
    Only the current `weight` column is used.
    """

    def query():
        return (
            db.table("holdings")
            .select("symbol, weight, as_of")
            .eq("portfolio_id", portfolio_id)
            .order("as_of", desc=True)
            .order("symbol")
        )

    latest: dict[str, float] = {}
    for row in _paged(query):
        symbol = str(row.get("symbol") or "").strip()
        if not symbol or symbol in latest:
            continue
        weight = row.get("weight")
        if weight is None:
            continue
        latest[symbol] = float(weight)
    return [(symbol, latest[symbol]) for symbol in sorted(latest)]


def _align_prices(
    series_by_symbol: dict[str, list[tuple[str, float]]],
) -> list[tuple[str, dict[str, float]]]:
    """Align closes by date and forward-fill gaps.

    A date is kept only when every symbol has a price on that date or a
    last-known price carried forward from an earlier date. Dates before a
    symbol's first print are dropped. No price is invented backward.
    """
    if not series_by_symbol or any(not rows for rows in series_by_symbol.values()):
        return []

    by_symbol: dict[str, dict[str, float]] = {}
    all_dates: set[str] = set()
    for symbol, rows in series_by_symbol.items():
        prices: dict[str, float] = {}
        for day, close in sorted(rows):
            prices[day] = float(close)
        by_symbol[symbol] = prices
        all_dates.update(prices)

    symbols = list(series_by_symbol)
    last: dict[str, float | None] = {symbol: None for symbol in symbols}
    aligned: list[tuple[str, dict[str, float]]] = []

    for day in sorted(all_dates):
        point: dict[str, float] = {}
        complete = True
        for symbol in symbols:
            raw = by_symbol[symbol].get(day)
            if raw is not None:
                last[symbol] = raw
            if last[symbol] is None:
                complete = False
            else:
                point[symbol] = last[symbol]
        if complete:
            aligned.append((day, point))
    return aligned


def build_performance_series(
    db, portfolio_id: str, days: int = 365
) -> list[dict[str, Any]]:
    """Cumulative return points {date, value_pct} for one portfolio.

    A symbol that fails or returns no prices is excluded. Weights are
    renormalized over the symbols that have prices so they sum to 1.
    Returns an empty list when the portfolio has no positive-weight holdings
    or when no holding has prices. Nothing is invented.
    """
    holdings = [(symbol, weight) for symbol, weight in get_portfolio_holdings(db, portfolio_id) if weight > 0]
    raw_weights = {symbol: weight for symbol, weight in holdings}
    if sum(raw_weights.values()) <= 0:
        return []

    series_by_symbol: dict[str, list[tuple[str, float]]] = {}

    for index, symbol in enumerate(raw_weights):
        if index:
            time.sleep(SYMBOL_DELAY_SECONDS)
        try:
            rows = fetch_eod(symbol, days)
        except Exception as exc:  # noqa: BLE001 — one bad symbol is left out of this series
            print(f"WARNING {symbol}: {exc}")
            continue
        if not rows:
            print(f"WARNING {symbol}: no prices")
            continue
        series_by_symbol[symbol] = rows

    if not series_by_symbol:
        return []

    priced_weight = sum(raw_weights[symbol] for symbol in series_by_symbol)
    if priced_weight <= 0:
        return []
    weights = {symbol: raw_weights[symbol] / priced_weight for symbol in series_by_symbol}

    aligned = _align_prices(series_by_symbol)
    if not aligned:
        return []

    values = [
        (day, sum(weights[symbol] * prices[symbol] for symbol in weights))
        for day, prices in aligned
    ]
    base = values[0][1]
    if base == 0:
        return []

    return [
        {"date": day, "value_pct": round((value / base - 1.0) * 100.0, 4)}
        for day, value in values
    ]


def _is_missing_table(exc: Exception) -> bool:
    text = str(exc).lower()
    if "42p01" in text or "pgrst205" in text:
        return True
    mentions_table = "portfolio_performance" in text
    missing = "does not exist" in text or "schema cache" in text or "could not find" in text
    return mentions_table and missing


def save_snapshots(db, portfolio_id: str, series: list[dict[str, Any]]) -> bool:
    """Upsert {date, value_pct} into portfolio_performance.

    Returns False when the table is missing so the caller can keep going.
    portfolio_snapshots is not used: it stores symbol weights, not returns.
    """
    if not series:
        return True

    payload = [
        {
            "portfolio_id": portfolio_id,
            "date": point["date"],
            "value_pct": point["value_pct"],
        }
        for point in series
    ]
    try:
        db.table("portfolio_performance").upsert(
            payload, on_conflict="portfolio_id,date"
        ).execute()
    except Exception as exc:  # noqa: BLE001 — missing table must not abort the run
        if _is_missing_table(exc):
            print(
                "WARNING: table portfolio_performance does not exist. "
                "Run the SQL at the top of scrapers/performance.py, then re-run. "
                f"Skipping save ({exc})."
            )
            return False
        raise
    return True


def _active_portfolios(db) -> list[dict[str, Any]]:
    def query():
        return (
            db.table("portfolios")
            .select("id, slug")
            .eq("is_active", True)
            .order("slug")
        )

    return _paged(query)


def main() -> None:
    from base import get_db

    db = get_db()
    portfolios = _active_portfolios(db)
    ok = 0
    for portfolio in portfolios:
        portfolio_id = portfolio["id"]
        slug = portfolio.get("slug") or portfolio_id
        try:
            series = build_performance_series(db, portfolio_id)
            saved = save_snapshots(db, portfolio_id, series)
            if not saved:
                print(f"WARNING {slug}: series built ({len(series)} points) but not saved")
                continue
            print(f"OK {slug}: {len(series)} points")
            ok += 1
        except Exception as exc:  # noqa: BLE001 — one portfolio must not stop the rest
            print(f"WARNING {slug}: {exc}")
    print(f"{ok}/{len(portfolios)} portfolios")


if __name__ == "__main__":
    main()
