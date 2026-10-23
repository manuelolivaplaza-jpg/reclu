import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import event_series as es  # noqa: E402
import performance  # noqa: E402

D = ["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07"]


def test_sin_posicion_antes_de_la_primera_entrada():
    prices = {"A": dict(zip(D, [10, 20, 20, 20])), "B": dict(zip(D, [5, 5, 5, 10]))}
    s = es.compute_event_series([{"ticker": "B", "entry": "2025-01-03", "exit": None, "side": 1}], prices)
    # el salto de A no cuenta; B entra el 03 y sube 100% el 07
    assert s[0] == {"date": "2025-01-03", "value_pct": 0.0}
    assert s[-1]["value_pct"] == 100.0


def test_dollar_pondera_por_valor_y_corto_invierte():
    prices = {"A": dict(zip(D, [10, 11, 11, 11]))}
    long_ = es.compute_event_series([{"ticker": "A", "entry": "2025-01-02", "exit": None, "side": 1}], prices)
    short = es.compute_event_series([{"ticker": "A", "entry": "2025-01-02", "exit": None, "side": -1}], prices, "equal")
    assert long_[1]["value_pct"] == 10.0
    assert short[1]["value_pct"] == -10.0


def test_salida_cierra_posicion():
    prices = {"A": dict(zip(D, [10, 11, 22, 44]))}
    s = es.compute_event_series([{"ticker": "A", "entry": "2025-01-02", "exit": "2025-01-03", "side": 1}], prices, "equal")
    assert s[-1]["value_pct"] == 10.0  # después de salir queda plano


def test_entrada_en_fin_de_semana_usa_siguiente_dia():
    prices = {"A": dict(zip(D, [10, 10, 12, 12]))}
    s = es.compute_event_series([{"ticker": "A", "entry": "2025-01-04", "exit": None, "side": 1}], prices)
    assert s[0]["date"] == "2025-01-06" and s[-1]["value_pct"] == 0.0


def test_performance_no_proyecta_eventos():
    assert {"trump-dice", "musk-dice", "inverse-cramer-real"} <= performance.EVENT_REAL_SLUGS
