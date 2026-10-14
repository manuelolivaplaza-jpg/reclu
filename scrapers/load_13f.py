"""One-off: backfill holdings for the seeded 13F portfolios from live SEC data.

Run from the scrapers dir with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set:
    python load_13f.py
"""

from __future__ import annotations

import sys

sys.path.insert(0, ".")

from base import get_db
from sec13f import FUNDS, fetch_holdings

# fund name in FUNDS -> slug already seeded in the portfolios table
FUND_SLUG = {
    "Berkshire Hathaway": "berkshire-hathaway-13f",
    "Scion Asset Management": "scion-13f",
    "Pershing Square": "pershing-square-13f",
    "Appaloosa": "appaloosa-13f",
    "Tiger Global": "tiger-global-13f",
    "Coatue": "coatue-13f",
    "Duquesne": "duquesne-13f",
    "Third Point": "third-point-13f",
    "Baupost": "baupost-13f",
    "Viking Global": "viking-global-13f",
    "TCI Fund Management": "tci-13f",
    "Public Investment Fund": "pif-13f",
    "Cevian Capital": "cevian-13f",
    "Egerton Capital": "egerton-13f",
    "SoftBank Group": "softbank-13f",
    "SB Investment Advisers": "sb-advisers-13f",
    "Mubadala": "mubadala-13f",
    "Lansdowne Partners": "lansdowne-13f",
    "Renaissance Technologies": "renaissance-13f",
    "Bridgewater Associates": "bridgewater-13f",
    "Soros Fund Management": "soros-13f",
}


def main() -> None:
    db = get_db()
    ok = 0
    for name, cik in FUNDS.items():
        slug = FUND_SLUG.get(name)
        if not slug:
            print(f"-- {name}: sin slug mapeado, se salta")
            continue
        try:
            holdings = fetch_holdings(cik, name)
            if not holdings:
                print(f"-- {name}: sin holdings")
                continue
            pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
            if not pf.data:
                print(f"-- {name}: slug {slug} no está en la DB (corre el seed)")
                continue
            pid = pf.data["id"]
            payload = [
                {
                    "portfolio_id": pid,
                    # 13F rows have no ticker; issuer name stands in as the symbol key.
                    "symbol": h["issuer"][:40],
                    "name": h["issuer"],
                    "weight": h["weight"],
                    "asset_class": "equity",
                    "currency": "USD",
                    "as_of": h["as_of"],
                    "previous_weight": 0.0,
                }
                for h in holdings
            ]
            db.table("holdings").upsert(payload, on_conflict="portfolio_id,symbol,as_of").execute()
            print(f"OK {name}: {len(holdings)} holdings -> {slug}")
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"WARNING {name}: {e}")
    print(f"{ok}/{len(FUNDS)} fondos cargados")


if __name__ == "__main__":
    main()
