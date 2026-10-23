import performance as perf


def test_resuelve_nombres_en_memoria_y_suma_pesos():
    calls = []
    def resolver(name, cache):
        calls.append(name)
        cache[name] = {"APPLE INC": "AAPL", "APPLE INC COM": "AAPL"}.get(name)
        return cache[name]
    out = dict(perf.resolve_named_holdings([("APPLE INC", 30.0), ("APPLE INC COM", 5.0), ("KO", 10.0), ("UNKNOWN CO", 1.0)], resolver=resolver, cache={}))
    assert out == {"AAPL": 35.0, "KO": 10.0, "UNKNOWN CO": 1.0}


def test_tope_de_busquedas():
    calls = []
    def resolver(name, cache):
        calls.append(name); cache[name] = None; return None
    perf.resolve_named_holdings([(f"NAME {i}", float(i)) for i in range(10)], resolver=resolver, cache={}, max_lookups=3)
    assert calls == ["NAME 9", "NAME 8", "NAME 7"]
