"""D45: los pesos redondeados suman exactamente 100."""
import random

from sec13f import largest_remainder
from activists_13d import holdings_from_filings


def test_largest_remainder_suma_100_con_cola_larga():
    rng = random.Random(45)
    values = [rng.paretovariate(1.2) for _ in range(2934)]
    w = largest_remainder(values)
    assert round(sum(w), 6) == 100.0
    assert all(abs(a - v / sum(values) * 100) < 0.01 for a, v in zip(w, values))


def test_largest_remainder_casos_borde():
    assert largest_remainder([]) == []
    assert largest_remainder([0.0, 0.0]) == [0.0, 0.0]
    assert largest_remainder([1, 1, 1]) == [33.34, 33.33, 33.33]
    assert largest_remainder([500, 100, 11]) == [81.83, 16.37, 1.8]


def test_activistas_617_suma_100():
    filings = [{"symbol": f"T{i:03d}", "issuer_name": f"Co {i}", "filed_at": "2026-10-01"} for i in range(617)]
    hs = holdings_from_filings(filings)
    assert len(hs) == 617
    assert round(sum(h.weight for h in hs), 6) == 100.0
    assert {h.weight for h in hs} <= {0.16, 0.17}
