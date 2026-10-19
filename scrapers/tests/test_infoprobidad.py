"""Tests de InfoProbidad agregado por RUT. Sin red ni base de datos.

Correr: uv run --with pytest python -m pytest scrapers/tests/test_infoprobidad.py -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from infoprobidad import (  # noqa: E402
    MIN_AUTORIDADES,
    PREDICADOS_PROHIBIDOS,
    alertas_umbral,
    campos_publicos,
    consulta_publica,
    consulta_sin_datos_personales,
    holdings_desde_agregado,
    load_rut_map,
    parse_bindings,
    aplicar_simbolos,
    EmpresaAgregada,
)

FIXTURE = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "infoprobidad"
    / "infoprobidad_top_rut_ejemplo.json"
)


def _fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_consulta_sin_predicados_personales():
    query = consulta_publica()
    assert consulta_sin_datos_personales(query)
    bajos = query.lower()
    for pred in PREDICADOS_PROHIBIDOS:
        assert pred.lower() not in bajos
    assert "rutjuridica" in bajos
    assert "tieneaccionderecho" in bajos
    assert "ip:nombre" not in bajos
    assert "apellidopaterno" not in bajos
    assert "sum(?v)" in bajos


def test_fixture_agrupa_por_rut_y_descarta_cero():
    rows = parse_bindings(_fixture())
    ruts = [row.rut for row in rows]
    assert len(ruts) == len(set(ruts))
    assert "0" not in ruts
    assert "76072469" not in ruts  # Cruzados
    assert "76838140" not in ruts  # Azul Azul
    assert "99589230" not in ruts  # Blanco y Negro
    assert rows[0].rut == "82878900"
    assert rows[0].autoridades == 122
    assert rows[0].ultima_declaracion == "2026-10-08"
    latam = next(row for row in rows if row.rut == "89862200")
    assert latam.nombre == "LATAM"
    assert latam.autoridades == 106
    assert latam.ultima_declaracion == "2026-10-07"


def test_mismo_rut_queda_en_una_fila():
    data = {
        "results": {"bindings": [
            {"rut": {"value": "89862200"}, "nombre": {"value": "LATAM"},
             "declarantes": {"value": "10"}, "ultima": {"value": "2026-01-01"}},
            {"rut": {"value": "89.862.200"}, "nombre": {"value": "LATAM AIRLINES"},
             "declarantes": {"value": "106"}, "ultima": {"value": "2026-10-07T00:00:00"}},
            {"rut": {"value": "0"}, "nombre": {"value": "SIN RUT"},
             "declarantes": {"value": "99"}, "ultima": {"value": "2026-10-01"}},
        ]},
    }
    rows = parse_bindings(data)
    assert len(rows) == 1
    assert rows[0].rut == "89862200"
    assert rows[0].autoridades == 106
    assert rows[0].nombre == "LATAM AIRLINES"


def test_holdings_solo_con_symbol_y_peso_por_autoridades():
    rows = aplicar_simbolos(parse_bindings(_fixture()), load_rut_map())
    holdings = holdings_desde_agregado(rows)
    symbols = [h.symbol for h in holdings]
    assert "LTM" in symbols
    assert "CHILE" in symbols
    assert "CMPC" in symbols
    assert all(h.currency == "CLP" for h in holdings)
    # La cooperativa no cotiza: no entra a la canasta.
    assert all(h.symbol != "82878900" for h in holdings)
    assert abs(sum(h.weight for h in holdings) - 100) < 0.6
    ltm = next(h for h in holdings if h.symbol == "LTM")
    chile = next(h for h in holdings if h.symbol == "CHILE")
    assert ltm.weight > chile.weight


def test_alerta_umbral_sin_datos_personales():
    prev = {"89862200": 100, "97004000": 68}
    actuales = [
        EmpresaAgregada("89862200", "LATAM", 106, None, "2026-10-07", "LTM"),
        EmpresaAgregada("97004000", "Banco de Chile", 70, None, "2026-10-07", "CHILE"),
    ]
    alerts = alertas_umbral(prev, actuales)
    assert len(alerts) == 1
    alert = alerts[0]
    assert alert["type"] == "threshold"
    assert alert["title"] == "InfoProbidad: 106 autoridades declaran acciones de LATAM"
    payload = alert["payload"]
    assert payload["source_url"] == "https://datos.cplt.cl/sparql"
    assert payload["licencia"] == "CC BY 4.0"
    assert payload["rut"] == "89862200"
    blob = json.dumps(alert)
    for pred in PREDICADOS_PROHIBIDOS:
        assert pred not in blob
    assert "apellido" not in blob.lower()


def test_bajo_min_autoridades_oculta_valor_fecha_y_no_alerta():
    assert MIN_AUTORIDADES == 3
    data = {
        "results": {"bindings": [
            {"rut": {"value": "11111111"}, "nombre": {"value": "PEQUEÑA"},
             "declarantes": {"value": "2"}, "ultima": {"value": "2026-10-01"},
             "valor": {"value": "5000000"}},
            {"rut": {"value": "22222222"}, "nombre": {"value": "TRES"},
             "declarantes": {"value": "3"}, "ultima": {"value": "2026-10-02"},
             "valor": {"value": "9000000"}},
        ]},
    }
    rows = parse_bindings(data)
    pequena = next(row for row in rows if row.rut == "11111111")
    assert pequena.autoridades == 2
    assert pequena.valor_declarado_clp is None
    assert pequena.ultima_declaracion is None
    tres = next(row for row in rows if row.rut == "22222222")
    assert tres.autoridades == 3
    assert tres.valor_declarado_clp == 9000000
    assert tres.ultima_declaracion == "2026-10-02"
    assert campos_publicos(1, 1000.0, "2026-10-01") == (None, None)
    assert campos_publicos(3, 1000.0, "2026-10-02") == (1000.0, "2026-10-02")

    # umbral=1 haría saltar a PEQUEÑA (2-1). El piso de reidentificación la deja fuera.
    actuales = [
        EmpresaAgregada("11111111", "PEQUEÑA", 2, 5_000_000, "2026-10-01", None),
        EmpresaAgregada("22222222", "TRES", 8, 9_000_000, "2026-10-02", None),
    ]
    alerts = alertas_umbral({"11111111": 1, "22222222": 3}, actuales, umbral=1)
    assert [alert["payload"]["rut"] for alert in alerts] == ["22222222"]
    blob = json.dumps(alerts)
    assert "PEQUEÑA" not in blob
    assert "2026-10-01" not in blob
    assert "5000000" not in blob
