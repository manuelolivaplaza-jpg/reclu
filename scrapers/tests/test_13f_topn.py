"""Corte top_n del 13F sobre un XML falso. Sin red ni Supabase.

Correr: python -m pytest scrapers/tests/test_13f_topn.py
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sec13f import (  # noqa: E402
    FUNDS,
    TOP_N,
    parse_infotable,
    resolve_top_n,
)

NS = "http://www.sec.gov/edgar/document/thirteenf/informationtable"
SCRAPERS = Path(__file__).resolve().parents[1]


def _xml(rows: list[tuple[str, str, int, int]]) -> str:
    body: list[str] = []
    for issuer, cusip, value, shares in rows:
        body.append(
            "<infoTable>"
            f"<nameOfIssuer>{issuer}</nameOfIssuer>"
            f"<cusip>{cusip}</cusip>"
            f"<value>{value}</value>"
            "<shrsOrPrnAmt>"
            f"<sshPrnamt>{shares}</sshPrnamt>"
            "<sshPrnamtType>SH</sshPrnamtType>"
            "</shrsOrPrnAmt>"
            "</infoTable>"
        )
    return f'<informationTable xmlns="{NS}">{"".join(body)}</informationTable>'


def _fund_slug() -> dict[str, str]:
    tree = ast.parse((SCRAPERS / "load_13f.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "FUND_SLUG":
                parsed = ast.literal_eval(node.value)
                assert isinstance(parsed, dict)
                return parsed
    raise AssertionError("FUND_SLUG no encontrado")


def test_top_n_se_queda_con_los_mayores_por_valor() -> None:
    xml = _xml(
        [
            ("TINY CO", "111111111", 1, 1),
            ("BIG CO", "222222222", 500, 50),
            ("MID CO", "333333333", 100, 10),
            ("SMALL CO", "444444444", 10, 2),
        ]
    )
    rows = parse_infotable(xml, filing_date="2026-08-12", top_n=2)
    assert [row["issuer"] for row in rows] == ["BIG CO", "MID CO"]
    assert rows[0]["as_of"] == "2026-08-12"
    # El peso es sobre el libro completo (611), no se renormaliza al corte.
    assert rows[0]["weight"] == round(500 / 611 * 100, 2)
    assert rows[1]["weight"] == round(100 / 611 * 100, 2)
    assert "TINY CO" not in {row["issuer"] for row in rows}


def test_fusiona_emisor_duplicado_antes_del_corte() -> None:
    xml = _xml(
        [
            ("ALPHA", "555555555", 100, 10),
            ("BETA", "666666666", 150, 15),
            ("ALPHA", "555555555", 100, 5),
            ("GAMMA", "777777777", 10, 1),
        ]
    )
    rows = parse_infotable(xml, filing_date="2026-08-14", top_n=1)
    assert len(rows) == 1
    assert rows[0]["issuer"] == "ALPHA"
    assert rows[0]["value"] == 200
    assert rows[0]["shares"] == 15


def test_sin_top_n_conserva_el_libro_y_el_orden() -> None:
    xml = _xml(
        [
            ("TINY CO", "111111111", 1, 1),
            ("BIG CO", "222222222", 500, 50),
        ]
    )
    rows = parse_infotable(xml, filing_date="2026-08-11", top_n=None)
    assert [row["issuer"] for row in rows] == ["TINY CO", "BIG CO"]
    assert rows[1]["weight"] == round(500 / 501 * 100, 2)


def test_corte_de_cincuenta_sobre_sesenta_lineas() -> None:
    rows_in = [(f"ISSUER {i:02d}", f"{i:09d}", i, i) for i in range(1, 61)]
    rows = parse_infotable(_xml(rows_in), filing_date="2026-06-30", top_n=50)
    assert len(rows) == 50
    assert rows[0]["issuer"] == "ISSUER 60"
    assert rows[-1]["issuer"] == "ISSUER 11"
    kept = {row["issuer"] for row in rows}
    assert "ISSUER 01" not in kept
    assert "ISSUER 10" not in kept


def test_top_n_por_fondo_y_slugs() -> None:
    assert resolve_top_n("Norges Bank", None) == 50
    assert resolve_top_n("Swiss National Bank", None) == 50
    assert resolve_top_n("Gates Foundation Trust", None) is None
    assert resolve_top_n("Icahn Carl C", None) is None
    assert resolve_top_n("Norges Bank", 10) == 10
    assert TOP_N == {"Norges Bank": 50, "Swiss National Bank": 50}

    assert FUNDS["Norges Bank"] == 1374170
    assert FUNDS["Swiss National Bank"] == 1582202
    assert FUNDS["Gates Foundation Trust"] == 1166559
    assert FUNDS["Icahn Carl C"] == 921669
    # Ya existían: el alta de F25 no los pisa.
    assert FUNDS["Duquesne"] == 1536411
    assert FUNDS["Soros Fund Management"] == 1029160

    slugs = _fund_slug()
    assert slugs["Norges Bank"] == "norges-bank-13f"
    assert slugs["Swiss National Bank"] == "snb-13f"
    assert slugs["Gates Foundation Trust"] == "gates-foundation-13f"
    assert slugs["Icahn Carl C"] == "icahn-13f"
    assert slugs["Duquesne"] == "duquesne-13f"
    assert slugs["Soros Fund Management"] == "soros-13f"
