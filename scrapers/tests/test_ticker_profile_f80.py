"""F80: los tickers de la cartera de los usuarios no se imprimen ni se loguean.

Sin red ni Supabase: la base es un mock. Se verifica que el log y el stdout
muestran SOLO el conteo de faltantes (``faltan {n}``) y que la lista de
tickers no aparece en ninguna de las dos salidas.

Correr desde scrapers/:
  uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_ticker_profile_f80.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ticker_profile import (  # noqa: E402
    TickerProfileAdapter,
    load_profiles,
    missing_report,
)

PROFILE_LIST = load_profiles()


class _Respuesta:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _TablaFalsa:
    def __init__(self, db: "_DbFalsa", name: str) -> None:
        self.db = db
        self.name = name

    def select(self, columns: str) -> "_TablaFalsa":
        self.db.selects.append((self.name, columns))
        return self

    def limit(self, _count: int) -> "_TablaFalsa":
        return self

    def upsert(self, payload: list[dict], on_conflict: str = "") -> "_TablaFalsa":
        self.db.upserts.append((self.name, payload, on_conflict))
        return self

    def execute(self) -> _Respuesta:
        if self.name == "user_holdings":
            return _Respuesta(self.db.holdings)
        return _Respuesta([])


class _DbFalsa:
    def __init__(self, holdings: list[dict] | None = None) -> None:
        self.holdings = list(holdings or [])
        self.upserts: list[tuple[str, list[dict], str]] = []
        self.selects: list[tuple[str, str]] = []

    def table(self, name: str) -> _TablaFalsa:
        return _TablaFalsa(self, name)


# Ticker ficticio: no está en el CSV curado, así que es "faltante".
TICKER_FALTANTE = "ZZF80FAKE"


def test_el_log_muestra_el_conteo_y_no_la_lista(
    capsys: pytest.CaptureFixture[str],
) -> None:
    db = _DbFalsa([{"symbol": TICKER_FALTANTE}, {"symbol": "AAPL"}])

    TickerProfileAdapter(profiles=PROFILE_LIST).run(db)

    salida = capsys.readouterr()
    texto = salida.out + salida.err

    assert "faltan en el CSV: 1" in texto
    assert TICKER_FALTANTE not in texto


def test_el_summary_lleva_el_conteo_y_no_la_lista() -> None:
    db = _DbFalsa([{"symbol": TICKER_FALTANTE}, {"symbol": "AAPL"}])

    summary = TickerProfileAdapter(profiles=PROFILE_LIST).run(db)

    assert summary["missing_count"] == 1
    assert "missing" not in summary
    assert TICKER_FALTANTE not in str(summary)


def test_missing_report_escribe_el_detalle_fuera_del_repo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Artefacto en un directorio temporal de prueba (fuera del repo).
    destino = tmp_path / "missing.txt"
    monkeypatch.setattr(
        "ticker_profile.missing_artifact_path", lambda: destino
    )

    report = missing_report([TICKER_FALTANTE, "OTROFAKE"])

    assert report["missing_count"] == 2
    assert report["missing_artifact"] == str(destino)
    assert destino.read_text(encoding="utf-8").split() == [
        TICKER_FALTANTE,
        "OTROFAKE",
    ]


def test_el_artefacto_no_esta_dentro_del_repo() -> None:
    from ticker_profile import missing_artifact_path

    ruta = missing_artifact_path()
    repo = Path(__file__).resolve().parent.parent.parent
    assert repo not in ruta.parents
