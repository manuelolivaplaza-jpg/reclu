"""Perfiles por ticker (F67): CSV curado, vocabulario macro y dry-run.

Sin red ni Supabase: la base es un mock que registra escrituras o revienta si
el dry-run la toca.

Correr desde scrapers/:
  uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_ticker_profile.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ticker_profile import (  # noqa: E402
    CSV_COLUMNS,
    DEFAULT_CSV_PATH,
    MACRO_FACTORS,
    PROFILE_FLAG,
    TickerProfileAdapter,
    load_profiles,
    missing_from_profiles,
    parse_profiles_csv,
    profile_enabled,
    symbols_from_user_holdings,
)

HEADER = ",".join(CSV_COLUMNS)
PROFILES = load_profiles()


def _csv(*rows: str) -> str:
    return "\n".join([HEADER, *rows]) + "\n"


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
    """Registra upserts y devuelve tenencias fijas para el reporte de faltantes."""

    def __init__(self, holdings: list[dict] | None = None) -> None:
        self.holdings = list(holdings or [])
        self.upserts: list[tuple[str, list[dict], str]] = []
        self.selects: list[tuple[str, str]] = []

    def table(self, name: str) -> _TablaFalsa:
        return _TablaFalsa(self, name)


class _DbVeneno:
    """Cualquier acceso a la base hace fallar el test."""

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"el dry-run tocó Supabase: db.{name}()")


# --- 1. CSV curado -------------------------------------------------------


def test_csv_real_tiene_unos_50_perfiles() -> None:
    assert DEFAULT_CSV_PATH.exists()
    assert len(PROFILES) >= 50
    symbols = [profile["symbol"] for profile in PROFILES]
    assert len(symbols) == len(set(symbols))
    countries = {profile["country"] for profile in PROFILES}
    assert {"US", "CL"} <= countries


def test_perfiles_completos_y_macro_valido() -> None:
    for profile in PROFILES:
        assert profile["sector"], profile["symbol"]
        assert profile["country"] in {"US", "CL"}
        assert profile["macro_factors"], profile["symbol"]
        for factor in profile["macro_factors"]:
            assert factor in MACRO_FACTORS, (profile["symbol"], factor)
        for peer in profile["peers"]:
            assert peer and " " not in peer, (profile["symbol"], peer)


def test_sqm_b_lleva_litio_y_alb_entre_sus_peers() -> None:
    sqm = next(profile for profile in PROFILES if profile["symbol"] == "SQM-B")
    assert "litio" in sqm["macro_factors"]
    assert "ALB" in sqm["peers"]


def test_parseo_quita_duplicados_y_normaliza_tickers() -> None:
    profiles = parse_profiles_csv(
        _csv("aapl,Tecnología,Hardware,us,msft|MSFT|googl,,tecnologia|TECNOLOGIA")
    )
    assert profiles[0]["symbol"] == "AAPL"
    assert profiles[0]["country"] == "US"
    assert profiles[0]["peers"] == ["MSFT", "GOOGL"]
    assert profiles[0]["macro_factors"] == ["tecnologia"]


def test_faltan_columnas_falla() -> None:
    with pytest.raises(ValueError, match="faltan columnas"):
        parse_profiles_csv("symbol,sector\nAAPL,Tecnología\n")


def test_macro_desconocida_falla() -> None:
    with pytest.raises(ValueError, match="uranio"):
        parse_profiles_csv(_csv("AAPL,Tecnología,Hardware,US,MSFT,,uranio"))


def test_symbol_vacio_falla() -> None:
    with pytest.raises(ValueError, match="symbol"):
        parse_profiles_csv(_csv(",Tecnología,Hardware,US,MSFT,,tecnologia"))


def test_symbol_duplicado_falla() -> None:
    with pytest.raises(ValueError, match="duplicado"):
        parse_profiles_csv(
            _csv(
                "AAPL,Tecnología,Hardware,US,MSFT,,tecnologia",
                "AAPL,Tecnología,Hardware,US,MSFT,,tecnologia",
            )
        )


def test_peer_invalido_o_autoreferente_falla() -> None:
    with pytest.raises(ValueError, match="peer inválido"):
        parse_profiles_csv(_csv("AAPL,Tecnología,Hardware,US,BAD$PEER,,tecnologia"))
    with pytest.raises(ValueError, match="su propio peer"):
        parse_profiles_csv(_csv("AAPL,Tecnología,Hardware,US,AAPL,,tecnologia"))


def test_country_invalido_falla() -> None:
    with pytest.raises(ValueError, match="country"):
        parse_profiles_csv(_csv("AAPL,Tecnología,Hardware,USA,MSFT,,tecnologia"))


# --- 2. Dry-run y escritura ---------------------------------------------


def test_dry_run_no_toca_supabase() -> None:
    summary = TickerProfileAdapter(dry_run=True, profiles=PROFILES).run(_DbVeneno())
    assert summary["dry_run"] is True
    assert summary["profiles"] == len(PROFILES)
    assert summary["written"] == 0


def test_run_hace_upsert_por_symbol_y_reporta_faltantes() -> None:
    db = _DbFalsa(
        [
            {"symbol": "aapl"},
            {"symbol": "MSFT"},
            {"symbol": "SQM-B"},
            {"symbol": "BABA"},
            {"symbol": "AAPL"},
        ]
    )
    summary = TickerProfileAdapter(profiles=PROFILES).run(db)

    assert summary["written"] == len(PROFILES)
    assert summary["user_symbols"] == 4
    # F80: el summary lleva el conteo, no la lista de tickers.
    assert summary["missing_count"] == 1
    assert "missing" not in summary
    assert db.selects == [("user_holdings", "symbol")]

    written = [row for _table, batch, _conflict in db.upserts for row in batch]
    assert len(written) == len(PROFILES)
    assert {row["symbol"] for row in written} == {
        profile["symbol"] for profile in PROFILES
    }
    assert all(table == "ticker_profile" for table, _b, _c in db.upserts)
    assert all(conflict == "symbol" for _t, _b, conflict in db.upserts)
    assert set(written[0]) == set(CSV_COLUMNS)


# --- 3. Símbolos de user_holdings ---------------------------------------


def test_symbols_from_user_holdings_solo_devuelve_simbolos() -> None:
    db = _DbFalsa(
        [
            {"symbol": "aapl"},
            {"symbol": "AAPL"},
            {"symbol": "SQM-B"},
            {"symbol": ""},
            {"symbol": "BAD/SYMBOL"},
        ]
    )
    assert symbols_from_user_holdings(db) == ["AAPL", "SQM-B"]
    assert db.selects == [("user_holdings", "symbol")]


def test_missing_from_profiles_normaliza_y_ordena() -> None:
    assert missing_from_profiles(
        ["tsla", "AAPL", "SQM-B", "BABA", "BAD/SYMBOL"], PROFILES
    ) == ["BABA"]


# --- 4. Etapa ------------------------------------------------------------


def test_flag_solo_se_enciende_con_true(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(PROFILE_FLAG, raising=False)
    assert profile_enabled() is False
    monkeypatch.setenv(PROFILE_FLAG, "1")
    assert profile_enabled() is False
    monkeypatch.setenv(PROFILE_FLAG, "true")
    assert profile_enabled() is True


def test_etapa_apagada_no_lee_la_base(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from stages import ticker_profile as stage

    monkeypatch.delenv(PROFILE_FLAG, raising=False)
    result = stage.run(_DbVeneno(), True)
    assert result[0]["status"] == "skipped"
    assert result[0]["reason"] == f"{PROFILE_FLAG} != true"


def test_etapa_encendida_en_dry_run_no_toca_la_base(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from stages import ticker_profile as stage

    monkeypatch.setenv(PROFILE_FLAG, "true")
    result = stage.run(_DbVeneno(), True)
    assert result[0]["dry_run"] is True
    assert result[0]["written"] == 0
    assert result[0]["status"] == "ok"
