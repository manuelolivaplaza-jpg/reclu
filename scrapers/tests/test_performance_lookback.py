import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import performance  # noqa: E402


def test_default_sin_cambio():
    assert performance.lookback_days() == 365


def test_days_explicito():
    assert performance.lookback_days(days=730) == 730


def test_since_manda_sobre_days():
    assert performance.lookback_days(days=10, since="2024-10-01", today=date(2026, 10, 1)) == 730


def test_since_futuro_falla():
    with pytest.raises(ValueError):
        performance.lookback_days(since="2030-01-01", today=date(2026, 10, 1))


def test_main_sin_argv_no_lee_sys_argv(monkeypatch):
    calls = {}
    monkeypatch.setattr(sys, "argv", ["run_all.py", "--algo-de-run-all"])

    class Stop(Exception):
        pass

    def fake_db():
        raise Stop

    import base

    monkeypatch.setattr(base, "get_db", fake_db)
    with pytest.raises(Stop):
        performance.main()
    calls["ok"] = True
    assert calls["ok"]
