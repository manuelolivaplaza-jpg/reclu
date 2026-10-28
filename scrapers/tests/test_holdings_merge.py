import holdings_merge as hm


def row(i, pid, sym, w, as_of="2026-09-30", cur="USD", ex=None):
    return {"id": i, "portfolio_id": pid, "symbol": sym, "weight": w, "as_of": as_of, "currency": cur, "exchange": ex}


def test_us_class_hyphen():
    assert hm.us_class_hyphen("BRK.B") == "BRK-B"
    assert hm.us_class_hyphen("BF/B") == "BF-B"
    assert hm.us_class_hyphen("AAPL") == "AAPL"
    assert hm.us_class_hyphen("BRK-B") == "BRK-B"
    assert hm.us_class_hyphen(None) is None


def test_class_dot_target_skips_chile():
    assert hm.class_dot_target(row(1, "p", "BRK.B", 1)) == "BRK-B"
    assert hm.class_dot_target(row(2, "p", "AGUAS.A", 1, cur="CLP")) is None
    assert hm.class_dot_target(row(3, "p", "CMPC.A", 1, ex="BCS")) is None
    assert hm.class_dot_target(row(4, "p", "AAPL", 1)) is None


def test_plan_rename_and_merges():
    mapping = {"BERKSHIRE HATHAWAY INC": "BRK-B", "BERKSHIRE HATHAWAY": "BRK-B", "APPLE INC": "AAPL"}
    rows = [
        row("a", "p1", "BERKSHIRE HATHAWAY INC", 5),
        row("b", "p1", "APPLE INC", 3),
        row("c", "p2", "BERKSHIRE HATHAWAY INC", 2),
        row("d", "p2", "BERKSHIRE HATHAWAY", 1),
    ]
    existing = [row("x", "p1", "BRK-B", 4)]
    plan = hm.plan_merges(rows, existing, lambda r: mapping.get(r["symbol"]))
    c = plan["counts"]
    assert c["renombrar"] == 2 and c["fusionar"] == 2
    assert c["fusionar_en_existente"] == 1 and c["fusionar_en_renombrada"] == 1
    merges = {m["from_id"]: m["into_id"] for m in plan["merges"]}
    assert merges == {"a": "x", "d": "c"}  # en p2 la de mayor peso se renombra


def test_distinct_as_of_not_merged():
    rows = [row("a", "p1", "APPLE INC", 3, as_of="2026-06-30")]
    existing = [row("x", "p1", "AAPL", 4, as_of="2026-09-30")]
    plan = hm.plan_merges(rows, existing, lambda r: "AAPL")
    assert plan["counts"]["renombrar"] == 1 and plan["counts"]["fusionar"] == 0


def test_sql_is_transactional_and_archives_before_delete():
    plan = hm.plan_merges([row("a", "p1", "O'NEIL INC", 3)], [row("x", "p1", "ONL", 1)], lambda r: "ONL")
    sql = hm.render_sql(plan)
    assert sql.index("begin;") < sql.index("insert into public.holdings_merged") < sql.index("delete from") < sql.index("commit;")
    assert "O''NEIL INC" in sql
    assert "greatest(weight" in sql and "least(100" not in sql  # D42: no se suman pesos
