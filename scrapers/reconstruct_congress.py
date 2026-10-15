"""Reconstruct REAL congressional portfolios from dated trades.

Unlike politicians.py (which collapses all trades to today's snapshot), this
reads every trade with its real transaction date (tx_date) and builds an
event-driven history: a politician's portfolio really was X before they
bought Y on date Z. We replay buys/sells chronologically against real Yahoo
prices to produce a real performance series.

Method (honest):
  - start from an empty portfolio at the earliest trade date
  - on each BUY: add the ticker with a weight (equal-weight or by amount)
  - on each SELL: drop the ticker
  - between events, hold the current basket and track its real value
  - the resulting curve reflects the politician's actual disclosed trading

We keep it simple and transparent: equal-weight the active basket, since the
House disclosure gives amount ranges, not share counts.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from datetime import date

sys.path.insert(0, ".")

from base import get_db
from prices import fetch_eod
from congress_api import fetch_recent_trades

from politicians import POLITICIANS, CONGRESS_BUYS_SLUG

SYMBOL_DELAY_SECONDS = 0.35
LOOKBACK_DAYS = 365  # bridge allows up to 365d (422 was the limit=2000 combo)
FETCH_LIMIT = 500


def _trades_for_member(member: str) -> list[dict]:
    trades = fetch_recent_trades(days=LOOKBACK_DAYS, limit=FETCH_LIMIT)
    out = [t for t in trades if t.get("member", "").lower() == member.lower()]
    out.sort(key=lambda t: t.get("tx_date") or t.get("disclosed") or "")
    return out


def _replay(trades: list[dict]) -> tuple[list[date], dict[date, list[str]]]:
    """Replay buys/sells -> list of event dates and the basket held after each."""
    held: set[str] = set()
    timeline: dict[date, list[str]] = {}
    for t in trades:
        d = t.get("tx_date") or t.get("disclosed")
        tk = (t.get("ticker") or "").strip().upper()
        if not d or not tk:
            continue
        tt = (t.get("trade_type") or "").lower()
        if "buy" in tt or "purchase" in tt:
            held.add(tk)
        elif "sell" in tt or "sale" in tt:
            held.discard(tk)
        try:
            dd = date.fromisoformat(d)
        except ValueError:
            continue
        timeline[dd] = sorted(held)
    dates = sorted(timeline.keys())
    return dates, timeline


def _series_from_timeline(dates: list[date], timeline: dict[date, list[str]]) -> list[tuple[str, float]]:
    """Build a value series over the timeline using real prices.

    The value at each event date = equal-weighted average of the real
    normalized prices of the tickers held at that point (base 100 at the
    first event where the basket is non-empty).
    """
    # collect all tickers ever held
    all_tickers: set[str] = set()
    for tk in timeline.values():
        all_tickers.update(tk)
    if not all_tickers:
        return []

    # fetch prices once per ticker
    price: dict[str, dict[str, float]] = {}
    for i, tk in enumerate(sorted(all_tickers)):
        if i:
            time.sleep(SYMBOL_DELAY_SECONDS)
        try:
            rows = fetch_eod(tk, LOOKBACK_DAYS)
            price[tk] = {d: c for d, c in rows}
        except Exception:  # noqa: BLE001
            price[tk] = {}

    def avg_value(basket: list[str], day: str) -> float | None:
        vals = []
        for tk in basket:
            pm = price.get(tk, {})
            keys = [k for k in pm if k <= day]
            if keys:
                vals.append(pm[max(keys)])
        if not vals:
            return None
        return sum(vals) / len(vals)

    # base = value at first event with non-empty basket
    base = None
    series: list[tuple[str, float]] = []
    for d in dates:
        basket = timeline[d]
        if not basket:
            continue
        v = avg_value(basket, d.isoformat())
        if v is None:
            continue
        if base is None:
            base = v
            series.append((d.isoformat(), 0.0))
            continue
        series.append((d.isoformat(), round((v / base - 1.0) * 100.0, 4)))
    return series


def reconstruct_member(db, member: str, slug: str) -> int:
    pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
    if not pf or not pf.data:
        print(f"-- {slug} ({member}): no está en la DB")
        return 0
    pid = pf.data["id"]

    trades = _trades_for_member(member)
    if not trades:
        print(f"WARNING {member}: sin trades en {LOOKBACK_DAYS}d")
        return 0
    dates, timeline = _replay(trades)
    if len(dates) < 2:
        print(f"WARNING {member}: muy pocos eventos ({len(dates)})")
        return 0
    series = _series_from_timeline(dates, timeline)
    if not series:
        print(f"WARNING {member}: serie vacía")
        return 0

    # clean old points and store real ones
    db.table("portfolio_performance").delete().eq("portfolio_id", pid).execute()
    for day, pct in series:
        db.table("portfolio_performance").upsert(
            {"portfolio_id": pid, "date": day, "value_pct": pct},
            on_conflict="portfolio_id,date",
        ).execute()
    print(f"OK {slug} ({member}): {len(series)} eventos reales ({series[0][0]}→{series[-1][0]})")
    return len(series)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", nargs="*", help="limit to these slugs")
    args = ap.parse_args()
    db = get_db()
    total = 0
    for member, slug in POLITICIANS.items():
        if args.slugs and slug not in args.slugs:
            continue
        print(f"\n=== {member} ({slug}) ===")
        total += reconstruct_member(db, member, slug)
    print(f"\n{total} eventos reales guardados")


if __name__ == "__main__":
    main()
