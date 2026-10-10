"""
Renta 4 (Chile) scraper — recommended portfolios from the broker's public reports.

Source: https://www.renta4.cl public reports / rankings.
Feeds portfolios: renta4-moderada, renta4-moderada-ampliada.

NOTE: Renta 4 publishes portfolio recommendations in PDF reports and web pages.
The structure varies; this adapter targets the public "carteras recomendadas"
pages. If the layout changes, update _parse_table.
"""

from __future__ import annotations

import re
from datetime import date

from base import Holding, SourceAdapter, log


class Renta4Adapter(SourceAdapter):
    name = "renta4"
    portfolio_slug = "renta4-moderada"

    PORTFOLIOS = {
        "moderada": "renta4-moderada",
        "moderada-ampliada": "renta4-moderada-ampliada",
    }

    BASE_URL = "https://www.renta4.cl"

    def __init__(self, portfolio: str = "moderada") -> None:
        super().__init__()
        self.portfolio = portfolio
        self.portfolio_slug = self.PORTFOLIOS.get(portfolio, "renta4-moderada")

    def fetch_raw(self) -> str:
        """
        Fetch the recommended portfolio page.
        The exact URL depends on Renta 4's current site structure.
        """
        # Public research/reports landing — update when site changes
        url = f"{self.BASE_URL}/centro-de-ayuda/centro-de-formacion"
        try:
            resp = self.client.get(url)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            log(f"[{self.name}] fetch error: {e}")
            return ""

    def normalize(self, raw: str) -> list[Holding]:
        """
        Parse portfolio recommendations from HTML.

        Looks for tables/rows with CL ticker patterns (BCS symbols like
        'CHILE.SN', 'SQM-B.SN', 'LAN.SN') and weight percentages.
        """
        holdings: list[Holding] = []

        if not raw:
            return holdings

        # Pattern: ticker (IPS A local exchange codes) + percentage
        # Example: "COPEC.SN ... 8,5%"
        # We support both .SN (NYSE local) and raw IPSA codes.
        ticker_re = re.compile(
            r"\b([A-Z][A-Z0-9\-]{1,11}(?:\.SN|\.SN\.IPS)?)\b"
        )
        weight_re = re.compile(r"(\d+[.,]?\d*)\s*%")

        # Find table rows
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", raw, re.DOTALL | re.IGNORECASE)
        for row in rows:
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.DOTALL | re.IGNORECASE)
            if len(cells) < 2:
                continue
            cell_text = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]

            ticker = None
            name = ""
            weight = None
            for i, text in enumerate(cell_text):
                m = ticker_re.search(text.upper())
                if m and not ticker:
                    ticker = m.group(1).replace(".SN", "").replace(".", "-")
                    # name is usually the next non-empty cell
                    if i + 1 < len(cell_text):
                        name = cell_text[i + 1]
                wm = weight_re.search(text)
                if wm and weight is None:
                    weight = float(wm.group(1).replace(",", "."))

            if ticker and weight is not None and weight > 0:
                holdings.append(
                    Holding(
                        symbol=ticker,
                        name=name or ticker,
                        weight=weight,
                        asset_class="equity",
                        exchange="BCS",
                        currency="CLP",
                    )
                )

        # Normalize to 100%
        total = sum(h.weight for h in holdings)
        if total > 0:
            for h in holdings:
                h.weight = round((h.weight / total) * 100, 2)

        return holdings


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scrape Renta 4 recommended portfolios")
    parser.add_argument("--portfolio", default="moderada", choices=["moderada", "moderada-ampliada"])
    args = parser.parse_args()

    adapter = Renta4Adapter(portfolio=args.portfolio)
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
