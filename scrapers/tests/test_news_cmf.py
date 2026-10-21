"""F65: hechos esenciales CMF -> news_items / news_tickers. Sin red ni Supabase.

Correr desde scrapers/:
  uv run --with pytest --with-requirements requirements.txt \
      pytest -q tests/test_news_cmf.py
"""

from __future__ import annotations

import hashlib
import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from news_cmf import (  # noqa: E402
    APPROX_CONFIDENCE,
    EXACT_CONFIDENCE,
    CmfNewsAdapter,
    event_to_news,
    load_aliases,
    news_enabled,
    news_hash,
    prepare_news,
    resolve_nemo,
)

STAGE_PATH = RAIZ / "stages" / "news_cmf.py"

EVENTO = {
    "fecha": "2026-10-19",
    "numero_documento": "2026100670579",
    "emisor": "Banco de Chile",
    "materia": "Aumento de capital",
    "titulo": "Banco de Chile: Aumento de capital",
    "categoria": "aumento_capital",
    "url": "https://www.cmfchile.cl/institucional/ver_sgd.php?s567=abc",
}


# --------------------------------------------------------------------------
# Conversion pura
# --------------------------------------------------------------------------


def test_event_to_news_titulo_materia_y_hash_de_url() -> None:
    fila = event_to_news(EVENTO)

    assert fila is not None
    assert fila["source"] == "cmf_hechos"
    assert fila["title"] == "Aumento de capital"
    assert fila["url"] == EVENTO["url"]
    assert fila["published_at"] == "2026-10-19"
    assert fila["lang"] == "es"
    assert fila["hash"] == hashlib.sha256(EVENTO["url"].encode("utf-8")).hexdigest()
    assert fila["hash"] == news_hash(EVENTO["url"])
    assert len(fila["summary"]) <= 500
    assert "Banco de Chile" in fila["summary"]


def test_event_to_news_usa_titulo_si_falta_materia() -> None:
    evento = {**EVENTO, "materia": ""}

    fila = event_to_news(evento)

    assert fila is not None
    assert fila["title"] == "Banco de Chile: Aumento de capital"


def test_event_to_news_omite_sin_url_o_fecha() -> None:
    assert event_to_news({**EVENTO, "url": ""}) is None
    assert event_to_news({**EVENTO, "fecha": ""}) is None


def test_hash_es_estable_y_distingue_urls() -> None:
    assert news_hash(EVENTO["url"]) == news_hash(EVENTO["url"] + " ")
    assert news_hash(EVENTO["url"]) != news_hash(EVENTO["url"] + "x")


def test_flag_solo_se_enciende_con_true(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NEWS_IMPACT_ENABLED", raising=False)
    assert news_enabled() is False
    monkeypatch.setenv("NEWS_IMPACT_ENABLED", "1")
    assert news_enabled() is False
    monkeypatch.setenv("NEWS_IMPACT_ENABLED", "TRUE")
    assert news_enabled() is True


# --------------------------------------------------------------------------
# Emisor -> nemotecnico
# --------------------------------------------------------------------------


def test_load_aliases_mapea_emisora_verificada() -> None:
    aliases = load_aliases()

    assert aliases.get("banco de chile") == "CHILE"


def test_resolve_nemo_exacto_da_confianza_1() -> None:
    symbol, confidence = resolve_nemo(
        "Banco de Chile S.A.",
        aliases={"banco de chile": "CHILE"},
        resolver=lambda _emisor: "OTRO",
    )

    assert symbol == "CHILE"
    assert confidence == EXACT_CONFIDENCE


def test_resolve_nemo_aproximado_da_confianza_0_7() -> None:
    symbol, confidence = resolve_nemo(
        "Emisora Desconocida S.A.",
        aliases={},
        resolver=lambda _emisor: "nuevo",
    )

    assert symbol == "NUEVO"
    assert confidence == APPROX_CONFIDENCE


def test_resolve_nemo_sin_match_o_error_no_tumba() -> None:
    assert resolve_nemo("Nadie S.A.", aliases={}, resolver=lambda _e: None) == (
        None,
        None,
    )

    def _falla(_emisor: str) -> str | None:
        raise RuntimeError("sin red")

    assert resolve_nemo("Nadie S.A.", aliases={}, resolver=_falla) == (None, None)


def test_prepare_news_sin_nemo_guarda_la_noticia_sin_ticker() -> None:
    noticias, vinculos, metricas = prepare_news(
        [EVENTO, {**EVENTO, "emisor": "Emisora Chica", "url": EVENTO["url"] + "2"}],
        aliases={"banco de chile": "CHILE"},
        resolver=lambda _emisor: None,
    )

    assert len(noticias) == 2
    assert metricas["con_nemo"] == 1
    assert metricas["sin_nemo"] == 1
    assert len(vinculos) == 1
    assert vinculos[0]["symbol"] == "CHILE"
    assert vinculos[0]["relation"] == "direct"
    assert vinculos[0]["confidence"] == 1.0


def test_prepare_news_deduplica_por_hash() -> None:
    noticias, vinculos, _ = prepare_news(
        [EVENTO, dict(EVENTO)], aliases={"banco de chile": "CHILE"}
    )

    assert len(noticias) == 1
    assert len(vinculos) == 1


# --------------------------------------------------------------------------
# Base falsa: upsert por hash, sin duplicados
# --------------------------------------------------------------------------


class _Result:
    def __init__(self, data: Any = None) -> None:
        self.data = data


class _Query:
    def __init__(self, db: "_Db", name: str) -> None:
        self.db = db
        self.name = name
        self.op = ""
        self.payload: Any = None
        self.kwargs: dict[str, Any] = {}
        self.filtros: list[Any] = []

    def select(self, *_args: Any, **_kwargs: Any) -> "_Query":
        self.op = "select"
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> "_Query":
        return self

    def limit(self, *_args: Any, **_kwargs: Any) -> "_Query":
        return self

    def in_(self, campo: str, valores: list[Any]) -> "_Query":
        self.filtros.append((campo, list(valores)))
        return self

    def upsert(self, payload: Any, **kwargs: Any) -> "_Query":
        self.op = "upsert"
        self.payload = payload
        self.kwargs = kwargs
        return self

    def execute(self) -> _Result:
        self.db.calls.append((self.name, self.op, self.payload, self.kwargs))
        if self.name == "cl_material_events" and self.op == "select":
            return _Result(self.db.events)
        if self.name == "news_items" and self.op == "upsert":
            for fila in self.payload:
                self.db.news.setdefault(fila["hash"], fila)
            return _Result(None)
        if self.name == "news_items" and self.op == "select":
            key, valores = self.filtros[-1]
            return _Result(
                [
                    {"id": f"n-{fila['hash'][:8]}", "hash": fila["hash"]}
                    for fila in self.db.news.values()
                    if fila.get(key) in valores
                ]
            )
        if self.name == "news_tickers" and self.op == "upsert":
            for fila in self.payload:
                clave = (fila["news_id"], fila["symbol"], fila["relation"])
                self.db.tickers.setdefault(clave, fila)
            return _Result(None)
        return _Result(None)


class _Db:
    def __init__(self, events: list[dict[str, Any]]) -> None:
        self.events = events
        self.news: dict[str, dict[str, Any]] = {}
        self.tickers: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.calls: list[tuple] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)


class _DbVeneno:
    """Cualquier acceso a la base hace fallar el test."""

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"el dry-run toco la base: db.{name}()")


def test_adapter_ingesta_y_no_duplica_en_reingesta() -> None:
    db = _Db([EVENTO])
    adapter = CmfNewsAdapter(aliases={"banco de chile": "CHILE"})

    primero = adapter.run(db)
    segundo = adapter.run(db)

    assert primero["news"] == 1
    assert primero["tickers"] == 1
    assert segundo["news"] == 1
    assert len(db.news) == 1
    assert len(db.tickers) == 1

    upserts = [c for c in db.calls if c[1] == "upsert"]
    news_upserts = [c for c in upserts if c[0] == "news_items"]
    ticker_upserts = [c for c in upserts if c[0] == "news_tickers"]
    assert news_upserts[0][3]["on_conflict"] == "hash"
    assert news_upserts[0][3]["ignore_duplicates"] is True
    assert ticker_upserts[0][3]["on_conflict"] == "news_id,symbol,relation"
    ticker = next(iter(db.tickers.values()))
    assert ticker["relation"] == "direct"
    assert ticker["confidence"] == 1.0


def test_adapter_hecho_sin_nemo_se_guarda_sin_ticker() -> None:
    db = _Db([{**EVENTO, "emisor": "Emisora Chica"}])
    adapter = CmfNewsAdapter(aliases={}, resolver=lambda _emisor: None)

    resumen = adapter.run(db)

    assert resumen["news"] == 1
    assert resumen["tickers"] == 0
    assert resumen["sin_nemo"] == 1
    assert db.news
    assert db.tickers == {}


def test_adapter_sin_hechos_no_escribe() -> None:
    db = _Db([])

    resumen = CmfNewsAdapter(aliases={}).run(db)

    assert resumen["status"] == "empty"
    assert [c for c in db.calls if c[1] == "upsert"] == []


def test_dry_run_no_lee_ni_escribe() -> None:
    adapter = CmfNewsAdapter(dry_run=True, aliases={"banco de chile": "CHILE"})

    resumen = adapter.run(_DbVeneno())

    assert resumen["status"] == "dry_run"
    assert resumen["dry_run"] is True
    assert resumen["news"] == 0


def test_preview_con_json_local_no_toca_la_base() -> None:
    adapter = CmfNewsAdapter(dry_run=True, aliases={"banco de chile": "CHILE"})

    resumen = adapter.run(None, eventos=[EVENTO])

    assert resumen["status"] == "dry_run"
    assert resumen["news"] == 1
    assert resumen["tickers"] == 1


def test_cli_dry_run_no_abre_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    import news_cmf

    def _no_db() -> Any:
        raise AssertionError("--dry-run no debe abrir Supabase")

    monkeypatch.setattr(news_cmf, "_db", _no_db)

    assert news_cmf.main(["--dry-run"]) == 0


# --------------------------------------------------------------------------
# Etapa
# --------------------------------------------------------------------------


def _load_stage() -> Any:
    spec = importlib.util.spec_from_file_location("stage_news_cmf", STAGE_PATH)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_stage_define_contrato() -> None:
    stage = _load_stage()

    assert stage.STAGE == ("news_cmf", stage.STAGE[1], False)
    assert callable(stage.run)


def test_stage_apagado_por_defecto(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NEWS_IMPACT_ENABLED", raising=False)
    stage = _load_stage()

    resultado = stage.run(_DbVeneno(), dry_run=False)

    assert resultado[0]["status"] == "disabled"
    assert resultado[0]["flag"] == "NEWS_IMPACT_ENABLED"


def test_stage_dry_run_no_toca_la_base(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEWS_IMPACT_ENABLED", "true")
    stage = _load_stage()

    resultado = stage.run(_DbVeneno(), dry_run=True)

    assert resultado[0]["status"] == "dry_run"


def test_stage_ingesta_usa_el_db(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEWS_IMPACT_ENABLED", "true")
    stage = _load_stage()
    db = _Db([EVENTO])

    resultado = stage.run(db, dry_run=False)

    assert resultado[0]["news"] == 1
    assert resultado[0]["tickers"] >= 0


@pytest.mark.parametrize("confianza", [EXACT_CONFIDENCE, APPROX_CONFIDENCE])
def test_confianzas_permitidas(confianza: float) -> None:
    assert 0.0 <= confianza <= 1.0
