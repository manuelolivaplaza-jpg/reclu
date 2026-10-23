import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import etf_series  # noqa: E402
import performance  # noqa: E402


def p(d, v):
    return {"date": d, "value_pct": v}


def test_sin_real_devuelve_toda_la_proyeccion():
    est = [p("2025-01-01", 0.0), p("2025-01-02", 10.0)]
    assert performance.stitch_estimated(est, []) == est


def test_con_real_solo_fechas_previas_y_empalma():
    est = [p("2024-01-01", 0.0), p("2024-06-01", 10.0), p("2025-01-01", 21.0)]
    real = [p("2024-06-01", 0.0), p("2025-01-01", 5.0)]
    out = performance.stitch_estimated(est, real)
    assert [o["date"] for o in out] == ["2024-01-01"]
    # nivel 1.0 escalado por 1.0/1.1 -> -9.0909%
    assert round(out[0]["value_pct"], 2) == -9.09


def test_nunca_devuelve_fechas_reales():
    est = [p("2025-01-01", 0.0), p("2025-02-01", 3.0)]
    real = [p("2024-01-01", 0.0)]
    assert performance.stitch_estimated(est, real) == []


def test_sin_real_empalma_con_estimado_existente():
    est = [p("2025-06-01", 0.0), p("2025-07-01", 10.0)]
    existing = [p("2024-10-01", 0.0), p("2025-06-01", 20.0)]
    out = performance.stitch_estimated(est, [], existing)
    assert out[0]["value_pct"] == 20.0
    assert out[1]["value_pct"] == 32.0


def test_etf_rebase_y_mapa():
    s = etf_series.rebase([("2024-01-02", 50.0), ("2024-01-01", 40.0)])
    assert s == [p("2024-01-01", 0.0), p("2024-01-02", 25.0)]
    assert etf_series.ETF_TICKERS["arkk"] == "ARKK"
    assert etf_series.ETF_TICKERS["ibit"] == "IBIT"
    assert etf_series.ETF_TICKERS["nanc-etf"] == "NANC"
    assert "ibit" in performance.ETF_REAL_SLUGS


def test_save_real_marca_no_estimado():
    calls = []

    class Q:
        def __init__(self, op=None):
            self.op = op

        def delete(self):
            return Q("delete")

        def upsert(self, rows, on_conflict=None):
            calls.append(rows)
            return Q("upsert")

        def eq(self, *a):
            return self

        gte = lte = eq

        def execute(self):
            return None

    class DB:
        def table(self, name):
            return Q()

    n = etf_series.save_real(DB(), "pid", [p("2024-01-01", 0.0)])
    assert n == 1
    assert calls[0][0]["is_estimated"] is False
