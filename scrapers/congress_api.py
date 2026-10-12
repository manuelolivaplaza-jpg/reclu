"""Congress trading feed via CongressInvests API (public bridge).

Wraps the CongressInvests REST API which merges Senate + House PTRs
into one feed. Trades carry member, chamber, ticker, amount range and
disclosure dates. Tolerates network failures (returns empty list).
"""

from __future__ import annotations

import httpx

API_URL = "https://congressinfor-production.up.railway.app"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) reclu-scraper/1.0"


def fetch_recent_trades(days: int = 60, limit: int = 500) -> list[dict]:
    """Recent congressional trades, normalized. Empty list on failure."""
    try:
        resp = httpx.get(
            f"{API_URL}/trades/recent",
            params={"limit": limit, "days": days},
            headers={"User-Agent": USER_AGENT},
            timeout=30.0,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:  # noqa: BLE001 - bridge may be down; fail soft
        print(f"WARNING congress_api: {e}")
        return []

    trades: list[dict] = []
    for t in data.get("trades", []):
        trades.append(
            {
                "member": t.get("member", ""),
                "chamber": t.get("chamber", ""),
                "ticker": t.get("ticker", ""),
                "trade_type": t.get("trade_type", ""),
                "amount": t.get("amount", ""),
                "tx_date": t.get("tx_date", ""),
                "disclosed": t.get("disclosed", ""),
                "link": t.get("link", ""),
            }
        )
    return trades


def top_tickers(trades: list[dict], min_members: int = 1) -> list[tuple[str, int]]:
    """Group trades by ticker, counting distinct members. Desc by count."""
    by_ticker: dict[str, set[str]] = {}
    for t in trades:
        ticker = t["ticker"]
        if not ticker:
            continue
        by_ticker.setdefault(ticker, set()).add(t["member"])
    ranked = [(t, len(m)) for t, m in by_ticker.items() if len(m) >= min_members]
    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked


def main() -> None:
    trades = fetch_recent_trades()
    print(f"trades fetched: {len(trades)}")
    for ticker, count in top_tickers(trades)[:10]:
        print(f"{ticker}: {count} members")


if __name__ == "__main__":
    main()
