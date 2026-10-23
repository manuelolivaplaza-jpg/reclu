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

import sys

import time
from typing import Any

from prices import fetch_eod

PAGE_SIZE = 1000
SYMBOL_DELAY_SECONDS = 1
MAX_HOLDINGS = 40


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
    Only the top MAX_HOLDINGS by weight are used; those weights are
    renormalized to sum to 1 before fetching prices.
    """
    holdings = [(symbol, weight) for symbol, weight in get_portfolio_holdings(db, portfolio_id) if weight > 0]
    # Nombres de emisor sin resolver (13F) no son tickers: Yahoo da 404.
    # Se omiten y se registran; los pesos se renormalizan sobre el resto.
    skipped = [symbol for symbol, _ in holdings if " " in symbol.strip()]
    if skipped:
        print(f"[performance] {portfolio_id}: {len(skipped)} holdings sin ticker omitidos: " + "; ".join(skipped[:20]))
        holdings = [(symbol, weight) for symbol, weight in holdings if symbol not in skipped]
    holdings.sort(key=lambda item: item[1], reverse=True)
    holdings = holdings[:MAX_HOLDINGS]
    total_weight = sum(weight for _, weight in holdings)
    if total_weight <= 0:
        return []
    raw_weights = {symbol: weight / total_weight for symbol, weight in holdings}

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


def stitch_estimated(
    est: list[dict[str, Any]],
    real: list[dict[str, Any]],
    existing: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Puntos estimados que se pueden escribir sin pisar historia real.

    - Con historia real: solo fechas anteriores al primer punto real, y la
      proyección se reescala para empalmar en ese punto (misma base).
    - Sin historia real: toda la proyección; si ya hay filas estimadas más
      antiguas, se reescala para empalmar con la fila existente en su primera
      fecha (evita un salto al rebasar a 0% en cada corrida).
    """
    if not est:
        return []
    est = sorted(est, key=lambda p: p["date"])

    def level(p: dict[str, Any]) -> float:
        return 1 + float(p["value_pct"]) / 100

    def scaled(points: list[dict[str, Any]], factor: float) -> list[dict[str, Any]]:
        return [
            {"date": p["date"], "value_pct": round((level(p) * factor - 1) * 100, 4)}
            for p in points
        ]

    real = sorted(real or [], key=lambda p: p["date"])
    if real:
        first = real[0]
        before = [p for p in est if p["date"] < first["date"]]
        if not before:
            return []
        upto = [p for p in est if p["date"] <= first["date"]]
        join = upto[-1]
        if level(join) <= 0:
            return []
        return scaled(before, level(first) / level(join))

    prior = sorted(
        (p for p in (existing or []) if p["date"] <= est[0]["date"]),
        key=lambda p: p["date"],
    )
    if prior and level(est[0]) > 0:
        return scaled(est, level(prior[-1]) / level(est[0]))
    return est


def _existing_rows(db, portfolio_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]] | None:
    """(reales, estimadas) actuales; None si la columna is_estimated no existe."""
    try:
        res = (
            db.table("portfolio_performance")
            .select("date,value_pct,is_estimated")
            .eq("portfolio_id", portfolio_id)
            .order("date")
            .limit(5000)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING is_estimated no disponible (aplica la 057): {exc}")
        return None
    rows = getattr(res, "data", None) or []
    real = [r for r in rows if r.get("is_estimated") is False]
    est = [r for r in rows if r.get("is_estimated") is not False]
    return real, est


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
            **({"is_estimated": True} if point.get("is_estimated") else {}),
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


DEFAULT_LOOKBACK_DAYS = 365

# ETFs: su serie real es el precio del propio fondo (etf_series.py).
try:
    from etf_series import ETF_TICKERS as _ETF_TICKERS

    ETF_REAL_SLUGS = frozenset(_ETF_TICKERS)
except Exception:  # noqa: BLE001
    ETF_REAL_SLUGS = frozenset()


def lookback_days(days: int | None = None, since: str | None = None, today=None) -> int:
    """Días de historia a reconstruir. --since (YYYY-MM-DD) manda sobre --days.

    Sin argumentos devuelve el default de siempre (365).
    """
    from datetime import date as _date

    if since:
        start = _date.fromisoformat(since)
        ref = today or _date.today()
        delta = (ref - start).days
        if delta <= 0:
            raise ValueError(f"--since {since} no es anterior a hoy")
        return delta
    if days is not None:
        if days <= 0:
            raise ValueError("--days debe ser > 0")
        return days
    return DEFAULT_LOOKBACK_DAYS


def main(argv: list[str] | None = None) -> None:
    """argv=None (llamado desde run_all) usa los defaults, sin leer sys.argv."""
    import argparse

    from base import get_db

    parser = argparse.ArgumentParser(description="Series de rendimiento históricas")
    parser.add_argument("--days", type=int, default=None, help="días de historia (default 365)")
    parser.add_argument("--since", default=None, help="fecha inicial YYYY-MM-DD (manda sobre --days)")
    parser.add_argument("--slugs", nargs="*", default=None, help="limitar a estos slugs")
    args = parser.parse_args(argv or [])
    days = lookback_days(args.days, args.since)
    print(f"[performance] lookback {days} días")

    db = get_db()
    portfolios = _active_portfolios(db)
    if args.slugs:
        wanted = set(args.slugs)
        portfolios = [p for p in portfolios if p.get("slug") in wanted]
    ok = 0
    for portfolio in portfolios:
        portfolio_id = portfolio["id"]
        slug = portfolio.get("slug") or portfolio_id
        try:
            if slug in ETF_REAL_SLUGS:
                print(f"-- {slug}: ETF con serie real (etf_series.py), no se proyecta")
                continue
            series = build_performance_series(db, portfolio_id, days)
            existing = _existing_rows(db, portfolio_id)
            if existing is not None:
                real_rows, est_rows = existing
                series = [
                    {**p, "is_estimated": True}
                    for p in stitch_estimated(series, real_rows, est_rows)
                ]
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
    main(sys.argv[1:])
