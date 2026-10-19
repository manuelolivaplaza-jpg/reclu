"""Tests de parseo para los scrapers de F3 (sin red ni DB).

Correr:  uv run --with pytest python -m pytest scrapers/tests/ -v
         (o) python -m pytest scrapers/tests/ -v
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from senate_disclosure import (  # noqa: E402
    SenateDisclosureAdapter,
    SenateTrade,
)
from infoprobidad import InfoProbidadAdapter  # noqa: E402


# ---------------------------------------------------------------------------
# Senate eFD: tabla HTML de un PTR (fixture construido con el formato real
# del endpoint /search/view/ptr/{uuid}: primer <tbody>, 8 columnas)
# ---------------------------------------------------------------------------
SENATE_PTR_HTML = """<html><body>
<table class="table">
<thead><tr><th>Owner</th><th>Transaction Date</th><th>Reporting Status</th>
<th>Ticker</th><th>Asset Name</th><th>Asset Type</th><th>Type</th><th>Amount</th></tr></thead>
<tbody>
<tr><td>Self</td><td>09/05/2026</td><td>Individually filed</td><td>NVDA</td>
    <td>NVIDIA Corporation</td><td>Stock</td><td>Purchase</td><td>$1,001 - $15,000</td></tr>
<tr><td>Self</td><td>09/12/2026</td><td>Individually filed</td><td>AAPL</td>
    <td>Apple Inc.</td><td>Stock</td><td>Purchase</td><td>$15,001 - $50,000</td></tr>
<tr><td>Spouse</td><td>09/18/2026</td><td>Individually filed</td><td>TSLA</td>
    <td>Tesla, Inc.</td><td>Stock</td><td>Sale (Full)</td><td>$1,001 - $15,000</td></tr>
<tr><td>Self</td><td>09/20/2026</td><td>Individually filed</td><td>--</td>
    <td>US Treasury Bond</td><td>Corporate Bond</td><td>Purchase</td><td>$1,001 - $15,000</td></tr>
</tbody>
</table>
</body></html>"""


def test_senate_parse_report_table():
    adapter = SenateDisclosureAdapter.__new__(SenateDisclosureAdapter)
    rows = adapter._parse_report_table(SENATE_PTR_HTML)
    assert len(rows) == 4
    assert rows[0]["ticker"] == "NVDA"
    assert rows[0]["tx_date"] == "09/05/2026"
    assert rows[0]["order_type"] == "Purchase"
    assert rows[0]["amount"] == "$1,001 - $15,000"
    assert rows[3]["ticker"] == "--"  # sin ticker: se filtrará después


def test_senate_amount_mid():
    mid = SenateDisclosureAdapter._amount_mid("$1,001 - $15,000")
    assert abs(mid - 8000.5) < 0.01
    exact = SenateDisclosureAdapter._amount_mid("$50,000,001 +")
    assert exact == 50000001.0


def test_senate_iso_date():
    assert SenateDisclosureAdapter._iso_date("09/05/2026") == "2026-09-05"
    assert SenateDisclosureAdapter._iso_date("12/31/2025") == "2025-12-31"


def test_senate_normalize_buys_minus_sells():
    adapter = SenateDisclosureAdapter.__new__(SenateDisclosureAdapter)
    trades = [
        SenateTrade("Tommy Tuberville", "NVDA", "NVIDIA", "Purchase",
                    "$1,001 - $15,000", 8000.5, "2026-09-05", "2026-10-01", "u1"),
        SenateTrade("Tommy Tuberville", "AAPL", "Apple", "Purchase",
                    "$15,001 - $50,000", 32500.5, "2026-09-12", "2026-10-01", "u1"),
        SenateTrade("Tommy Tuberville", "NVDA", "NVIDIA", "Sale (Partial)",
                    "$1,001 - $15,000", 8000.5, "2026-09-18", "2026-10-01", "u1"),
    ]
    holdings = adapter.normalize(trades)
    # NVDA se cancela (compra - venta iguales); queda solo AAPL al 100%
    assert len(holdings) == 1
    assert holdings[0].symbol == "AAPL"
    assert holdings[0].weight == 100.0


def test_senate_normalize_empty():
    adapter = SenateDisclosureAdapter.__new__(SenateDisclosureAdapter)
    assert adapter.normalize([]) == []


# ---------------------------------------------------------------------------
# InfoProbidad: respuesta SPARQL (fixture con el binding real del endpoint
# datos.cplt.cl/sparql)
# ---------------------------------------------------------------------------
SPARQL_RESPONSE = {
    "head": {"vars": ["entidad", "valor"]},
    "results": {"bindings": [
        {"entidad": {"type": "literal", "value": "BANCO DE CHILE"},
         "valor": {"type": "literal", "value": "110412506"}},
        {"entidad": {"type": "literal", "value": "SOCIEDAD QUIMICA Y MINERA DE CHILE S.A."},
         "valor": {"type": "literal", "value": "108262596"}},
        {"entidad": {"type": "literal", "value": "LATAM AIRLINES GROUP SA"},
         "valor": {"type": "literal", "value": "99132132"}},
        {"entidad": {"type": "literal", "value": "BANCO DE CHILE"},
         "valor": {"type": "literal", "value": "50000000"}},
        {"entidad": {"type": "literal", "value": "EMPRESA SIN VALOR"},
         "valor": {"type": "literal", "value": "0"}},
    ]},
}


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, payload):
        self.payload = payload

    def post(self, *args, **kwargs):
        return _FakeResponse(self.payload)


def test_infoprobidad_normalize_weights():
    adapter = InfoProbidadAdapter()
    # Simular fetch_raw extrayendo del fixture SPARQL
    rows = []
    for b in SPARQL_RESPONSE["results"]["bindings"]:
        entidad = b["entidad"]["value"]
        valor = float(b["valor"]["value"])
        if entidad and valor > 0:
            rows.append({"entidad": entidad, "valor": valor})
    holdings = adapter.normalize(rows)
    # 3 entidades con valor > 0 (EMPRESA SIN VALOR se filtra por valor 0)
    assert len(holdings) == 3
    # Banco de Chile suma 160M y va primero
    assert holdings[0].symbol == "BANCO"
    total = sum(h.weight for h in holdings)
    assert abs(total - 100.0) < 0.5  # pesos renormalizados
    assert holdings[0].currency == "CLP"


def test_infoprobidad_fetch_raw_parses_bindings():
    adapter = InfoProbidadAdapter()
    adapter.client = _FakeClient(SPARQL_RESPONSE)
    rows = adapter.fetch_raw()
    # 4 bindings con valor > 0 (Banco de Chile declarado 2 veces; el de
    # valor 0 se filtra). La agregación por entidad ocurre en normalize.
    assert len(rows) == 4
    assert rows[0]["entidad"] == "BANCO DE CHILE"
    assert rows[0]["valor"] == 110412506.0


# ---------------------------------------------------------------------------
# iShares CSV: header real del endpoint latest-holdings.csv (verificado vivo)
# ---------------------------------------------------------------------------
ISHARES_CSV = """iShares MSCI Chile ETF
Fund Holdings as of,"Oct 15, 2026"
Inception Date,"Nov 12, 2007"
Stock,"-"
Bond,"-"
Cash,"-"
Other,"-"

Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Price,Location,Exchange,Currency,FX Rate,Market Currency
"CHILE","BANCO DE CHILE","Financials","Equity","110,412,506.32","12.17","110,412,506.32","566,970,525.00","0.19","Chile","SCL","CLP","0.0010","CLP"
"SQM.B","SOCIEDAD QUIMICA Y MINERA DE CHILE","Materials","Equity","108,262,596.72","11.94","108,262,596.72","1,788,537,025.00","0.06","Chile","SCL","CLP","0.0010","CLP"
"USD","USD CASH","-","Cash","25,776.78","0.00","25,776.78","25,776.78","1.00","United States","","USD","1.00","USD"
"""


def test_ishares_csv_parse(monkeypatch=None):
    import etfs

    def fake_get(url):
        return ISHARES_CSV

    original = etfs._get
    etfs._get = fake_get
    try:
        rows = etfs.fetch_ishares("ech")
    finally:
        etfs._get = original
    # USD CASH tiene weight 0.00 y se filtra
    assert len(rows) == 2
    assert rows[0]["symbol"] == "CHILE"
    assert rows[0]["weight"] == 12.17
    assert rows[0]["as_of"] == "2026-10-15"
    assert rows[1]["symbol"] == "SQM.B"


if __name__ == "__main__":
    # Runner mínimo si pytest no está disponible
    import inspect

    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                failures += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{failures} fallos")
    sys.exit(1 if failures else 0)
