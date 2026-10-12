"""Politician portfolios from the CongressInvests bridge.

Only politicians with ACTUAL trades in the recent window are worth a
portfolio — an empty feed is not a portfolio. This scraper:

1. Pulls the recent trades (60d window, bridge limit).
2. Filters by the POLITICIANS list (name as returned by the bridge).
3. Per politician, upserts their tickers as holdings of their portfolio.
4. Also computes "Congress Buys": the tickers bought by the most distinct
   members in the window (the consensus portfolio, like Quiver's on
   Autopilot).

Run after the seed so the portfolios exist.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date

from congress_api import fetch_recent_trades

# Name as the bridge returns it -> slug (must exist in portfolios table).
# Verified 2026-10-12: all names below appear in the 60d window.
POLITICIANS: dict[str, str] = {
    "Nancy Pelosi": "pelosi-tracker",
    "Josh Gottheimer": "gottheimer-tracker",
    "Gilbert Cisneros": "cisneros-tracker",
    "Kevin Hern": "hern-tracker",
    "April McClain Delaney": "mcclain-delaney-tracker",
    "Jared Moskowitz": "moskowitz-tracker",
    "Cleo Fields": "fields-tracker",
}

CONGRESS_BUYS_SLUG = "congress-buys"
MIN_MEMBERS_FOR_BUYS = 2


def upsert_holdings(db, slug: str, rows: list[dict]) -> int:
    """Upsert holdings for a portfolio slug. Returns count written."""
    pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
    if not pf.data:
        print(f"WARNING {slug}: portfolio not in DB (run seed first)")
        return 0
    portfolio_id = pf.data["id"]
    payload = [
        {
            "portfolio_id": portfolio_id,
            "symbol": r["symbol"],
            "name": r["name"],
            "weight": r["weight"],
            "asset_class": "equity",
            "currency": "USD",
            "as_of": r["as_of"],
            "previous_weight": 0.0,
        }
        for r in rows
    ]
    db.table("holdings").upsert(payload, on_conflict="portfolio_id,symbol,as_of").execute()
    return len(payload)


def build_politician_rows(trades: list[dict]) -> dict[str, list[dict]]:
    """Trades -> per-politician holdings (equal weight per ticker touched)."""
    by_member: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        if not t["ticker"]:
            continue
        by_member[t["member"]].append(t)

    result: dict[str, list[dict]] = {}
    for member, mtrades in by_member.items():
        if member not in POLITICIANS:
            continue
        tickers = sorted({t["ticker"] for t in mtrades})
        if not tickers:
            continue
        weight = round(100.0 / len(tickers), 2)
        result[member] = [
            {
                "symbol": tk,
                "name": tk,
                "weight": weight,
                "as_of": date.today().isoformat(),
            }
            for tk in tickers
        ]
    return result


def build_congress_buys(trades: list[dict]) -> list[dict]:
    """Consensus: tickers bought by >= MIN_MEMBERS distinct members."""
    buyers: dict[str, set[str]] = defaultdict(set)
    for t in trades:
        if t["ticker"] and t["trade_type"] == "buy":
            buyers[t["ticker"]].add(t["member"])
    hot = [(tk, len(m)) for tk, m in buyers.items() if len(m) >= MIN_MEMBERS_FOR_BUYS]
    hot.sort(key=lambda x: x[1], reverse=True)
    if not hot:
        return []
    total = sum(c for _, c in hot)
    return [
        {"symbol": tk, "name": tk, "weight": round(c / total * 100, 2), "as_of": date.today().isoformat()}
        for tk, c in hot
    ]


def main() -> None:
    from base import get_db

    trades = fetch_recent_trades(days=60, limit=500)
    if not trades:
        print("no trades from bridge — nothing to do")
        return
    print(f"trades: {len(trades)}")

    db = get_db()
    written = 0

    for member, rows in build_politician_rows(trades).items():
        slug = POLITICIANS[member]
        n = upsert_holdings(db, slug, rows)
        print(f"OK {member} ({slug}): {n} tickers")
        written += n

    buys = build_congress_buys(trades)
    if buys:
        n = upsert_holdings(db, CONGRESS_BUYS_SLUG, buys)
        print(f"OK Congress Buys: {n} tickers (top: {buys[0]['symbol']} {buys[0]['weight']}%)")
        written += n

    print(f"total holdings written: {written}")


if __name__ == "__main__":
    main()
