from datetime import date

import afp_series as af
import event_series as es
import performance
import run_all
from ticker_map import TickerResolver


def F(nemo, emisor, mmusd):
    return {"nemo": nemo, "emisor": emisor, "total_mmusd": mmusd}


def test_serie_mensual_rebalancea_en_cada_foto():
    pesos = [("2026-01-02", {"A": 1.0}), ("2026-01-05", {"B": 1.0})]
    precios = {
        "A": {"2026-01-02": 100, "2026-01-05": 110, "2026-01-06": 220},
        "B": {"2026-01-02": 50, "2026-01-05": 50, "2026-01-06": 55},
    }
    s = af.serie_mensual(pesos, precios)
    assert [p["date"] for p in s] == ["2026-01-02", "2026-01-05", "2026-01-06"]
    assert s[1]["value_pct"] == 10.0          # A sube 10%
    assert s[2]["value_pct"] == 21.0          # desde el 05 manda B (+10%), no A (+100%)


def test_serie_sin_cobertura_no_se_mueve():
    pesos = [("2026-01-02", {"A": 0.3, "X": 0.7})]
    precios = {"A": {"2026-01-02": 100, "2026-01-05": 200}}
    s = af.serie_mensual(pesos, precios)
    assert s[-1]["value_pct"] == 0.0


def test_no_proyecta_antes_de_la_primera_foto():
    pesos = [("2026-01-05", {"A": 1.0})]
    precios = {"A": {"2025-12-01": 1, "2026-01-05": 100, "2026-01-06": 101}}
    s = af.serie_mensual(pesos, precios)
    assert s[0]["date"] == "2026-01-05"


def test_fotos_afp_desde_ultimo_publicado_y_orden():
    html = "<html>CUADRO 14 " + "x" * 2000 + "</html>"

    def leer(fecpro):
        return b"" if fecpro >= "202606" else html.encode()

    import spensiones as sp
    orig = af.parse_cuadro14
    af.parse_cuadro14 = lambda h: ("29-05-2026", [F("SQM-B", "SQM", 10)])
    try:
        fotos = af.fotos_afp(leer, date(2026, 10, 1), meses=3)
    finally:
        af.parse_cuadro14 = orig
    assert [f["fecpro"] for f in fotos] == ["202603", "202604", "202605"]
    assert sp  # noqa


def test_consenso_suma_mmusd_y_solo_meses_completos():
    por_afp = {
        "a": [{"fecpro": "202604", "fecha": "30-04-2026", "filas": [F("SQM-B", "SQM", 10)]},
              {"fecpro": "202605", "fecha": "29-05-2026", "filas": [F("SQM-B", "SQM", 10)]}],
        "b": [{"fecpro": "202605", "fecha": "29-05-2026", "filas": [F("SQM-B", "SQM", 10), F("BCI", "BANCO BCI", 20)]}],
    }
    c = af.consenso_fotos(por_afp)
    assert [f["fecpro"] for f in c] == ["202605"]
    pesos = af.pesos_por_foto(c)
    assert round(pesos[0][1]["SQM-B"], 2) == 0.5 and round(pesos[0][1]["BCI"], 2) == 0.5
    rows = af.consenso_holdings_rows(c[-1])
    assert all(r["previous_weight"] == r["weight"] for r in rows)


def test_cramer_compras_solo_largos(monkeypatch):
    monkeypatch.setattr(es, "cramer_events", lambda: [
        {"ticker": "A", "entry": "2026-09-09", "exit": "2026-10-21", "side": 1},
        {"ticker": "B", "entry": "2026-09-09", "exit": "2026-10-21", "side": -1},
    ])
    ev = es.cramer_compras_events()
    assert [e["ticker"] for e in ev] == ["A"]
    assert "inverse-cramer-compras" in es.PORTFOLIOS


def test_serie_compras_parte_en_el_primer_pick():
    ev = [{"ticker": "A", "entry": "2026-09-09", "exit": None, "side": 1}]
    prices = {"A": {"2024-01-02": 5, "2026-09-09": 10, "2026-09-10": 11}}
    s = es.compute_event_series(ev, prices)
    assert s[0]["date"] == "2026-09-09"


def test_performance_no_proyecta_compras_ni_afp():
    assert "inverse-cramer-compras" in performance.EVENT_REAL_SLUGS
    assert "afp-consenso-chile" in performance.AFP_REAL_SLUGS
    assert "afp-habitat-acciones-cl" in performance.AFP_REAL_SLUGS


def test_run_all_tiene_event_y_afp_series():
    assert "event_series" in run_all.STAGE_IDS and "afp_series" in run_all.STAGE_IDS
    assert run_all.STAGE_IDS.index("event_series") > run_all.STAGE_IDS.index("inverse_cramer")


def test_ticker_resolver_hyphen():
    r = TickerResolver(curated={"BERKSHIRE HATHAWAY": "BRK.B"}, cusip_cache={"084670702": "BRK.B"})
    assert r.resolve("Berkshire Hathaway Inc Del", "084670702") == "BRK-B"


def test_resolve_pick_ticker_hyphen():
    import resolve_tickers as rt
    q = [{"quoteType": "EQUITY", "exchange": "NYQ", "symbol": "BRK.B", "longname": "Berkshire Hathaway Inc."}]
    assert rt.pick_ticker("BERKSHIRE HATHAWAY INC", q) == "BRK-B"
