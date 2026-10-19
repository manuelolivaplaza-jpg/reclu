"""load_thematic: los portafolios ocultos (migracion 043) no se recargan.

Sin red ni Supabase real: `get_db` se reemplaza por un doble en memoria.

Correr: python -m pytest scrapers/tests/test_load_thematic.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import load_thematic  # noqa: E402
from load_thematic import HIDDEN_SLUGS, THEMATIC_HOLDINGS, is_hidden  # noqa: E402


def test_marca_los_cuatro_slugs_ocultos() -> None:
    for slug in (
        "elon-doge-tracker",
        "trump-truth-signals",
        "afp-consenso-chile",
        "inverse-cramer",
    ):
        assert is_hidden(slug)
    assert not is_hidden("ai-world-war")
    assert not is_hidden("musk-dice")


def test_inverse_cramer_sigue_en_el_mapa_pero_se_salta() -> None:
    # El proxy sigue listado (no se borra), pero queda oculto y no se carga.
    assert "inverse-cramer" in THEMATIC_HOLDINGS
    assert "inverse-cramer" in HIDDEN_SLUGS


class _Resp:
    def __init__(self, data: object) -> None:
        self.data = data


class _Query:
    def __init__(self, fake: "_FakeDB", table: str) -> None:
        self._fake = fake
        self._table = table

    def select(self, *args: object) -> "_Query":
        return self

    def eq(self, *args: object) -> "_Query":
        return self

    def maybe_single(self) -> "_Query":
        return self

    def execute(self) -> _Resp:
        return _Resp({"id": "pf-1"})

    def upsert(self, payload: object, on_conflict: str | None = None) -> "_Query":
        self._fake.writes.append((self._table, payload))
        return self


class _FakeDB:
    def __init__(self) -> None:
        self.writes: list[tuple[str, object]] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def _run(monkeypatch, dry_run: bool) -> _FakeDB:
    fake = _FakeDB()
    monkeypatch.setattr(load_thematic, "get_db", lambda: fake)
    load_thematic.main(dry_run=dry_run)
    return fake


def test_dry_run_no_escribe_y_reporta_ocultos(monkeypatch, capsys) -> None:
    fake = _run(monkeypatch, dry_run=True)
    out = capsys.readouterr().out
    assert fake.writes == []
    assert "inverse-cramer" in out
    assert "oculto" in out


def test_no_ocultos_se_cargan_y_ocultos_se_saltan(monkeypatch) -> None:
    fake = _run(monkeypatch, dry_run=False)
    escritos = {payload[0]["portfolio_id"] for _, payload in fake.writes}  # type: ignore[index]
    # Todos los no ocultos presentes en el mapa se escriben.
    assert len(fake.writes) == len(THEMATIC_HOLDINGS) - len(HIDDEN_SLUGS & set(THEMATIC_HOLDINGS))
    assert escritos == {"pf-1"}
