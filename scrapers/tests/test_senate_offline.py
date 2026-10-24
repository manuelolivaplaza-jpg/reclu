import pytest

import senate_disclosure as sd

PTR = """<table><tbody>
<tr><td>1</td><td>09/05/2026</td><td>Self</td><td><a href="#">NVDA</a></td>
<td>NVIDIA Corp</td><td>Stock</td><td>Purchase</td><td>$1,001 - $15,000</td><td></td></tr>
<tr><td>2</td><td>09/06/2026</td><td>Spouse</td><td>--</td>
<td>Muni bond</td><td>Municipal Security</td><td>Sale (Full)</td><td>$15,001 - $50,000</td><td></td></tr>
</tbody></table>"""


class Resp:
    def __init__(self, code):
        self.status_code = code
        self.text = ""

    def raise_for_status(self):
        raise AssertionError("no debería llegar aquí")


def test_parse_ptr_html_solo_acciones():
    rows = sd.parse_ptr_html(PTR)
    assert len(rows) == 1
    assert rows[0]["ticker"] == "NVDA"
    assert rows[0]["tx_date"] == "2026-09-05"
    assert rows[0]["amount_mid"] == 8000.5


def test_403_es_mensaje_claro():
    class Client:
        def get(self, url):
            return Resp(403)

    adapter = sd.SenateDisclosureAdapter(dry_run=True)
    with pytest.raises(sd.SenateBlocked, match="HTTP 403"):
        adapter._accept_agreement(Client())


def test_helpers():
    assert sd.SenateDisclosureAdapter._amount_mid("$50,001 - $100,000") == 75000.5
    assert sd.SenateDisclosureAdapter._iso_date("12/31/2025") == "2025-12-31"
    link, text = sd.SenateDisclosureAdapter._extract_link('<a href="/search/view/ptr/abc/">John Doe</a>')
    assert link == "/search/view/ptr/abc/" and text == "John Doe"
