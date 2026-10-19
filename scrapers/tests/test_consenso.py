"""Consenso de corredoras: solo carteras completas. Sin red y sin Supabase.

Correr: python -m pytest scrapers/tests/test_consenso.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from corredoras_cl import (  # noqa: E402
    Posicion,
    build_consenso,
    cargar_carteras,
    referencia_parciales,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "corredoras_cl"
CARTERAS = FIXTURES / "carteras_oct_2026.json"


def _carteras() -> list[dict]:
    return json.loads(CARTERAS.read_text(encoding="utf-8"))["carteras"]


def test_cargar_carteras_lee_el_corte_de_octubre() -> None:
    carteras = cargar_carteras(CARTERAS)
    assert len(carteras) == 4
    assert [c["corredora"] for c in carteras][:2] == [
        "BICE Inversiones",
        "MBI Corredores de Bolsa",
    ]
    assert carteras[2]["corredora"].startswith("Ita")
    assert carteras[3]["corredora"].startswith("Credicorp")


def test_consenso_es_el_promedio_de_bice_y_mbi() -> None:
    consenso = build_consenso(_carteras())
    pesos = {posicion.symbol: posicion.weight for posicion in consenso}

    assert pesos == {
        "LTM": 20.0,
        "SQM-B": 17.5,
        "FALABELLA": 10.0,
        "COPEC": 10.0,
        "ITAUCL": 10.0,
        "CENCOMALLS": 10.0,
        "CHILE": 7.5,
        "BSANTANDER": 6.25,
        "BCI": 5.0,
        "ENELCHILE": 3.75,
    }
    assert abs(sum(pesos.values()) - 100) < 0.011


def test_consenso_no_mezcla_carteras_parciales() -> None:
    consenso = build_consenso(_carteras())
    simbolos = {posicion.symbol for posicion in consenso}

    # Solo aparecen en Itau/Credicorp (parciales): no deben entrar.
    assert "COLBUN" not in simbolos
    assert "SALFACORP" not in simbolos
    assert "PARAUCO" not in simbolos
    assert "ANDINA-B" not in simbolos
    # BSANTANDER viene solo de BICE (12,5%), no del 25% parcial de Itau.
    assert next(p.weight for p in consenso if p.symbol == "BSANTANDER") == 6.25


def test_una_cartera_parcial_no_altera_el_promedio() -> None:
    carteras = _carteras()
    original = {p.symbol: p.weight for p in build_consenso(carteras)}

    # Itau casi duplica BSANTANDER y agrega COLBUN. Como es parcial, no mueve nada.
    carteras[-2]["pesos_parciales"]["BSANTANDER"] = 99.0
    carteras[-2]["pesos_parciales"]["COLBUN"] = 50.0
    despues = {p.symbol: p.weight for p in build_consenso(carteras)}

    assert despues == original


def test_sin_carteras_completas_no_hay_consenso() -> None:
    carteras = [c for c in _carteras() if c.get("completa") is False]
    assert build_consenso(carteras) == []


def test_referencia_parciales_solo_lista_las_incompletas() -> None:
    referencia = referencia_parciales(_carteras())

    assert [fila["corredora"] for fila in referencia][0].startswith("Ita")
    assert referencia[0]["corredora"].endswith("Corredores de Bolsa")
    assert referencia[1]["corredora"].startswith("Credicorp")
    itau = referencia[0]
    assert itau["fecha"] == "2026-10"
    assert itau["pesos"]["BSANTANDER"] == 25.0
    assert "SQM-B" in itau["pesos"]
    assert itau["fuente"].startswith("https://www.alfasybetas.cl/")


def test_renta4_y_btg_quedan_fuera_aunque_se_marcaran_completas() -> None:
    carteras = [
        {
            "corredora": "Renta 4 Corredores de Bolsa",
            "completa": True,
            "pesos": {"FALABELLA": 100.0},
        },
        {
            "corredora": "BTG Pactual Chile",
            "completa": True,
            "pesos": {"COPEC": 100.0},
        },
        {
            "corredora": "BICE Inversiones",
            "completa": True,
            "pesos": {"FALABELLA": 50.0, "COPEC": 50.0},
        },
    ]

    consenso = build_consenso(carteras)
    assert {p.symbol for p in consenso} == {"FALABELLA", "COPEC"}
    assert all(p.weight == 50.0 for p in consenso)


def test_consenso_ordena_por_peso_y_resuelve_nombres() -> None:
    consenso = build_consenso(_carteras())

    assert all(isinstance(posicion, Posicion) for posicion in consenso)
    assert [p.weight for p in consenso] == sorted(
        (p.weight for p in consenso), reverse=True
    )
    assert next(p.name for p in consenso if p.symbol == "LTM") == "LATAM Airlines"
    assert next(p.name for p in consenso if p.symbol == "BSANTANDER") == (
        "Banco Santander"
    )


def test_estructura_del_json_sigue_siendo_la_esperada() -> None:
    carteras = _carteras()
    completas = [c for c in carteras if c.get("completa") is True]
    parciales = [c for c in carteras if c.get("completa") is False]

    assert len(completas) == 2
    assert len(parciales) == 2
    assert all(abs(sum(c["pesos"].values()) - 100) < 0.011 for c in completas)
