"""Compute real returns for holdings from the prices table.

For every holding, look up the latest known close for its symbol and
compute return_pct = (price_current - price_at_disclosure) /
price_at_disclosure * 100 (only when a real disclosure price exists).
Holdings without a known price are skipped with a warning — never invent
a number.

Run after scrapers/prices.py has refreshed the prices table.
"""

from __future__ import annotations

from base import get_db


def latest_price(db, symbol: str) -> float | None:
    """Latest close for a symbol from the prices table, or None."""
    result = (
        db.table("prices")
        .select("close")
        .eq("symbol", symbol)
        .order("date", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    return result.data["close"] if result.data else None


def compute_returns(db) -> dict[str, int]:
    """Fill price_current and return_pct on every holding."""
    holdings = (
        db.table("holdings")
        .select("id, symbol, price_at_disclosure")
        .execute()
    )
    rows = holdings.data or []

    updated = 0
    for h in rows:
        price = latest_price(db, h["symbol"])
        if price is None:
            print(f"WARNING {h['symbol']}: no price in prices table, skipping")
            continue

        update: dict[str, float] = {"price_current": price}
        disclosure = h.get("price_at_disclosure")
        if disclosure and disclosure > 0:
            update["return_pct"] = round((price - disclosure) / disclosure * 100, 2)

        db.table("holdings").update(update).eq("id", h["id"]).execute()
        updated += 1

    print(f"{updated}/{len(rows)} updated")
    return {"updated": updated, "total": len(rows)}


def main() -> None:
    compute_returns(get_db())


if __name__ == "__main__":
    main()
