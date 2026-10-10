"""
Renta 4 (Chile) scraper — recommended portfolios from public weekly PDF reports.

Source structure (verified against the live site):
  - Hub:  /analisis-actualidad/recomendaciones-y-oportunidades/carteras-recomendadas
          (paginated; latest article links to the current weekly PDF)
  - Article: /.../carteras-recomendadas/{YYYY}/{M}/{DD-MM-YY}-cartera-moderada-y-...
  - PDF:  /content/dam/rentabanco/renta4chile/documentos/informes-semanales/
          {YYYY}/Carteras-Recomendadas-Renta-4-Chile-{Mes}-{YYYY}.pdf
          (public, ~2MB, application/pdf — the actual holdings table lives here)

The PDF contains the "Cartera Moderada" and "Cartera Moderada Ampliada"
tables with tickers and target weights. We parse it with pypdf and extract
ticker + percentage pairs.

NOTE: If the DAM PDF URL pattern changes (it embeds the month name in
Spanish), update MONTHS below and the filename pattern.
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

HUB_URL = (
    "https://www.renta4.cl/analisis-actualidad/"
    "recomendaciones-y-oportunidades/carteras-recomendadas"
)

BASE = "https://www.renta4.cl"

# Spanish month names as they appear in the PDF filenames
MONTHS = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}

# Regex for Chilean tickers in the PDF (BCS local codes + .SN variants)
TICKER_RE = re.compile(r"\b([A-ZÁÉÍÓÚÑ][A-Z0-9\-]{1,14}(?:\.SN)?)\b")
WEIGHT_RE = re.compile(r"(\d{1,2}[.,]\d{1,2})\s*%")


class Renta4Adapter(SourceAdapter):
    name = "renta4"
    portfolio_slug = "renta4-moderada"

    PORTFOLIOS = {
        "moderada": "renta4-moderada",
        "moderada-ampliada": "renta4-moderada-ampliada",
    }

    def __init__(self, portfolio: str = "moderada") -> None:
        super().__init__()
        self.portfolio = portfolio
        self.portfolio_slug = self.PORTFOLIOS.get(portfolio, "renta4-moderada")

    # ---------- Step 1: find the current weekly PDF ----------

    def _find_pdf_url(self) -> str | None:
        """Crawl the hub page -> latest article -> DAM PDF link."""
        try:
            resp = self.client.get(HUB_URL)
            resp.raise_for_status()
        except Exception as e:
            log(f"[{self.name}] hub fetch error: {e}")
            return None

        html = resp.text

        # First try a direct DAM link on the hub (some weeks embed it)
        m = re.search(r'href="([^"]*?/content/dam/[^"]*?\.pdf)"', html)
        if m:
            return self._abs(m.group(1))

        # Otherwise follow the newest article link
        article = re.search(
            r'href="(/analisis-actualidad/recomendaciones-y-oportunidades/'
            r'carteras-recomendadas/\d{4}/\d+/\d[^"]*?)"',
            html,
        )
        if not article:
            # Fallback: any carteras article link
            article = re.search(r'href="(/[^"]*carteras-recomendadas/[^"]*?\d[^"]*?)"', html)
        if not article:
            log(f"[{self.name}] no article link found on hub")
            return None

        try:
            art_resp = self.client.get(self._abs(article.group(1)))
            art_resp.raise_for_status()
        except Exception as e:
            log(f"[{self.name}] article fetch error: {e}")
            return None

        m = re.search(r'href="([^"]*?/content/dam/[^"]*?\.pdf)"', art_resp.text)
        if not m:
            log(f"[{self.name}] no PDF link on article page")
            return None
        return self._abs(m.group(1))

    def _guess_pdf_url(self) -> str | None:
        """Construct the DAM PDF URL from the current month as a fallback."""
        today = date.today()
        month = MONTHS[today.month]
        return (
            f"{BASE}/content/dam/rentabanco/renta4chile/documentos/"
            f"informes-semanales/{today.year}/"
            f"Carteras-Recomendadas-Renta-4-Chile-{month}-{today.year}.pdf"
        )

    @staticmethod
    def _abs(href: str) -> str:
        return href if href.startswith("http") else f"{BASE}{href}"

    # ---------- Step 2: fetch + parse the PDF ----------

    def fetch_raw(self) -> str:
        """Return the extracted text of the weekly PDF."""
        if PdfReader is None:
            log(f"[{self.name}] pypdf not installed — pip install pypdf")
            return ""

        pdf_url = self._find_pdf_url() or self._guess_pdf_url()
        if not pdf_url:
            return ""

        log(f"[{self.name}] downloading PDF: {pdf_url}")
        try:
            resp = self.client.get(pdf_url)
            resp.raise_for_status()
            if "pdf" not in resp.headers.get("content-type", ""):
                log(f"[{self.name}] not a PDF: {resp.headers.get('content-type')}")
                return ""
        except Exception as e:
            log(f"[{self.name}] PDF fetch error: {e}")
            return ""

        try:
            reader = PdfReader(io.BytesIO(resp.content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            log(f"[{self.name}] PDF parse error: {e}")
            return ""

    def normalize(self, raw: str) -> list[Holding]:
        """
        Extract ticker + weight pairs from the PDF text.

        The report lists each portfolio as a block. We look for the section
        matching our portfolio name, then parse ticker/percentage lines
        within it. If the section header isn't found, parse the whole doc.
        """
        if not raw:
            return []

        text = raw

        # Try to isolate the relevant section
        if self.portfolio == "moderada-ampliada":
            marker = re.search(r"Moderada\s+Ampliada", text, re.IGNORECASE)
            if marker:
                text = text[marker.start():]
        else:
            marker = re.search(r"Cartera\s+Moderada(?!\s+Ampliada)", text, re.IGNORECASE)
            if marker:
                text = text[marker.start():]

        holdings: list[Holding] = []
        seen: set[str] = set()

        # The PDF's holdings table lists rows as:  TICKER  WEIGHT%  price...
        # Weight uses a comma decimal (e.g. "7,5%"). Match a ticker at the
        # start of a line followed by a weight percentage.
        row_re = re.compile(r"^([A-Z][A-Z0-9\-]{2,14})\s+(\d{1,2}[.,]\d{1,2})\s*%")

        for line in text.splitlines():
            line = line.strip()
            m = row_re.match(line)
            if not m:
                continue
            ticker = m.group(1)
            # Skip aggregate/summary rows
            if ticker in ("TOTAL", "PORTAFOLIO", "PORTFOLIO", "IPSA", "INDEX"):
                continue
            if ticker in seen:
                continue
            weight = float(m.group(2).replace(",", "."))
            if not (0 < weight <= 100):
                continue
            seen.add(ticker)
            holdings.append(
                Holding(
                    symbol=ticker,
                    name=ticker,
                    weight=weight,
                    asset_class="equity",
                    exchange="BCS",
                    currency="CLP",
                )
            )

        # Normalize to 100%
        total = sum(h.weight for h in holdings)
        if total > 0 and holdings:
            for h in holdings:
                h.weight = round((h.weight / total) * 100, 2)

        log(f"[{self.name}] parsed {len(holdings)} holdings from PDF")
        return holdings


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Scrape Renta 4 recommended portfolios from PDF")
    parser.add_argument("--portfolio", default="moderada", choices=["moderada", "moderada-ampliada"])
    args = parser.parse_args()

    adapter = Renta4Adapter(portfolio=args.portfolio)
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
