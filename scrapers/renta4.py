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

    def __init__(self, portfolio: str = "moderada", dry_run: bool = False) -> None:
        super().__init__(dry_run=dry_run)
        self.portfolio = portfolio
        self.portfolio_slug = self.PORTFOLIOS.get(portfolio, "renta4-moderada")

    # ---------- Step 1: find the current weekly PDF ----------

    # D74: la seccion se aisla entre su encabezado numerado ("03. Cartera
    # Moderada" / "04. Cartera Moderada Ampliada") y se toma SOLO la primera
    # tabla de filas TICKER PESO%. Antes se cortaba desde la primera mencion
    # (el indice de la portada) hasta el final del PDF, asi que ambas carteras
    # leian la tabla de la Moderada + los extras de la Ampliada: holdings
    # identicos en renta4-moderada y renta4-moderada-ampliada.
    ROW_RE = re.compile(r"^([A-Z][A-Z0-9\-]{2,14})\s+(\d{1,2}[.,]\d{1,2})\s*%")
    SKIP = ("TOTAL", "PORTAFOLIO", "PORTFOLIO", "IPSA", "INDEX")

    @classmethod
    def parse_section(cls, raw: str, portfolio: str) -> list[tuple[str, float]]:
        if not raw:
            return []
        lines = [line.strip() for line in raw.splitlines()]
        if portfolio == "moderada-ampliada":
            header = re.compile(r"^\d{1,2}\.\s*Cartera\s+Moderada\s+Ampliada\b", re.IGNORECASE)
        else:
            header = re.compile(r"^\d{1,2}\.\s*Cartera\s+Moderada\s*$", re.IGNORECASE)
        starts = [i for i, line in enumerate(lines) if header.match(line)]
        if not starts:
            log(f"[renta4] seccion {portfolio} no encontrada; no se adivina")
            return []
        out: list[tuple[str, float]] = []
        seen: set[str] = set()
        started = False
        for line in lines[starts[0]:]:
            m = cls.ROW_RE.match(line)
            if not m or m.group(1) in cls.SKIP:
                if started:
                    break
                continue
            started = True
            ticker = m.group(1)
            weight = float(m.group(2).replace(",", "."))
            if ticker in seen or not (0 < weight <= 100):
                continue
            seen.add(ticker)
            out.append((ticker, weight))
        return out

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

        # Otherwise follow the newest article link (href puede ser absoluto
        # o relativo — verificado en vivo: hoy vienen absolutos)
        article = self.newest_article(html)
        if not article:
            # Fallback: any carteras article link
            article = re.search(r'href="([^"]*carteras-recomendadas/[^"]*)"', html)
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
    def newest_article(html: str):
        """D74: el articulo mas reciente por fecha del link (no el primero del HTML)."""
        links = re.findall(
            r'href="((?:https?://www\.renta4\.cl)?/analisis-actualidad/recomendaciones-y-oportunidades/'
            r'carteras-recomendadas/(\d{4})/(\d+)/(\d{2})-[^"]*?)"',
            html,
        )
        if not links:
            return None
        href = max(links, key=lambda x: (int(x[1]), int(x[2]), int(x[3])))[0]
        return re.match(r"(.*)", href)

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

        holdings: list[Holding] = []
        for ticker, weight in self.parse_section(raw, self.portfolio):
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
