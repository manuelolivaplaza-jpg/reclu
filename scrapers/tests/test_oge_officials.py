"""OGE 278-T de funcionarios del gabinete. Sin red y sin Supabase.

Correr:
  uv run --python 3.11 --with httpx --with pypdf --with pytest \
    python -m pytest scrapers/tests/test_oge_officials.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oge_officials import (  # noqa: E402
    alerts_for_trades,
    holdings_for_trades,
    load_officials,
    parse_278t_official,
    reports_from_payload,
)

REPORT = (
    "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/"
    "BA716BA5B423A76685258CE6002C8303/$FILE/Scott-Bessent-07.14.2025-278T.pdf"
)

TEXT = """
Bessent, Scott - Page 2
# DESCRIPTION TYPE DATE NOTIFICATION
RECEIVED OVER
30 DAYS AGO
AMOUNT
1 iShares MSCI Germany ETF (EWG) Sale 03/04/2025 No $1,001 - $15,000
2 SPDR Gold Shares (GLD) Purchase 04/05/2025 No $1,000,001 -
$5,000,000
3 Old Farm Partners Sale 01/28/2025 No $100,001 - $250,000
4 Salesforce, Inc. (CRM) Purchase 05/06/2025 No $15,001 - $50,000
5 Totem Macro Global Alpha Select Onshore Fund,
LLC Sale 03/27/2025 No $1,001 - $15,000
Bessent, Scott - Page 3
"""


def _parse(status: str = "pendiente"):
    return parse_278t_official(
        TEXT,
        report_url=REPORT,
        report_signed="2025-07-14",
        report_published="2025-08-14",
        filer="Bessent, Scott",
    )


def test_config_tres_funcionarios_sin_fed():
    officials = load_officials()
    assert len(officials) == 3
    assert {item.slug for item in officials} == {
        "bessent-oge",
        "lutnick-oge",
        "hegseth-oge",
    }
    assert all(item.index_url.startswith("https://extapps2.oge.gov/") for item in officials)
    assert not any("federal reserve" in item.agency.lower() for item in officials)


def test_parsea_ticker_fecha_y_tramos():
    rows = {row.line_no: row for row in _parse()}
    assert rows[1].symbol == "EWG"
    assert rows[1].side == "sale"
    assert rows[1].trans_date == "2025-03-04"
    assert rows[1].amount_min == 1_001
    assert rows[1].amount_max == 15_000

    assert rows[2].symbol == "GLD"
    assert rows[2].side == "purchase"
    assert rows[2].amount_min == 1_000_001
    assert rows[2].amount_max == 5_000_000

    assert rows[3].symbol is None
    assert rows[3].asset_class == "other"

    # "Salesforce" no debe confundirse con una columna TYPE "Sale".
    assert rows[4].symbol == "CRM"
    assert rows[4].side == "purchase"

    # Descripción partida en dos líneas por el PDF.
    assert rows[5].description.startswith("Totem Macro")
    assert rows[5].side == "sale"
    assert all(row.status == "pendiente" for row in rows.values())


def test_pendientes_no_generan_holdings_ni_alertas():
    rows = _parse()
    assert holdings_for_trades(rows) == []
    assert alerts_for_trades(rows, display_name="Scott Bessent") == []


def test_verificadas_generan_holdings_y_alertas():
    rows = _parse()
    for row in rows:
        if row.line_no in (2, 4):
            row.status = "verificada"
    holdings = holdings_for_trades(rows)
    assert {row["symbol"] for row in holdings} == {"GLD", "CRM"}
    assert round(sum(row["weight"] for row in holdings), 2) == 100.0
    assert all(row["as_of"] for row in holdings)

    alerts = alerts_for_trades(rows, display_name="Scott Bessent")
    assert {alert["payload"]["symbol"] for alert in alerts} == {"GLD", "CRM"}
    assert all(alert["type"] == "new_trade" for alert in alerts)
    assert alerts[0]["title"].startswith("Scott Bessent compró")
    assert alerts[0]["payload"]["source_url"] == REPORT


def test_venta_verificada_alerta_pero_no_es_holding():
    rows = _parse()
    rows[0].status = "verificada"
    assert holdings_for_trades(rows) == []
    alerts = alerts_for_trades(rows, display_name="Scott Bessent")
    assert len(alerts) == 1
    assert alerts[0]["title"].startswith("Scott Bessent vendió EWG")


def test_indice_extrae_solo_278t_del_funcionario():
    official = load_officials()[0]
    payload = {
        "data": [
            {
                "name": "Bessent, Scott",
                "docDate": "2025-08-14T04:06:11",
                "type": "<a href='https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/"
                "BA716BA5B423A76685258CE6002C8303/$FILE/"
                "Scott-Bessent-07.14.2025-278T.pdf'>278 Transaction</a>",
            },
            {
                "name": "Bessent, Scott",
                "docDate": "2026-09-23T04:18:09",
                "type": "<a href='https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/"
                "CF8CA0328CB1970085258E7B002D9B7E/$FILE/"
                "Scott-Bessent-2026-278ANNU.pdf'>Annual (2026)</a>",
            },
            {
                "name": "Bessent, Scott",
                "docDate": "2025-07-16T04:01:53",
                "type": "<a href='https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/"
                "1C3612BFD4B4B91C85258CC9002C1E57/$FILE/"
                "Bessent%20EA%20Compliance%20Certification.pdf'>Certification</a>",
            },
            {
                "name": "Bessent, Otro",
                "docDate": "2025-08-14T04:06:11",
                "type": "<a href='https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/"
                "0/$FILE/Otro-Bessent-07.14.2025-278T.pdf'>278 Transaction</a>",
            },
            {
                "name": "Bessent, Scott",
                "docDate": "2025-08-15T04:06:11",
                "type": "<a href='https://extapps2.oge.gov/201/Presiden.nsf/"
                "201%20Request?OpenForm&Filer=Bessent'>278 Transaction (Request)</a>",
            },
        ]
    }
    reports = reports_from_payload(payload, official)
    assert len(reports) == 1
    assert reports[0]["url"].endswith("Scott-Bessent-07.14.2025-278T.pdf")
    assert reports[0]["report_signed"] == "2025-07-14"
    assert reports[0]["report_published"] == "2025-08-14"


def test_dry_run_no_escribe_y_resume(monkeypatch):
    from oge_officials import OgeOfficialsAdapter

    adapter = OgeOfficialsAdapter(dry_run=True)
    raw = [
        {
            "url": REPORT,
            "text": TEXT,
            "report_signed": "2025-07-14",
            "report_published": "2025-08-14",
            "official": adapter.officials[0],
        }
    ]
    monkeypatch.setattr(adapter, "fetch_raw", lambda: raw)
    summary = adapter.run(None)
    assert summary["dry_run"] is True
    assert summary["reports"] == 1
    assert summary["parsed"] == 5
    assert summary["pending"] == 5
    assert summary["holdings"] == 0
    assert summary["alerts"] == 0
