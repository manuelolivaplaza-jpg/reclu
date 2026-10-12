"""
Run all scrapers in sequence.

Usage:
    python run_all.py                    # run all adapters
    python run_all.py --only capitol     # run specific ones

Env vars required:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import sys

from base import get_db, log


def main() -> None:
    parser = argparse.ArgumentParser(description="Run reclu.cl scrapers")
    parser.add_argument(
        "--only",
        nargs="*",
        choices=["capitol_trades", "house_disclosure", "renta4", "infoprobidad"],
        help="Run only these scrapers (default: all)",
    )
    args = parser.parse_args()

    db = get_db()
    results = []

    scrapers = args.only or ["house_disclosure", "capitol_trades", "renta4", "infoprobidad"]

    if "capitol_trades" in scrapers:
        try:
            from capitol_trades import CapitolTradesAdapter

            for politician in ["pelosi", "trump"]:
                log(f"Starting Capitol Trades ({politician})...")
                adapter = CapitolTradesAdapter(politician=politician)
                results.append(adapter.run(db))
        except Exception as e:
            log(f"capitol_trades failed: {e}")
            results.append({"source": "capitol_trades", "status": "error", "error": str(e)})

    if "house_disclosure" in scrapers:
        try:
            from house_disclosure import HouseDisclosureAdapter

            for politician in ["pelosi", "trump"]:
                log(f"Starting House Disclosure ({politician})...")
                adapter = HouseDisclosureAdapter(politician=politician)
                results.append(adapter.run(db))
        except Exception as e:
            log(f"house_disclosure failed: {e}")
            results.append({"source": "house_disclosure", "status": "error", "error": str(e)})

    if "renta4" in scrapers:
        try:
            from renta4 import Renta4Adapter

            for portfolio in ["moderada", "moderada-ampliada"]:
                log(f"Starting Renta 4 ({portfolio})...")
                adapter = Renta4Adapter(portfolio=portfolio)
                results.append(adapter.run(db))
        except Exception as e:
            log(f"renta4 failed: {e}")
            results.append({"source": "renta4", "status": "error", "error": str(e)})

    if "infoprobidad" in scrapers:
        try:
            from infoprobidad import InfoProbidadAdapter

            log("Starting InfoProbidad...")
            adapter = InfoProbidadAdapter()
            results.append(adapter.run(db))
        except Exception as e:
            log(f"infoprobidad failed: {e}")
            results.append({"source": "infoprobidad", "status": "error", "error": str(e)})

    # Summary
    print("\n" + "=" * 50)
    print("SCRAPER RUN SUMMARY")
    print("=" * 50)
    for r in results:
        status_icon = "✓" if r.get("status") == "ok" else "✗"
        print(f"{status_icon} {r.get('source', '?'):20s} {r}")
    print("=" * 50)

    errors = [r for r in results if r.get("status") == "error"]
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
