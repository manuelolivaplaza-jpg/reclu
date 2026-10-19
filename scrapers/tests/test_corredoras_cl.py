"""Parsers de carteras BICE y MBI. Sin red y sin Supabase.

Correr: python -m pytest scrapers/tests/test_corredoras_cl.py
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from corredoras_cl import (  # noqa: E402
    BICE_PDF_URL,
    BiceCarteraAdapter,
    MbiCarteraAdapter,
    PdfReader,
    correr,
    fecha_bice,
    fecha_mbi,
    nota_cartera_mbi,
    parse_bice,
    parse_mbi,
    pdf_de_nota_mbi,
    texto_pdf,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "corredoras_cl"


def _texto(nombre: str) -> str:
    return (FIXTURES / nombre).read_text(encoding="utf-8")


def _cartera(prefijo: str) -> dict:
    data = json.loads(_texto("carteras_oct_2026.json"))
    return next(fila for fila in data["carteras"] if fila["corredora"].startswith(prefijo))


def test_bice_suma_100_con_los_pesos_del_json() -> None:
    posiciones = parse_bice(_texto("bice_cartera.txt"))
    esperado = _cartera("BICE")["pesos"]

    assert len(posiciones) == 7
    assert abs(sum(p.weight for p in posiciones) - 100) < 0.011
    obtenido = {p.symbol: p.weight for p in posiciones}
    assert set(obtenido) == set(esperado)
    for simbolo, peso in esperado.items():
        assert abs(obtenido[simbolo] - peso) < 0.011
    assert "PARAUCO" not in obtenido


def test_alias_de_nombres_a_nemotecnicos() -> None:
    texto = "\n".join(
        [
            "Chile 15,0% =",
            "Santander 12,5% ↓",
            "Latam 20,0% ↑",
            "Enel Chile 7,5% ↓",
        ]
    )
    obtenido = {p.symbol: p.weight for p in parse_bice(texto)}
    assert obtenido == {
        "CHILE": 15.0,
        "BSANTANDER": 12.5,
        "LTM": 20.0,
        "ENELCHILE": 7.5,
    }


def test_mbi_cinco_acciones_al_veinte() -> None:
    posiciones = parse_mbi(_texto("mbi_cartera_octubre_2026.txt"))
    esperado = _cartera("MBI")["pesos"]

    assert len(posiciones) == 5
    assert {p.symbol for p in posiciones} == set(esperado)
    for posicion in posiciones:
        assert posicion.weight == 20.0
    assert abs(sum(p.weight for p in posiciones) - 100) < 0.011


def test_pdf_local_calza_con_el_texto() -> None:
    """pypdf ordena la ficha de MBI como Recomendación / nemotécnico / acción."""
    if PdfReader is None:
        pytest.skip("pypdf no instalado")
    bice = parse_bice(texto_pdf((FIXTURES / "bice_cartera.pdf").read_bytes()))
    mbi = parse_mbi(texto_pdf((FIXTURES / "mbi_cartera_octubre_2026.pdf").read_bytes()))
    assert {p.symbol: p.weight for p in bice} == _cartera("BICE")["pesos"]
    assert len(mbi) == 5
    assert {p.symbol for p in mbi} == set(_cartera("MBI")["pesos"])
    assert all(p.weight == 20.0 for p in mbi)


def test_informe_de_santander_no_es_cartera() -> None:
    assert parse_mbi(_texto("mbi_informe_banco_santander_oct_2026.txt")) == []


def test_fechas_de_octubre_2026() -> None:
    assert fecha_bice(_texto("bice_cartera.txt")) == date(2026, 10, 5)
    assert fecha_mbi(_texto("mbi_cartera_octubre_2026.txt")) == date(2026, 10, 5)


def test_mbi_descubre_la_nota_de_cartera_y_no_el_informe() -> None:
    html = """
    <a href="/publicaciones/bsantander-mas-alla-de-la-inflacion-una-historia-de-rentabilidad">x</a>
    <a href="/publicaciones/cartera-recomendada-octubre">Cartera</a>
    """
    assert nota_cartera_mbi(html) == "/publicaciones/cartera-recomendada-octubre"
    nota = (
        '<a href="/static/uploads/docs/20261005185815_Cartera_Octubre.pdf'
        '?v=1791226695">Descargar archivo adjunto</a>'
    )
    assert pdf_de_nota_mbi(nota) == (
        "/static/uploads/docs/20261005185815_Cartera_Octubre.pdf?v=1791226695"
    )


def test_dry_run_no_escribe(monkeypatch: pytest.MonkeyPatch) -> None:
    texto_bice = _texto("bice_cartera.txt")
    texto_mbi = _texto("mbi_cartera_octubre_2026.txt")
    monkeypatch.setattr(BiceCarteraAdapter, "fetch_raw", lambda self: texto_bice)
    monkeypatch.setattr(MbiCarteraAdapter, "fetch_raw", lambda self: texto_mbi)

    def prohibido() -> None:
        raise AssertionError("get_db no debe llamarse en --dry-run")

    monkeypatch.setattr("base.get_db", prohibido)

    resultados = correr(None, True)

    assert [fila["source"] for fila in resultados] == ["bice_cartera", "mbi_cartera"]
    assert all(fila["dry_run"] is True for fila in resultados)
    assert all(fila["status"] == "ok" for fila in resultados)
    assert resultados[0]["holdings"] == 7
    assert resultados[0]["source_url"] == BICE_PDF_URL
    assert resultados[0]["as_of"] == "2026-10-05"
    assert resultados[1]["holdings"] == 5
    assert resultados[1]["as_of"] == "2026-10-05"
