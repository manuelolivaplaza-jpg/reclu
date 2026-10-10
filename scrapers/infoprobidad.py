"""
InfoProbidad scraper — Chilean public disclosures (declaraciones de patrimonio).

Source: https://www.infoprobidad.cl (open data / public declarations)
Feeds portfolio: infoProbidad-cl

InfoProbidad publishes declarations of assets/interests of Chilean public
officials. We track notable declarations as "mentions" alerts.

NOTE: The site offers datasets in CSV/JSON. This adapter targets the public
dataset download endpoints. Update URLs if the portal changes.
"""

from __future__ import annotations

import csv
import io
from datetime import date

from base import Holding, SourceAdapter, log


class InfoProbidadAdapter(SourceAdapter):
    name = "infoprobidad"
    portfolio_slug = "infoProbidad-cl"

    BASE_URL = "https://www.infoprobidad.cl"

    def fetch_raw(self) -> list[dict]:
        """
        Fetch the public declarations dataset.
        InfoProbidad publishes downloadable datasets (CSV) per year.
        """
        year = date.today().year
        url = f"{self.BASE_URL}/descargas/declaraciones-{year}.csv"
        try:
            resp = self.client.get(url)
            if resp.status_code == 404:
                # Fallback: try without year suffix
                url = f"{self.BASE_URL}/descargas/declaraciones.csv"
                resp = self.client.get(url)
            resp.raise_for_status()
            reader = csv.DictReader(io.StringIO(resp.text))
            return list(reader)[:500]  # cap at 500 rows
        except Exception as e:
            log(f"[{self.name}] fetch error: {e}")
            return []

    def normalize(self, raw: list[dict]) -> list[Holding]:
        """
        Extract notable asset declarations.
        InfoProbidad columns vary by dataset; we look for common fields:
        - tipo de bien / tipo_activo
        - valor / monto
        - funcionario / nombre

        We approximate a "portfolio" by grouping by asset type and
        weighting by declared value.
        """
        from collections import defaultdict

        by_type: dict[str, dict] = defaultdict(lambda: {"value": 0.0, "count": 0})

        for row in raw:
            # Try multiple possible column names
            asset_type = (
                row.get("tipo_bien")
                or row.get("tipo_activo")
                or row.get("Tipo de Bien")
                or row.get("tipo")
                or ""
            ).strip()
            if not asset_type:
                continue

            value_raw = (
                row.get("valor")
                or row.get("monto")
                or row.get("Valor")
                or "0"
            )
            value = self._parse_clp(value_raw)

            entry = by_type[asset_type]
            entry["value"] += value
            entry["count"] += 1

        total = sum(e["value"] for e in by_type.values())
        if total <= 0:
            return []

        holdings = []
        for asset_type, e in by_type.items():
            weight = (e["value"] / total) * 100
            if weight < 0.5:
                continue
            holdings.append(
                Holding(
                    symbol=asset_type[:12].upper().replace(" ", ""),
                    name=asset_type,
                    weight=round(weight, 2),
                    asset_class="other",
                    currency="CLP",
                )
            )
        return holdings

    @staticmethod
    def _parse_clp(value_str: str) -> float:
        """Parse Chilean-formatted currency: '$ 1.500.000' -> 1500000.0"""
        if not value_str:
            return 0.0
        s = str(value_str).replace("$", "").replace(".", "").replace(",", ".").strip()
        try:
            return float(s)
        except ValueError:
            return 0.0


if __name__ == "__main__":
    adapter = InfoProbidadAdapter()
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
