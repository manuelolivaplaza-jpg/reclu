"""
House Financial Disclosure scraper — fuente OFICIAL y pública de trades de
congresistas de EE.UU. (sin login wall, a diferencia de Capitol Trades).

Fuente: https://disclosures-clerk.house.gov
  - Buscador: /FinancialDisclosure/ViewSearch (form -> ViewMemberSearchResult)
  - Reportes: financial-pdfs/{year}/{id}.pdf (patrimonio anual)
  - PTRs:     ptr-pdfs/{year}/{id}.pdf (Periodic Transaction Reports = trades)

Flujo:
  1. GET ViewSearch -> extraer __RequestVerificationToken
  2. POST ViewMemberSearchResult {LastName, FilingYear, State, District}
     -> links a PTRs del año
  3. GET cada PTR PDF -> extraer texto
  4. parse: filas "SP <Asset> (<TICKER>) [ST|OP] <Tipo> <Fecha> <Fecha> <Monto>"

Cada político mapea a un portfolio slug (igual que capitol_trades.py).
"""

from __future__ import annotations

import io
import re
from datetime import date

from base import Holding, SourceAdapter, log

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore

BASE = "https://disclosures-clerk.house.gov"
SEARCH = f"{BASE}/FinancialDisclosure/ViewSearch"
RESULT = f"{BASE}/FinancialDisclosure/ViewMemberSearchResult"


class HouseDisclosureAdapter(SourceAdapter):
    name = "house_disclosure"
    portfolio_slug = "pelosi-tracker"

    # Apellido -> portfolio slug
    POLITICIANS = {
        "pelosi": "pelosi-tracker",
        "trump": "trump-trades",
    }

    def __init__(self, politician: str = "pelosi") -> None:
        super().__init__()
        self.politician = politician.lower()
        self.last_name = self.politician.capitalize()
        self.portfolio_slug = self.POLITICIANS.get(self.politician, "pelosi-tracker")

    # ---------- Paso 1+2: buscar PTRs del político ----------

    def _fetch_ptr_urls(self, year: int | None = None) -> list[str]:
        """Devuelve las URLs de los PTRs más recientes del político."""
        if PdfReader is None:
            log(f"[{self.name}] pypdf no instalado — pip install pypdf")
            return []

        year = year or date.today().year

        # 1. Token CSRF
        try:
            r = self.client.get(SEARCH)
            r.raise_for_status()
        except Exception as e:
            log(f"[{self.name}] error cargando buscador: {e}")
            return []
        m = re.search(r'name="__RequestVerificationToken"[^>]+value="([^"]+)"', r.text)
        if not m:
            log(f"[{self.name}] no se encontró el token CSRF")
            return []
        token = m.group(1)

        # 2. POST de búsqueda por apellido
        try:
            r2 = self.client.post(
                RESULT,
                data={
                    "__RequestVerificationToken": token,
                    "LastName": self.last_name,
                    "FilingYear": str(year),
                    "State": "",
                    "District": "",
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": SEARCH,
                    "Origin": BASE,
                },
            )
            r2.raise_for_status()
        except Exception as e:
            log(f"[{self.name}] error en búsqueda: {e}")
            return []

        # 3. Extraer links a PTRs
        ptr_links = re.findall(r'href="([^"]*?ptr-pdfs/[^"]+?\.pdf)"', r2.text)
        return [self._abs(p) for p in ptr_links]

    @staticmethod
    def _abs(href: str) -> str:
        return href if href.startswith("http") else f"{BASE}/{href.lstrip('/')}"

    def fetch_raw(self) -> str:
        """Descarga y concatena el texto de los PTRs del año."""
        ptr_urls = self._fetch_ptr_urls()
        if not ptr_urls:
            log(f"[{self.name}] sin PTRs para {self.last_name} {date.today().year}")
            return ""

        log(f"[{self.name}] {len(ptr_urls)} PTRs encontrados para {self.last_name}")
        all_text = []
        for url in ptr_urls[:5]:  # cap a 5 reportes por corrida
            try:
                r = self.client.get(url)
                r.raise_for_status()
                if "pdf" not in r.headers.get("content-type", ""):
                    continue
                reader = PdfReader(io.BytesIO(r.content))
                all_text.append("\n".join(p.extract_text() or "" for p in reader.pages))
            except Exception as e:
                log(f"[{self.name}] error leyendo {url}: {e}")
        return "\n".join(all_text)

    def normalize(self, raw: str) -> list[Holding]:
        """
        Extrae trades de los PTRs. Aproximamos una "cartera" agrupando por
        ticker y pesando por el punto medio del rango de monto (compras +,
        ventas -). Solo compras netas cuentan como posición.
        """
        if not raw:
            return []

        # Limpia los null bytes que mete pypdf en estos PDFs
        text = raw.replace("\x00", "")

        # Patrón de fila: "SP <Asset> (<TICKER>) [ST|OP] <Tipo> <fecha> <fecha> <monto>"
        # El tipo aparece justo después del [ST]/[OP]: P, S, S (partial), E...
        row_re = re.compile(
            r"\(([A-Z][A-Z0-9.\-]{0,9})\)\s*\[(?:ST|OP)\]\s*"
            r"(P|S(?:\s*\(partial\))?|E(?:\s*\(partial\))?)\s+"
            r"(\d{2}/\d{2}/\d{4})\s+\d{2}/\d{2}/\d{4}\s+"
            r"\$([\d,]+)\s*-\s*\$([\d,]+)",
        )

        from collections import defaultdict

        by_ticker: dict[str, float] = defaultdict(float)

        for m in row_re.finditer(text):
            ticker = m.group(1)
            tx_type = m.group(2).strip()
            amt_lo = float(m.group(4).replace(",", ""))
            amt_hi = float(m.group(5).replace(",", ""))
            mid = (amt_lo + amt_hi) / 2

            # Compra (P) suma posición; Venta (S) resta; Ejercicio (E) neutro/suma
            if tx_type.startswith("P"):
                by_ticker[ticker] += mid
            elif tx_type.startswith("S"):
                by_ticker[ticker] -= mid
            # E (exercise) no cuenta como posición nueva

        # Nos quedamos solo con posiciones netas positivas
        positions = {t: v for t, v in by_ticker.items() if v > 0}
        total = sum(positions.values())
        if total <= 0:
            return []

        holdings = []
        for ticker, value in sorted(positions.items(), key=lambda kv: -kv[1]):
            weight = (value / total) * 100
            if weight < 0.5:
                continue
            holdings.append(
                Holding(
                    symbol=ticker,
                    name=ticker,
                    weight=round(weight, 2),
                    asset_class="equity",
                    exchange="US",
                    currency="USD",
                )
            )
        log(f"[{self.name}] {len(holdings)} posiciones netas de {self.last_name}")
        return holdings


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scrape House Disclosure PTRs")
    parser.add_argument("--politician", default="pelosi", choices=["pelosi", "trump"])
    args = parser.parse_args()

    adapter = HouseDisclosureAdapter(politician=args.politician)
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
