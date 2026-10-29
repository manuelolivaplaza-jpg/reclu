"""D45b: un emisor sin resolver reutiliza el ticker ya guardado (sin doble fila)."""
import load_13f as l13


def _p(sym, name, w, d="2026-08-13"):
    return {"portfolio_id": "pid", "symbol": sym, "name": name, "weight": w, "as_of": d}


def test_adopta_ticker_existente_y_stale_no_borra_la_buena():
    existing = [{"id": "1", "symbol": "AMZN", "name": "AMAZON COM INC", "as_of": "2026-08-13"},
                {"id": "2", "symbol": "AMAZON COM INC", "name": "AMAZON COM INC", "as_of": "2026-08-13"}]
    payload = [_p("AMAZON COM INC", "AMAZON COM INC", 2.5), _p("MSFT", "MICROSOFT CORP", 3.0)]
    assert l13.adopt_known_tickers(existing, payload) == 1
    assert sorted(p["symbol"] for p in payload) == ["AMZN", "MSFT"]
    assert l13.stale_ids(existing, payload) == ["2"]


def test_suma_si_el_ticker_ya_esta_en_el_payload():
    existing = [{"id": "1", "symbol": "GOOGL", "name": "ALPHABET INC CL A", "as_of": "2026-08-13"}]
    payload = [_p("GOOGL", "ALPHABET INC", 1.0), _p("ALPHABET INC CL A", "ALPHABET INC CL A", 0.5)]
    l13.adopt_known_tickers(existing, payload)
    assert payload == [_p("GOOGL", "ALPHABET INC", 1.5)]


def test_no_toca_otra_fecha_ni_nombres_sin_ticker():
    existing = [{"id": "1", "symbol": "AMZN", "name": "AMAZON COM INC", "as_of": "2026-05-15"}]
    payload = [_p("AMAZON COM INC", "AMAZON COM INC", 2.5), _p("PRIVATE CO LLC", "PRIVATE CO LLC", 1.0)]
    assert l13.adopt_known_tickers(existing, payload) == 0
    assert [p["symbol"] for p in payload] == ["AMAZON COM INC", "PRIVATE CO LLC"]
