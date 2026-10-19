"""Parser OGE 278-T. Sin red y sin base.

El parseo lee el texto ya extraído. El PDF oficial solo se baja si
RECLU_OGE_ONLINE=1.

Correr: uv run --with pytest python -m pytest scrapers/tests/test_oge_trump.py -q
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from oge_trump import (  # noqa: E402
    alerts_for_trades,
    classify_side,
    discover_pdf_urls,
    holdings_for_trades,
    parse_278t,
    signed_from_filename,
)

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "oge_trump_278t_2026-09-17.txt"
REPORT = (
    "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/"
    "0BDCCCE7DE13AEFA85258E8A002DE2B5/$FILE/Donald-J-Trump.09.17.2026-278T.pdf"
)


def _parse(text: str):
    return {
        row.line_no: row
        for row in parse_278t(
            text,
            report_url=REPORT,
            report_signed="2026-09-17",
            report_published="2026-10-08",
        )
    }


def _rows():
    return _parse(FIXTURE.read_text(encoding="utf-8"))


def test_index_link_and_filename_date():
    html = (
        '<a href="/201/Presiden.nsf/PAS+Index/ABC/$FILE/'
        'Donald-J-Trump.10.02.2026-278T.pdf">pdf</a>'
    )
    urls = discover_pdf_urls(html)
    assert len(urls) == 1
    assert urls[0].endswith("Donald-J-Trump.10.02.2026-278T.pdf")
    assert signed_from_filename(urls[0]) == "2026-10-02"


def test_ocr_side_words():
    assert classify_side("lourchaso") == "purchase"
    assert classify_side("IDUrchaSO") == "purchase"
    assert classify_side("I0urchase") == "purchase"
    assert classify_side("salo") == "sale"
    assert classify_side("sale") == "sale"


def test_fixture_meta_and_att():
    rows = _rows()
    meta = rows[381]
    assert meta.symbol == "META"
    assert meta.side == "purchase"
    assert meta.amount_min == 5_000_001
    assert meta.amount_max == 25_000_000
    assert meta.trans_date == "2026-08-21"
    assert meta.trans_date_uncertain is False
    assert meta.status == "pendiente"

    att = rows[382]
    assert att.symbol == "T"
    assert att.side == "purchase"
    assert att.trans_date_uncertain is True
    assert att.trans_date is None
    assert att.amount_min == 1_000_001
    assert att.amount_max == 5_000_000

    assert rows[383].symbol == "COP"
    assert rows[384].symbol == "ABT"
    assert rows[385].symbol == "NFLX"
    assert rows[386].symbol == "CVX"
    assert rows[384].side == "purchase"
    assert rows[385].amount_min == 1_000_001
    assert rows[57].trans_date_uncertain is True


def test_pending_rows_do_not_alert():
    rows = list(_rows().values())
    assert alerts_for_trades(rows) == []
    assert holdings_for_trades(rows) == []
    meta = _rows()[381]
    meta.status = "verificada"
    alerts = alerts_for_trades([meta])
    assert len(alerts) == 1
    assert alerts[0]["type"] == "new_trade"
    assert alerts[0]["title"].startswith("Trump compró META (US$")
    assert alerts[0]["payload"]["source_url"] == REPORT
    assert alerts[0]["payload"]["amount_min"] == 5_000_001
    assert alerts[0]["payload"]["report_published"] == "2026-10-08"


@pytest.mark.skipif(
    os.environ.get("RECLU_OGE_ONLINE") != "1",
    reason="descarga el PDF oficial solo con RECLU_OGE_ONLINE=1",
)
def test_pdf_oficial_descarga():
    """Baja el 278-T oficial a un temporal y compara las filas del fixture."""
    import httpx

    from oge_trump import extract_pdf_text

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "Donald-J-Trump.09.17.2026-278T.pdf"
        response = httpx.get(
            REPORT,
            headers={"User-Agent": "Mozilla/5.0 reclu-scraper/1.0"},
            timeout=60.0,
            follow_redirects=True,
        )
        assert response.status_code == 200
        assert response.content.startswith(b"%PDF")
        pdf_path.write_bytes(response.content)
        online = _parse(extract_pdf_text(pdf_path))

    fixture = _rows()
    assert fixture.keys() <= online.keys()
    for line_no, expected in fixture.items():
        got = online[line_no]
        assert got.symbol == expected.symbol
        assert got.side == expected.side
        assert got.description == expected.description
        assert got.trans_date == expected.trans_date
        assert got.trans_date_uncertain == expected.trans_date_uncertain
        assert got.amount_min == expected.amount_min
        assert got.amount_max == expected.amount_max
        assert got.status == expected.status
