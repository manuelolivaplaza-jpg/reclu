from datetime import date

from base import Holding, consolidate_holdings

D = date(2026, 10, 23)


def test_agrupa_simbolo_repetido_y_suma():
    hs = [Holding("DELL", "Dell", 40.0, as_of=D), Holding("dell", "Dell", 20.0, as_of=D),
          Holding("INTC", "Intel", 40.0, as_of=D)]
    out = consolidate_holdings(hs)
    assert [(h.symbol, h.weight) for h in out] == [("DELL", 60.0), ("INTC", 40.0)]


def test_normaliza_si_pasa_de_100():
    hs = [Holding("DELL", "Dell", 46.37, as_of=D), Holding("DELL", "Dell", 40.05, as_of=D),
          Holding("INTC", "Intel", 30.16, as_of=D)]
    out = consolidate_holdings(hs)
    assert len(out) == 2 and round(sum(h.weight for h in out), 2) == 100.0


def test_no_infla_listas_que_suman_menos():
    hs = [Holding("A", "A", 30.0, as_of=D), Holding("B", "B", 20.0, as_of=D)]
    assert round(sum(h.weight for h in consolidate_holdings(hs)), 2) == 50.0


def test_snapshots_distintos_no_se_mezclan():
    hs = [Holding("A", "A", 100.0, as_of=D), Holding("A", "A", 100.0, as_of=date(2026, 10, 22))]
    assert len(consolidate_holdings(hs)) == 2


def test_trump_dice_un_peso_por_ticker():
    import trump_dice as td

    menciones = [{"id": f"M{i:02d}", "ticker": t, "empresa": t, "entrada": "2026-01-05", "status": "verificada"}
                 for i, t in [(4, "DELL"), (5, "DELL"), (6, "INTC"), (7, "DELL")]]
    prices = {"DELL": {"2026-01-05": 100.0, "2026-10-23": 150.0}, "INTC": {"2026-01-05": 20.0, "2026-10-23": 30.0}}
    rows = td.build_trump_dice(menciones, prices, as_of=D)
    syms = [r["symbol"] for r in rows]
    assert syms.count("DELL") == 1 and round(sum(r["weight"] for r in rows), 2) == 100.0
