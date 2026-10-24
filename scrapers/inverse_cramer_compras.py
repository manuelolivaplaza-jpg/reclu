"""
Inverse Cramer solo compras (D33): portafolio inverse-cramer-compras.

Misma fuente y mismos picks verificados que inverse-cramer-real
(data/cramer_picks.json, lightning round de CNBC), pero solo el lado largo:
se compra lo que Cramer dice vender. Sin cortos, igual peso, 30 días hábiles.
No escribe menciones ni alertas (esas ya las escribe inverse_cramer.py).

  python inverse_cramer_compras.py --dry-run
"""

from __future__ import annotations

import argparse
from datetime import date

from base import Holding, get_db, log
from inverse_cramer import InverseCramerAdapter, build_positions, load_picks

SLUG = "inverse-cramer-compras"


def build_buy_only_positions(picks: list[dict], as_of: date) -> list[dict]:
    compras = [p for p in picks if p.get("side") == "compra"]
    return build_positions(compras, as_of)


class InverseCramerComprasAdapter(InverseCramerAdapter):
    name = "inverse_cramer_compras"
    portfolio_slug = SLUG

    def fetch_raw(self) -> dict:
        # Sin RSS: los candidatos nuevos ya los reporta inverse_cramer.py.
        return {"picks": load_picks(self.data_path), "rss_urls": [], "nuevos": []}

    def normalize(self, raw: dict) -> list[Holding]:
        today = date.today()
        return [
            Holding(symbol=r["symbol"], name=r["name"], weight=r["weight"],
                    asset_class=r["asset_class"], currency="USD", as_of=today)
            for r in build_buy_only_positions(raw["picks"], today)
        ]


def main() -> None:
    p = argparse.ArgumentParser(description="Inverse Cramer solo compras")
    p.add_argument("--dry-run", action="store_true", help="Sin escribir en Supabase")
    a = p.parse_args()
    if a.dry_run:
        rows = build_buy_only_positions(load_picks(), date.today())
        print(f"Inverse Cramer compras: {len(rows)} posiciones abiertas (dry-run, nada escrito)")
        for r in rows:
            print(f"  {r['symbol']:<8} {r['weight']:6.2f}%")
        return
    log(f"[{SLUG}] {InverseCramerComprasAdapter(dry_run=False).run(get_db())}")


if __name__ == "__main__":
    main()
