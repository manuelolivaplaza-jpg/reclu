"""Noticias 8-K de la SEC (EDGAR). Sin red ni Supabase.

El fixture Atom es sintético y sigue la forma del feed oficial: título con
emisor y CIK, link al índice, summary con "Filed:" y "AccNo:", updated con
zona horaria y category con el form type. El documento principal trae los
ítems 2.02 y 9.01, un 2.02 repetido y un 99.01 falso.

Correr desde scrapers/:
  uv run --with pytest --with-requirements requirements.txt pytest -q tests/test_news_edgar.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from news_edgar import (  # noqa: E402
    ITEM_DESCRIPTIONS,
    NewsEdgarAdapter,
    news_enabled,
    news_record,
    news_row,
    parse_8k_items,
    parse_atom_feed,
    relation_record,
    resolve_primary_doc,
    summarize_items,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "edgar_8k"
ATOM = FIXTURES / "atom_2026-10-20.xml"
PRIMARY = FIXTURES / "primary_apple.htm"

TICKERS = {
    "320193": {"ticker": "AAPL", "title": "Apple Inc."},
    "21344": {"ticker": "KO", "title": "The Coca-Cola Company"},
    "789019": {"ticker": "MSFT", "title": "Microsoft Corporation"},
}
TICKERS_JSON = json.dumps(
    {
        "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
        "1": {"cik_str": 21344, "ticker": "KO", "title": "The Coca-Cola Company"},
        "2": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corporation"},
    }
)
AAPL_URL = (
    "https://www.sec.gov/Archives/edgar/data/320193/"
    "000032019326000123/0000320193-26-000123-index.htm"
)


def _atom() -> str:
    return ATOM.read_text(encoding="utf-8")


def _primary() -> str:
    return PRIMARY.read_text(encoding="utf-8")


def _fake_get_text(adapter: NewsEdgarAdapter, url: str) -> str:
    """Red simulada: feed, mapa de tickers, índices y documento principal."""
    if url == "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=100&output=atom":
        return _atom()
    if url == "https://www.sec.gov/files/company_tickers.json":
        return TICKERS_JSON
    if url.endswith("/index.json"):
        folder = url[: -len("/index.json")]
        return json.dumps(
            {
                "directory": {
                    "item": [
                        {"name": "R1.htm"},
                        {"name": "Financial_Report.xlsx"},
                        {"name": "primary.htm"},
                    ]
                }
            }
        )
    if url.endswith("/primary.htm"):
        assert "/Archives/edgar/data/" in url
        return _primary()
    raise AssertionError(f"URL inesperada en el test: {url}")


class _Res:
    def __init__(self, data: list[dict]) -> None:
        self.data = data


class _Tabla:
    def __init__(self, name: str, db: "_Db") -> None:
        self.name = name
        self.db = db
        self._selecting = False
        self._values: list[str] = []

    def upsert(self, rows: list[dict], on_conflict: str | None = None) -> "_Tabla":
        self.db.calls.append(("upsert", self.name, list(rows), on_conflict))
        return self

    def select(self, columns: str) -> "_Tabla":
        self._selecting = True
        self.db.calls.append(("select", self.name, columns))
        return self

    def in_(self, column: str, values: list[str]) -> "_Tabla":
        self._values = list(values)
        return self

    def execute(self) -> _Res:
        if self._selecting:
            return _Res([{"id": f"n-{h[:8]}", "hash": h} for h in self._values])
        return _Res([])


class _Db:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def table(self, name: str) -> _Tabla:
        return _Tabla(name, self)


class _DbVeneno:
    def __getattr__(self, name: str):
        raise AssertionError(f"dry-run tocó Supabase: db.{name}()")


# --- 1. Feed Atom -----------------------------------------------------------


def test_parse_atom_lee_solo_8k_y_conserva_el_orden() -> None:
    entries = parse_atom_feed(_atom())

    assert [entry["accession"] for entry in entries] == [
        "0000320193-26-000123",
        "0000021344-26-000045",
        "0000789019-26-000067",
        "0000999999-26-000001",
    ]
    assert [entry["form"] for entry in entries] == ["8-K", "8-K", "8-K/A", "8-K"]
    assert all(entry["cik"] for entry in entries)


def test_parse_atom_normaliza_campos_de_la_entrada() -> None:
    apple = parse_atom_feed(_atom())[0]

    assert apple["cik"] == "320193"
    assert apple["company"] == "APPLE INC"
    assert apple["url"] == AAPL_URL
    assert apple["filed_at"] == "2026-10-20"
    # 16:30 en EDT (UTC-4) = 20:30 UTC.
    assert apple["published_at"] == "2026-10-20T20:30:00+00:00"


def test_parse_atom_deduplica_por_accession() -> None:
    first_entry = _atom().split("<entry>")[1].split("</entry>")[0]
    xml = _atom().replace(
        "</feed>", f"<entry>{first_entry}</entry>\n</feed>"
    )
    entries = parse_atom_feed(xml)
    assert len([e for e in entries if e["accession"] == "0000320193-26-000123"]) == 1


# --- 2. Ítems y resumen -----------------------------------------------------


def test_parse_8k_items_deduplica_y_descarta_codigos_desconocidos() -> None:
    assert parse_8k_items(_primary()) == ["2.02", "9.01"]


def test_parse_8k_items_acepta_nbsp_y_mayusculas() -> None:
    html = "<p>ITEM&nbsp;5.02</p><p>Item 8.01 Other Events</p>"
    assert parse_8k_items(html) == ["5.02", "8.01"]


def test_resumen_corto_con_los_items() -> None:
    assert summarize_items(["9.01", "2.02", "2.02"]) == (
        "8-K: Item 2.02 Results of Operations and Financial Condition; "
        "Item 9.01 Financial Statements and Exhibits"
    )


def test_resumen_sin_items_es_propio_y_corto() -> None:
    resumen = summarize_items([])
    assert resumen.startswith("8-K: presentación ante la SEC")
    assert "<" not in resumen


def test_resumen_nunca_supera_500_caracteres() -> None:
    resumen = summarize_items(list(ITEM_DESCRIPTIONS))
    assert len(resumen) <= 500
    assert resumen.endswith("...")


# --- 3. Fila de noticia y relación ------------------------------------------


def test_news_row_arma_hash_titulo_y_resumen() -> None:
    apple = parse_atom_feed(_atom())[0]
    row = news_row(apple, symbol="AAPL", company="Apple Inc.", items=["2.02", "9.01"])

    assert row["source"] == "sec_8k"
    assert row["hash"] == hashlib.sha256(AAPL_URL.encode("utf-8")).hexdigest()
    assert row["title"] == "Apple Inc. (AAPL): 8-K"
    assert row["lang"] == "en"
    assert row["summary"].startswith("8-K: Item 2.02 Results of Operations")
    assert row["symbol"] == "AAPL"


def test_news_record_solo_guarda_columnas_permitidas() -> None:
    apple = parse_atom_feed(_atom())[0]
    record = news_record(
        news_row(apple, symbol="AAPL", company="Apple Inc.", items=["2.02"])
    )

    assert set(record) == {
        "source",
        "url",
        "title",
        "summary",
        "published_at",
        "lang",
        "hash",
    }
    assert record["source"] == "sec_8k"
    assert "<html" not in record["summary"].lower()
    assert len(record["summary"]) <= 500


def test_relacion_directa_confianza_uno() -> None:
    relation = relation_record("uuid-1", "AAPL")
    assert relation == {
        "news_id": "uuid-1",
        "symbol": "AAPL",
        "relation": "direct",
        "confidence": 1.0,
    }


# --- 4. Documento principal -------------------------------------------------


def test_resolve_primary_doc_ignora_xbrl_y_reportes_r() -> None:
    body = json.dumps(
        {
            "directory": {
                "item": [
                    {"name": "R1.htm"},
                    {"name": "Financial_Report.xlsx"},
                    {"name": "aapl-20261020.htm"},
                ]
            }
        }
    )
    assert (
        resolve_primary_doc(body, "https://www.sec.gov/Archives/edgar/data/1/2")
        == "https://www.sec.gov/Archives/edgar/data/1/2/aapl-20261020.htm"
    )


def test_resolve_primary_doc_desde_indice_html() -> None:
    body = '<a href="/Archives/edgar/data/1/2/doc.htm">Document</a>'
    assert resolve_primary_doc(body, "https://www.sec.gov/Archives/edgar/data/1/2") == (
        "https://www.sec.gov/Archives/edgar/data/1/2/doc.htm"
    )


# --- 5. Adaptador: dry-run y escritura --------------------------------------


def test_flag_apagada_por_defecto_y_solo_true_la_enciende() -> None:
    assert news_enabled({}) is False
    assert news_enabled({"NEWS_IMPACT_ENABLED": "1"}) is False
    assert news_enabled({"NEWS_IMPACT_ENABLED": "True"}) is False
    assert news_enabled({"NEWS_IMPACT_ENABLED": "true"}) is True


def test_dry_run_no_toca_supabase_y_cuenta_los_filings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(NewsEdgarAdapter, "_get_text", _fake_get_text)
    adapter = NewsEdgarAdapter(dry_run=True)

    resumen = adapter.run(_DbVeneno())

    assert resumen == {
        "source": "news_edgar",
        "news": 3,
        "tickers": 3,
        "with_items": 3,
        "skipped_no_ticker": 1,
        "feed": 4,
        "status": "ok",
        "dry_run": True,
    }


def test_escritura_upsert_por_hash_y_relacion_directa(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(NewsEdgarAdapter, "_get_text", _fake_get_text)
    db = _Db()

    resumen = NewsEdgarAdapter(dry_run=False).run(db)

    news_upserts = [
        call for call in db.calls if call[0] == "upsert" and call[1] == "news_items"
    ]
    assert news_upserts, "no se escribieron news_items"
    assert news_upserts[0][3] == "hash"
    records = news_upserts[0][2]
    assert len(records) == 3
    assert all(record["source"] == "sec_8k" for record in records)
    assert {record["url"] for record in records} == {
        AAPL_URL,
        "https://www.sec.gov/Archives/edgar/data/21344/000002134426000045/0000021344-26-000045-index.htm",
        "https://www.sec.gov/Archives/edgar/data/789019/000078901926000067/0000789019-26-000067-index.htm",
    }

    rel_upserts = [
        call for call in db.calls if call[0] == "upsert" and call[1] == "news_tickers"
    ]
    assert rel_upserts, "no se escribieron news_tickers"
    assert rel_upserts[0][3] == "news_id,symbol,relation"
    relations = rel_upserts[0][2]
    assert len(relations) == 3
    assert all(relation["relation"] == "direct" for relation in relations)
    assert all(relation["confidence"] == 1.0 for relation in relations)
    assert {relation["symbol"] for relation in relations} == {"AAPL", "KO", "MSFT"}
    assert resumen["written"] == 3
    assert resumen["relations"] == 3


def test_feed_caido_devuelve_vacio_sin_explotar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _caido(_adapter: NewsEdgarAdapter, _url: str) -> str:
        raise RuntimeError("sin red")

    monkeypatch.setattr(NewsEdgarAdapter, "_get_text", _caido)
    resumen = NewsEdgarAdapter(dry_run=True, tickers=TICKERS).run(_DbVeneno())

    assert resumen["status"] == "empty"
    assert resumen["news"] == 0


# --- 6. Etapa ---------------------------------------------------------------


def test_la_etapa_existe_y_se_descubre() -> None:
    from stages import discover_stages

    ids = [meta[0] for meta, _runner in discover_stages()]
    assert "news_edgar" in ids


def test_etapa_apagada_no_corre_ni_toca_la_red(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("NEWS_IMPACT_ENABLED", raising=False)
    from stages import discover_stages

    runners = {meta[0]: runner for meta, runner in discover_stages()}
    resultado = runners["news_edgar"](None, True)

    assert resultado == [
        {
            "source": "news_edgar",
            "status": "skipped",
            "reason": "NEWS_IMPACT_ENABLED != true",
            "dry_run": True,
        }
    ]
