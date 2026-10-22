import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from supabase_compat import EmptyResult, data_of, patch_maybe_single


class FakeBuilder:
    def __init__(self, result):
        self._result = result

    def execute(self):
        return self._result


class Resp:
    def __init__(self, data):
        self.data = data


def test_patch_maybe_single_devuelve_vacio_en_vez_de_none():
    patch_maybe_single(FakeBuilder)
    res = FakeBuilder(None).execute()
    assert isinstance(res, EmptyResult)
    assert res.data is None
    assert not res
    assert FakeBuilder(Resp({"id": 1})).execute().data == {"id": 1}
    assert patch_maybe_single(FakeBuilder) is True  # idempotente


def test_data_of():
    assert data_of(None) is None
    assert data_of(Resp([1])) == [1]


def test_latest_price_sin_filas():
    import compute_returns

    class Q:
        def __getattr__(self, name):
            return lambda *a, **k: self

        def execute(self):
            return None

    class DB:
        def table(self, name):
            return Q()

    assert compute_returns.latest_price(DB(), "AFYA") is None
