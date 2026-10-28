import load_13f as l13
import holdings_merge as hm


def _h(issuer, cusip, w, as_of="2026-08-14"):
    return {"issuer": issuer, "cusip": cusip, "weight": w, "value": w * 10, "as_of": as_of}


def test_payload_una_fila_por_simbolo_y_suma_100():
    res = {"111": "GOOGL", "222": "GOOGL", "333": "AAPL"}
    hs = [_h("ALPHABET INC CL A", "111", 20), _h("ALPHABET INC CL C", "222", 15), _h("APPLE INC", "333", 65)]
    p = l13.build_payload("pid", hs, lambda issuer, cusip: res.get(cusip))
    assert sorted((r["symbol"], r["weight"]) for r in p) == [("AAPL", 65.0), ("GOOGL", 35.0)]
    assert round(sum(r["weight"] for r in p), 2) == 100.0


def test_payload_sin_resolver_queda_con_nombre():
    p = l13.build_payload("pid", [_h("ICAHN ENTERPRISES LP", "x", 100)], lambda i, c: None)
    assert p[0]["symbol"] == "ICAHN ENTERPRISES LP"


def test_stale_ids_saca_fila_con_nombre_vieja():
    payload = [{"symbol": "IEP", "as_of": "2026-08-14"}, {"symbol": "CVI", "as_of": "2026-08-14"}]
    existing = [
        {"id": "1", "symbol": "IEP", "as_of": "2026-08-14"},
        {"id": "2", "symbol": "Icahn Enterprises LP", "as_of": "2026-08-14"},
        {"id": "3", "symbol": "CVI", "as_of": "2026-08-14"},
        {"id": "4", "symbol": "OLD", "as_of": "2026-05-15"},  # otro snapshot: no se toca
    ]
    assert l13.stale_ids(existing, payload) == ["2"]


def test_merge_no_suma_pesos():
    row = lambda i, s, w: {"id": i, "portfolio_id": "p1", "as_of": "2026-08-14", "weight": w, "symbol": s}
    plan = hm.plan_merges([row("a", "Icahn Enterprises LP", 53.95)], [row("x", "IEP", 53.95)], lambda r: "IEP")
    sql = hm.render_sql(plan)
    assert "greatest(weight" in sql and "weight +" not in sql
