"""
BTG Pactual Chile scraper — Cartera Concentrada (Renta Variable Local).

Fuente (verificada en vivo 2026-10-16):
  - La página pública app.btgpactual.cl/productos-de-inversion/acciones/
    cartera-recomendada es una SPA Vue que carga los datos desde una API
    que exige token (mlback.btgpactual.cl → 401). NO usar como fuente.
  - El propio frontend enlaza el informe completo como un asset estático
    público en S3, sin login:
      https://static-btg.s3.amazonaws.com/static/assets/carteras/Cartera_Concentrada_RVL.pdf
    (200, application/pdf, ~730KB, actualizado por BTG cada mes).

El PDF trae la tabla "Composición de la cartera" con cada acción y su peso
(7 acciones IPSA al 14,3% en la edición verificada). Se parsea con pypdf
y se normaliza a 100%.

Estructura del texto extraído (página 2, tabla de composición):
    ANDINA-B 14,3% 4.730 = 7,81% 15,2x ... Racional
    AGUAS ANDINAS-A 14,3% 326 = 26,89% ...
    ...
    Cartera Concentrada 23,84% 14,8x ...
La fila de agregado ("Cartera Concentrada") se excluye del parseo.
"""

from __future__ import annotations

import io
import re

from base import Holding, SourceAdapter, log

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore


# URL pública verificada (asset estático S3 enlazado por la SPA).
PDF_URL = "https://static-btg.s3.amazonaws.com/static/assets/carteras/Cartera_Concentrada_RVL.pdf"

# Alias de la misma ruta bajo el dominio de la corredora, por si BTG
# migra el bucket a su propio CDN. Ambos sirven el mismo objeto.
PDF_URL_FALLBACK = "https://static.btgpactual.cl/assets/carteras/Cartera_Concentrada_RVL.pdf"

# Filas de agregado que no son activos.
AGGREGATE_ROWS = {
    "CARTERA",
    "CARTERA CONCENTRADA",
    "TOTAL",
    "IPSA",
    "ALFA",
    "RENTABILIDAD",
    "COMPOSICION",
    "POSICIONES",
}

# Fila de composición: NOMBRE (con espacios) + peso % como primer número.
# El nombre de la tabla usa razón social ("AGUAS ANDINAS-A", "BANCO SANTANDER"),
# no siempre el nemotécnico bursátil; TICKER_MAP los normaliza.
ROW_RE = re.compile(
    r"^([A-ZÁÉÍÓÚÑ][A-Z0-9 .&\-']{2,40}?)\s+(\d{1,3}[.,]\d{1,2})\s*%"
)

# Razón social (mayúsculas, sin tildes) -> nemotónico bursátil BCS.
TICKER_MAP: dict[str, str] = {
    "ANDINA-B": "ANDINA-B",
    "ANDINA B": "ANDINA-B",
    "EMBOTELLADORA ANDINA": "ANDINA-B",
    "AGUAS ANDINAS-A": "AGUAS-A",
    "AGUAS-A": "AGUAS-A",
    "AGUAS ANDINAS": "AGUAS-A",
    "FALABELLA SA": "FALABELLA",
    "FALABELLA": "FALABELLA",
    "BANCO SANTANDER": "SANTANDER",
    "SANTANDER": "SANTANDER",
    "CMPC": "CMPC",
    "LATAM AIRLINES": "LTM",
    "LATAM": "LTM",
    "SOQUIMICH-B": "SQM-B",
    "SQM-B": "SQM-B",
    "SOQUIMICH": "SQM-B",
    "SQM": "SQM-B",
}

# Nombre display correcto por nemotónico (evita "Cmpc" / "Falabella Sa").
DISPLAY_NAME: dict[str, str] = {
    "ANDINA-B": "Embotelladora Andina",
    "AGUAS-A": "Aguas Andinas",
    "FALABELLA": "Falabella S.A.",
    "SANTANDER": "Banco Santander Chile",
    "CMPC": "CMPC S.A.",
    "LTM": "LATAM Airlines Group",
    "SQM-B": "Soquimich (SQM)",
}


def _ticker_for(raw_name: str) -> str | None:
    """Razón social del PDF -> nemotónico bursátil, si se conoce."""
    key = " ".join(raw_name.upper().split())
    key = re.sub(r"\s+(SA|S\.A\.|SPA)$", "", key)
    return TICKER_MAP.get(key)


class BtgPactualAdapter(SourceAdapter):
    name = "btg_pactual"
    portfolio_slug = "btg-cartera-recomendada"

    # ---------- Step 1: descargar el PDF público ----------

    def _download_pdf(self) -> bytes | None:
        for url in (PDF_URL, PDF_URL_FALLBACK):
            try:
                resp = self.client.get(url)
                resp.raise_for_status()
                if "pdf" not in resp.headers.get("content-type", "").lower():
                    log(f"[{self.name}] {url} no es un PDF "
                        f"({resp.headers.get('content-type')})")
                    continue
                return resp.content
            except Exception as e:  # noqa: BLE001 - red frágil, probamos el fallback
                log(f"[{self.name}] fetch error {url}: {e}")
        return None

    def fetch_raw(self) -> str:
        """Texto extraído del informe de la Cartera Concentrada."""
        if PdfReader is None:
            log(f"[{self.name}] pypdf no instalado — pip install pypdf")
            return ""

        content = self._download_pdf()
        if content is None:
            log(f"[{self.name}] no se pudo descargar el informe")
            return ""

        try:
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:  # noqa: BLE001
            log(f"[{self.name}] PDF parse error: {e}")
            return ""

    # ---------- Step 2: parsear tickers + pesos ----------

    def normalize(self, raw: str) -> list[Holding]:
        """
        Extrae ticker + peso de la tabla de composición del informe.

        La tabla aparece una vez por página-rendimientos; el patrón es
        "NOMBRE peso% precio = div" al inicio de línea. Los pesos del
        informe suman ~100; se renormalizan por si el PDF trae redondeos.
        """
        if not raw:
            return []

        holdings: list[Holding] = []
        seen: set[str] = set()

        for line in raw.splitlines():
            line = line.strip()
            m = ROW_RE.match(line)
            if not m:
                continue

            raw_name = m.group(1).strip()
            # Excluir agregados ("Cartera Concentrada 23,84% ...").
            if raw_name.upper() in AGGREGATE_ROWS:
                continue

            ticker = _ticker_for(raw_name)
            if ticker is None:
                # Activo nuevo que aún no está en TICKER_MAP: usar el
                # nombre comprimido como símbolo y registrar advertencia.
                ticker = raw_name.upper().replace(" ", "")[:12]
                log(f"[{self.name}] ticker no mapeado: {raw_name!r} -> {ticker}")

            if ticker in seen:
                continue

            weight = float(m.group(2).replace(",", "."))
            if not (0 < weight <= 100):
                continue

            seen.add(ticker)
            holdings.append(
                Holding(
                    symbol=ticker,
                    name=DISPLAY_NAME.get(ticker, raw_name.title()),
                    weight=weight,
                    asset_class="equity",
                    exchange="BCS",
                    currency="CLP",
                )
            )

        # Normalizar a 100%.
        total = sum(h.weight for h in holdings)
        if total > 0 and holdings:
            for h in holdings:
                h.weight = round((h.weight / total) * 100, 2)

        log(f"[{self.name}] parseadas {len(holdings)} posiciones del PDF")
        return holdings


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Scrape BTG Pactual Chile — Cartera Concentrada (PDF público)"
    )
    args = parser.parse_args()

    adapter = BtgPactualAdapter()
    result = adapter.run()
    log(f"[{adapter.name}] Result: {result}")
