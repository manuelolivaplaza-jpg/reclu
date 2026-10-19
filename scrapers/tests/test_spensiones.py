"""Tests del Cuadro 14 (Superintendencia de Pensiones). Sin red ni DB.

Correr:  uv run --with httpx --with pytest --with supabase python -m pytest scrapers/tests -q
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from spensiones import (  # noqa: E402
    buscar_periodo_publicado,
    es_cusip,
    filas_a_holdings,
    parse_cuadro14,
    payload_alerta,
    peso_porcentual,
    previous_para_alerta,
    respuesta_publicada,
    url_cuadro14,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "scrapers" / "data" / "afp" / "afp_modelo_acciones_cl_202605.json"
MIGRACION = ROOT / "supabase" / "migrations" / "020_afp_carteras.sql"
_CUSIP_FICTICIO = "912796TZ6"


def _num_cl(valor: float) -> str:
    texto = f"{valor:.2f}"
    entero, dec = texto.split(".")
    return f"{entero},{dec}"


def _fila_html(nemo: str, emisor: str, tipo: str, total: float, pct_f: float, pct_e: float, extra: str) -> str:
    celdas = [
        nemo,
        emisor,
        tipo,
        extra,
        "0",
        "0",
        "0",
        "0",
        "0",
        _num_cl(total),
        _num_cl(pct_f),
        _num_cl(pct_e),
    ]
    return "<tr>" + "".join(f"<td>{c}</td>" for c in celdas) + "</tr>"


def _cuadro_desde_fixture(data: dict) -> str:
    filas = [
        _fila_html(
            f["nemo"],
            f["emisor"],
            f["tipo"],
            f["total_mmusd"],
            f["pct_fondo"],
            f["pct_emisor"],
            _CUSIP_FICTICIO,
        )
        for f in data["filas"]
    ]
    # Fila TOTAL con miles: no debe entrar en la suma.
    total = (
        "<tr><td>TOTAL</td><td>CARTERA</td><td></td><td>0</td><td>0</td>"
        "<td>0</td><td>0</td><td>0</td><td>0</td><td>9.999,99</td>"
        "<td>100,00</td><td>0,00</td></tr>"
    )
    corta = "<tr><td>CORTA</td><td>NO</td><td>N</td></tr>"
    cusip = _fila_html(_CUSIP_FICTICIO, "EMISOR QUE NO SE PUBLICA", "N", 10, 0.1, 0.1, "0")
    return (
        "<html><body><p>CUADRO 14. Diversificación. Al 29-05-2026</p><table>"
        + "".join(filas)
        + total
        + corta
        + cusip
        + "</table></body></html>"
    )


def test_parse_cuadro14_fixture_202605():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    fecha, filas = parse_cuadro14(_cuadro_desde_fixture(data))
    assert fecha == "29-05-2026"
    assert len(filas) in (41, 42)
    assert len(filas) == len(data["filas"])
    assert len({f["emisor"] for f in filas}) == 41
    total = sum(f["total_mmusd"] for f in filas)
    assert abs(total - 2284.6) < 0.2
    assert filas[0]["nemo"] == "LTM"
    assert "Â" not in filas[0]["nemo"]
    assert _CUSIP_FICTICIO not in json.dumps(filas)
    assert all(not es_cusip(f["nemo"]) for f in filas)


def test_respuesta_de_363_bytes_no_esta_publicada():
    assert respuesta_publicada(b"x" * 363) is False
    assert respuesta_publicada(b"CUADRO" + b"x" * (363 - 6)) is False
    assert respuesta_publicada("x" * 363) is False
    publicada = "CUADRO 14 " + ("x" * 1200)
    assert respuesta_publicada(publicada) is True
    assert respuesta_publicada("CUADRO" + ("x" * (1000 - 6))) is False


def test_busca_hacia_atras_hasta_el_mes_publicado():
    def leer(fecpro: str) -> bytes:
        if fecpro == "202605":
            return ("CUADRO 14 " + ("x" * 1200)).encode("ascii")
        return b"x" * 363

    assert buscar_periodo_publicado(leer, date(2026, 10, 19)) == "202605"


def test_pesos_y_alerta_desde_el_fixture():
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    _, filas = parse_cuadro14(_cuadro_desde_fixture(data))
    holdings = filas_a_holdings(filas, "29-05-2026", "202605")
    assert holdings[0].symbol == "LTM"
    assert holdings[0].currency == "CLP"
    assert holdings[0].asset_class == "equity"
    assert holdings[0].as_of == date(2026, 5, 29)
    assert 13.9 <= holdings[0].weight <= 14.0
    assert any(h.symbol == "MULTI X" for h in holdings)
    assert abs(sum(h.weight for h in holdings) - 100) < 0.6
    total = sum(f["total_mmusd"] for f in filas)
    assert holdings[0].weight == peso_porcentual(filas[0]["total_mmusd"], total)
    assert url_cuadro14("202605") == data["fuente"]

    previo, tipo = previous_para_alerta(None, holdings[0].weight)
    assert previo == 0
    assert tipo == "new_trade"
    assert previous_para_alerta(10.0, 10.4)[1] is None
    assert previous_para_alerta(10.0, 11.2) == (10.0, "weight_change")

    alerta = payload_alerta(
        symbol="LTM",
        name="LATAM AIRLINES GROUP S.A.",
        weight=holdings[0].weight,
        previous_weight=0,
        source_url=data["fuente"],
    )
    assert alerta["type"] == "new_trade"
    assert alerta["payload"]["source_url"] == data["fuente"]
    assert _CUSIP_FICTICIO not in json.dumps(alerta)


def test_migracion_020_es_idempotente_y_sin_cusip():
    sql = MIGRACION.read_text(encoding="utf-8").lower()
    assert "on conflict (slug) do nothing" in sql
    assert "on conflict (portfolio_id, symbol, as_of) do nothing" in sql
    assert "afp-modelo-acciones-cl" in sql
    assert "no se toca afp-consenso-chile" in sql
    assert "delete " not in sql
    assert "previous_weight" in sql
    assert not re.search(r"\b[0-9a-z]{8}[0-9]\b", sql)
