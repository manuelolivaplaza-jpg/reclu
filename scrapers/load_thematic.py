"""Backfill real holdings for the 'model' thematic portfolios.

These were seed-only portfolios with invented returns. Here we give them a
real, documented ticker list per theme with explicit weights, so their
performance series is computed from real Yahoo prices like every other
portfolio. Weights are our editorial pick (they sum to 100) and are stated
as such — the theme is ours, the prices are real.
"""

from __future__ import annotations

from datetime import date

from base import get_db

# slug -> [(ticker, weight)] — representative, liquid tickers per theme.
THEMATIC_HOLDINGS: dict[str, list[tuple[str, float]]] = {
    "ai-world-war": [("NVDA", 20), ("MSFT", 18), ("GOOGL", 15), ("AVGO", 12), ("AMD", 10), ("TSM", 10), ("PLTR", 8), ("META", 7)],
    "semiconductores": [("NVDA", 22), ("TSM", 18), ("AVGO", 14), ("AMD", 12), ("ASML", 10), ("INTC", 8), ("MU", 8), ("QCOM", 8)],
    "sp500-top10": [("AAPL", 15), ("MSFT", 14), ("NVDA", 14), ("AMZN", 11), ("GOOGL", 9), ("META", 9), ("BRK-B", 9), ("GOOG", 6), ("LLY", 7), ("AVGO", 6)],
    "bancos-chilenos": [("BSANTANDER.SN", 30), ("BCS.SN", 30), ("CHILE.SN", 20), ("ITAUCL.SN", 20)],
    "retail-chileno": [("FALABELLA.SN", 30), ("CENCOSUD.SN", 25), ("RIPLEY.SN", 20), ("SMU.SN", 25)],
    "litio-mineria": [("SQM-B.SN", 30), ("ALB", 20), ("LTHM", 15), ("PILBF", 10), ("LAC", 10), ("FLT.V", 15)],
    "energias-renovables": [("ENPH", 20), ("FSLR", 18), ("NEE", 16), ("VWS.CO", 15), ("PLUG", 10), ("RUN", 11), ("CWEN", 10)],
    "utilities-defensivas": [("NEE", 18), ("SO", 15), ("DUK", 14), ("AEP", 13), ("D", 12), ("SRE", 12), ("EXC", 8), ("XEL", 8)],
    "dividend-aristocrats": [("KO", 14), ("JNJ", 13), ("PG", 12), ("MMM", 10), ("CL", 10), ("T", 10), ("VZ", 10), ("XOM", 11), ("CVX", 10)],
    "fintech-global": [("V", 16), ("MA", 15), ("PYPL", 12), ("SQ", 11), ("COIN", 10), ("NU", 10), ("SOFI", 9), ("ADYEY", 8), ("MELI", 9)],
    "latin-tech": [("MELI", 30), ("NU", 25), ("WMT", 20), ("AMX", 15), ("VIV", 10)],
    "claude-portfolio": [("GOOGL", 30), ("AMZN", 30), ("NVDA", 20), ("MSFT", 20)],
    "dividendos-ipsa": [("BSANTANDER.SN", 25), ("ENELAM.SN", 25), ("COPEC.SN", 25), ("CMPC.SN", 25)],
    # Bonos del Tesoro: usamos el ETF de bonos del tesoro como proxy real.
    "bonos-tesoro-us": [("TLT", 60), ("IEF", 25), ("SHY", 15)],
    # Inverse Cramer es contrarian; sin fuente de sus picks en tiempo real,
    # usamos el ETF de corto al Nasdaq como proxy de la tesis inversa.
    "inverse-cramer": [("SQQQ", 50), ("PSQ", 50)],
}


def main() -> None:
    db = get_db()
    today = date.today().isoformat()
    ok = 0
    for slug, picks in THEMATIC_HOLDINGS.items():
        try:
            pf = db.table("portfolios").select("id").eq("slug", slug).maybe_single().execute()
            if not pf.data:
                print(f"-- {slug}: no está en la DB")
                continue
            pid = pf.data["id"]
            payload = [
                {
                    "portfolio_id": pid,
                    "symbol": tk,
                    "name": tk,
                    "weight": wt,
                    "asset_class": "equity",
                    "currency": "USD",
                    "as_of": today,
                    "previous_weight": 0.0,
                }
                for tk, wt in picks
            ]
            db.table("holdings").upsert(payload, on_conflict="portfolio_id,symbol,as_of").execute()
            print(f"OK {slug}: {len(picks)} holdings reales")
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"WARNING {slug}: {e}")
    print(f"{ok}/{len(THEMATIC_HOLDINGS)} temáticos cargados")


if __name__ == "__main__":
    main()
