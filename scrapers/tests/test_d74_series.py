"""D74: series encadenadas sin saltos falsos, filas viejas y Renta 4."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import chain  # noqa: E402
import performance  # noqa: E402
import reconstruct_history  # noqa: E402
from renta4 import Renta4Adapter  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures" / "renta4" / "carteras_junio_2026.txt"


def rows(d):
    return sorted(d.items())


def test_precio_relativo_no_mezcla_monedas():
    # 50/50: una accion en CLP (65.000) y otra en USD (24). Si la CLP cae 10 %
    # y la USD sube 10 %, la cartera queda plana. Con sum(w*precio) caia ~10 %.
    prices = {
        "SQM-B.SN": [("2026-01-01", 65000.0), ("2026-01-02", 58500.0)],
        "LTM": [("2026-01-01", 24.0), ("2026-01-02", 26.4)],
    }
    pts = chain.to_pct(chain.chain_series([("2025-12-01", {"SQM-B.SN": 50, "LTM": 50})], prices))
    assert pts[-1]["value_pct"] == 0.0


def test_feriado_forward_fill_sin_salto():
    # 18-sep feriado en Chile: la accion .SN no cotiza, la de EE.UU. si.
    prices = {
        "CHILE.SN": [("2026-09-17", 200.0), ("2026-09-21", 200.0)],
        "AAPL": [("2026-09-17", 100.0), ("2026-09-18", 101.0), ("2026-09-21", 100.0)],
    }
    pts = chain.to_pct(chain.chain_series([("2026-01-01", {"CHILE.SN": 50, "AAPL": 50})], prices))
    assert [p["date"] for p in pts] == ["2026-09-17", "2026-09-18", "2026-09-21"]
    assert pts[1]["value_pct"] == 0.5
    assert chain.daily_jumps(pts) == []


def test_rebalanceo_encadena_nav_continuo():
    # Foto 1 (100 % A) hasta el 03; foto 2 (100 % B) desde el cierre del 03.
    # B vale 10x A: con precios absolutos el cambio de cartera daba +900 %.
    prices = {
        "A": [("2026-08-12", 10.0), ("2026-08-13", 11.0), ("2026-08-14", 11.0), ("2026-08-17", 11.0)],
        "B": [("2026-08-12", 100.0), ("2026-08-13", 100.0), ("2026-08-14", 100.0), ("2026-08-17", 105.0)],
    }
    snaps = [("2026-05-15", {"A": 1.0}), ("2026-08-14", {"B": 1.0})]
    pts = chain.to_pct(chain.chain_series(snaps, prices))
    vals = {p["date"]: p["value_pct"] for p in pts}
    assert vals["2026-08-13"] == 10.0
    assert vals["2026-08-14"] == 10.0  # sin salto el dia de la presentacion
    assert vals["2026-08-17"] == 15.5  # 1.10 * 1.05
    assert chain.daily_jumps(pts) == []


def test_foto_repetida_no_rebalancea():
    prices = {"A": [("d1", 10.0), ("d2", 20.0), ("d3", 20.0)], "B": [("d1", 10.0), ("d2", 10.0), ("d3", 20.0)]}
    one = chain.chain_series([("d0", {"A": 1, "B": 1})], prices)
    two = chain.chain_series([("d0", {"A": 1, "B": 1}), ("d2", {"A": 5, "B": 5})], prices)
    assert one == two


def test_salto_real_se_mantiene():
    prices = {"X": [("2026-10-14", 100.0), ("2026-10-15", 70.0)]}
    pts = chain.to_pct(chain.chain_series([("2026-01-01", {"X": 1})], prices))
    assert chain.daily_jumps(pts) == [("2026-10-14", "2026-10-15", -30.0)]


def test_simbolo_sin_precio_al_inicio_queda_fuera_del_tramo():
    prices = {"A": [("d1", 10.0), ("d2", 11.0)], "NEW": [("d2", 5.0)]}
    out = chain.chain_series([("d0", {"A": 1, "NEW": 1})], prices)
    # la ventana parte cuando todos cotizan (no se inventa precio hacia atras)
    assert out == [("d2", 1.0)]


class _Q:
    def __init__(self, rows, log=None):
        self.rows, self.log = rows, log

    def __getattr__(self, name):
        def f(*a, **k):
            if self.log is not None:
                self.log.append((name, a))
            return self
        return f

    def range(self, *a):
        return self

    def execute(self):
        return type("R", (), {"data": self.rows})()


def _db(rows, log=None):
    return type("DB", (), {"table": lambda self, _t: _Q(rows, log)})()


HOLD = [
    {"symbol": "OLD", "weight": 50, "as_of": "2026-05-15", "exchange": None, "currency": "USD"},
    {"symbol": "AAA", "weight": 50, "as_of": "2026-05-15", "exchange": None, "currency": "USD"},
    {"symbol": "AAA", "weight": 100, "as_of": "2026-08-14", "exchange": None, "currency": "USD"},
]


def test_holdings_solo_foto_mas_reciente():
    # Antes OLD (vendida en la foto del 14-ago) seguia con 50 %.
    assert performance.get_portfolio_holdings(_db(HOLD), "x") == [("AAA", 100.0)]
    snaps = performance.get_holdings_snapshots(_db(HOLD), "x")
    assert [d for d, _ in snaps] == ["2026-05-15", "2026-08-14"]


def test_build_series_encadena_fotos(monkeypatch):
    monkeypatch.setattr(performance, "resolve_named_holdings", lambda h: h)
    from datetime import date, timedelta
    d = [(date.today() - timedelta(days=n)).isoformat() for n in (3, 2, 1)]
    px = {"OLD": [(d[0], 10.0), (d[1], 20.0), (d[2], 40.0)], "AAA": [(d[0], 10.0), (d[1], 10.0), (d[2], 11.0)]}
    hold = [dict(h) for h in HOLD]
    hold[2]["as_of"] = d[1]
    pts = performance.build_performance_series(_db(hold), "x", days=30, fetch=lambda s: px[s])
    # tramo 1 (50/50): +50 % al d1; tramo 2 (100 % AAA): *1.1 -> +65 %
    assert [p["value_pct"] for p in pts] == [0.0, 50.0, 65.0]


def test_borra_estimadas_viejas_dentro_del_tramo():
    series = [{"date": "2026-09-17", "value_pct": 1}, {"date": "2026-09-21", "value_pct": 2}]
    est = [
        {"date": "2026-09-18", "value_pct": -13, "is_estimated": True},
        {"date": "2026-09-19", "value_pct": -13, "is_estimated": False},
        {"date": "2026-09-30", "value_pct": 5, "is_estimated": True},
    ]
    assert performance.stale_estimated_dates(series, est) == ["2026-09-18"]
    log = []
    assert performance.prune_stale_estimated(_db([], log), "x", series, est) == 1
    assert ("eq", ("is_estimated", True)) in log


def test_reconstruct_13f_diario_sin_mirar_al_futuro():
    px = {
        "A": [("2026-05-15", 10.0), ("2026-06-30", 12.0), ("2026-08-14", 12.0), ("2026-08-17", 12.0)],
        "B": [("2026-05-15", 50.0), ("2026-06-30", 25.0), ("2026-08-14", 25.0), ("2026-08-17", 30.0)],
    }
    q = [("2026-05-15", [("A", 100.0), (None, 5.0)]), ("2026-08-14", [("B", 100.0)])]
    s = dict(reconstruct_history._chain_series(q, fetch=lambda sym: px[sym]))
    # 15-may a 14-ago rige A (+20 %); B solo desde el 14-ago (+20 % mas)
    assert s["2026-08-14"] == 120.0
    assert s["2026-08-17"] == 144.0


def test_renta4_moderada_y_ampliada_distintas():
    raw = FIX.read_text(encoding="utf-8")
    mod = dict(Renta4Adapter.parse_section(raw, "moderada"))
    amp = dict(Renta4Adapter.parse_section(raw, "moderada-ampliada"))
    assert mod == {"ANDINA-B": 7.5, "CENCOSUD": 12.5, "CHILE": 15.0, "FALABELLA": 12.5,
                   "LTM": 30.0, "MALLPLAZA": 10.0, "PARAUCO": 12.5}
    assert len(amp) == 9 and amp["BSANTANDER"] == 7.5 and amp["ENELCHILE"] == 7.5
    assert amp["CENCOSUD"] == 7.5
    assert sum(mod.values()) == 100.0 and sum(amp.values()) == 100.0


def test_renta4_articulo_mas_reciente():
    html = ('<a href="/analisis-actualidad/recomendaciones-y-oportunidades/carteras-recomendadas/2026/6/04-06-26-x">'
            '<a href="/analisis-actualidad/recomendaciones-y-oportunidades/carteras-recomendadas/2025/10/02-10-25-x">')
    assert Renta4Adapter.newest_article(html).group(1).endswith("2026/6/04-06-26-x")
