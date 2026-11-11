"""D75: inicio con cobertura de peso y simbolos que empiezan a cotizar tarde.

(a) la serie parte en el primer dia en que los simbolos con precio cubren al
    menos MIN_COVERAGE (60 %) del peso de la primera foto, aunque un holding
    empiece a cotizar 200 dias despues;
(b) ese holding entra con rebalanceo al cierre de su primer dia con precio y
    sin salto: la variacion de ese dia es la de la canasta anterior;
(c) sin simbolos tardios el resultado es el de siempre (misma foto, mismo
    rebalanceo, primeros dias y niveles identicos).
"""

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import chain  # noqa: E402

D0 = date(2026, 1, 5)  # lunes


def day(n: int) -> str:
    return (D0 + timedelta(days=n)).isoformat()


def test_serie_parte_con_60_por_ciento_de_cobertura():
    # AAA + BBB = 80 % del peso cotizan desde el dia 0; TARDE (20 %) recien el
    # dia 200. Con max(primer precio) la serie entera empezaba el dia 200
    # (Duquesne/Soros quedaban con 11 puntos, Renaissance con 12).
    prices = {
        "AAA": [(day(n), 100.0) for n in range(0, 221)],
        "BBB": [(day(n), 50.0) for n in range(0, 221)],
        "TARDE": [(day(n), 200.0) for n in range(200, 221)],
    }
    out = chain.chain_series([("2025-12-01", {"AAA": 50, "BBB": 30, "TARDE": 20})], prices)
    assert out[0] == (day(0), 1.0)
    assert out[199][0] == day(199)  # 200 dias de serie antes de que TARDE cotice
    assert out[200] == (day(200), 1.0)  # entra al cierre, sin escalon
    assert out[-1][0] == day(220)
    assert len(out) == 221


def test_simbolo_tardio_entra_sin_salto_y_aporta_desde_el_cierre():
    # 70 % AAA desde el dia 0, 30 % TARDE desde el dia 10. El dia 10 la serie
    # solo puede moverse con AAA (+10 %): si TARDE entrara en la canasta de ese
    # dia, el nivel seria 1.07 (peso redistribuido) y el salto aparecia aqui.
    prices = {
        "AAA": [(day(n), 100.0) for n in range(0, 10)] + [(day(10), 110.0), (day(11), 110.0)],
        "TARDE": [(day(10), 200.0), (day(11), 220.0)],
    }
    levels = dict(chain.chain_series([("2025-12-01", {"AAA": 70, "TARDE": 30})], prices))
    assert list(levels)[0] == day(0)
    assert len(levels) == 12
    assert levels[day(9)] == 1.0
    assert levels[day(10)] == pytest.approx(1.10)
    # la variacion del dia de entrada es exactamente la de la canasta anterior
    assert levels[day(10)] / levels[day(9)] == pytest.approx(110.0 / 100.0)
    # y desde el cierre TARDE ya pesa 30 %: 1.10 * (0.7 * 1 + 0.3 * 220/200)
    assert levels[day(11)] / levels[day(10)] == pytest.approx(0.7 + 0.3 * 220.0 / 200.0)
    assert levels[day(11)] == pytest.approx(1.133)
    assert chain.daily_jumps(chain.to_pct(list(levels.items()))) == []


def test_todos_cotizan_desde_el_inicio_sin_cambios():
    # Sin tardios: primer dia = primer precio de la foto y niveles de siempre.
    prices = {
        "X": [(day(0), 100.0), (day(1), 110.0), (day(2), 121.0), (day(3), 121.0)],
        "Y": [(day(0), 50.0), (day(1), 50.0), (day(2), 55.0), (day(3), 66.0)],
    }
    pts = chain.to_pct(chain.chain_series([("2025-12-01", {"X": 60, "Y": 40})], prices))
    assert [p["date"] for p in pts] == [day(n) for n in range(4)]
    # 0.6 * P(X)/100 + 0.4 * P(Y)/50
    assert [p["value_pct"] for p in pts] == [0.0, 6.0, 16.6, 25.4]


def test_rebalanceo_de_foto_intacto_cuando_todos_cotizan():
    prices = {
        "X": [(day(0), 100.0), (day(1), 110.0), (day(2), 110.0), (day(3), 121.0)],
        "Z": [(day(0), 50.0), (day(1), 50.0), (day(2), 60.0), (day(3), 66.0)],
    }
    snaps = [("2025-12-01", {"X": 100}), (day(2), {"Z": 100})]
    pts = chain.to_pct(chain.chain_series(snaps, prices))
    vals = {p["date"]: p["value_pct"] for p in pts}
    assert vals[day(1)] == 10.0
    assert vals[day(2)] == 10.0  # sin salto al entrar la foto nueva
    assert vals[day(3)] == 21.0  # 1.10 * 66/60
    assert chain.daily_jumps(pts) == []


def test_sin_cobertura_suficiente_usa_el_primer_precio():
    # Medio libro nunca tuvo precios: jamas se llega al 60 %, pero la serie no
    # se pierde; parte en el primer dia con cualquier precio.
    prices = {"AAA": [(day(0), 100.0), (day(1), 101.0)]}
    out = chain.chain_series([("2025-12-01", {"AAA": 50, "SINPRECIO": 50})], prices)
    assert [d for d, _ in out] == [day(0), day(1)]
