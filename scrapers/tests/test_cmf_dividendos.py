"""Dividendos CMF (F31): parser, cliente con WAF y etapa. Sin red ni Supabase.

Correr:
  uv run --no-project --with pytest --with-requirements scrapers/requirements.txt \
      python -m pytest scrapers/tests/test_cmf_dividendos.py -q
o con el venv del proyecto:
  python -m pytest scrapers/tests/test_cmf_dividendos.py -q
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from cmf_client import CmfBlocked, CmfClient, _is_blocked  # noqa: E402
from cmf_dividendos import (  # noqa: E402
    CmfDividendosAdapter,
    dedupe_dividendos,
    grid_params,
    parse_dividendos,
    source_url,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "cmf"
GRID_2026 = FIXTURES / "acc_dividendos1grid_2026.html"
GRID_EMPTY = FIXTURES / "acc_dividendos1grid_empty.html"
INDEX = FIXTURES / "acc_dividendos_index.html"
BLOCKED = FIXTURES / "cmf_blocked_blocked_synthetic.html"
STAGE_PATH = RAIZ / "stages" / "cmf_dividendos.py"


def _texto(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# Parser de la grilla real (fixture vivo)
# --------------------------------------------------------------------------


def test_la_grilla_2026_trae_todos_los_dividendos() -> None:
    crudos = parse_dividendos(_texto(GRID_2026))
    registros = dedupe_dividendos(crudos)
    assert len(crudos) == 219
    assert len(registros) == 201  # el fixture trae columnas repetidas


def test_primera_fila_santamaria() -> None:
    registros = dedupe_dividendos(parse_dividendos(_texto(GRID_2026)))
    fila = next(r for r in registros if r["nemo"] == "SANTAMARIA")
    assert fila["fecha_pago"] == "2026-04-29"
    assert fila["fecha_limite"] == "2026-04-23"
    assert fila["numero_dividendo"] == "78"
    assert fila["serie"] == "U"
    assert fila["tipo"] == "definitivo"
    assert fila["monto"] == pytest.approx(12.485)
    assert fila["moneda"] == "PESOS"
    assert fila["rut_emisor"] == "98.000.000-1"
    assert fila["fuente"] == "cmf"


def test_tipos_provisorio_y_adicional() -> None:
    registros = dedupe_dividendos(parse_dividendos(_texto(GRID_2026)))
    tipos = {r["tipo"] for r in registros}
    assert {"provisorio", "definitivo", "adicional"} <= tipos
    habitat = [r for r in registros if r["nemo"] == "HABITAT"]
    assert {r["tipo"] for r in habitat} == {"provisorio", "adicional"}


def test_series_distintas_no_se_pisan() -> None:
    registros = dedupe_dividendos(parse_dividendos(_texto(GRID_2026)))
    aguas = [r for r in registros if r["nemo"] in {"AGUAS-A", "AGUAS-B"}]
    series = {r["serie"] for r in aguas}
    assert {"A", "B"} <= series


def test_grilla_vacia_y_formulario_no_son_datos() -> None:
    assert parse_dividendos(_texto(GRID_EMPTY)) == []
    assert parse_dividendos(_texto(INDEX)) == []
    assert parse_dividendos("") == []


def test_dedupe_por_clave() -> None:
    fila = {
        "nemo": "FOO",
        "fecha_pago": "2026-01-02",
        "numero_dividendo": "1",
        "serie": "U",
        "monto": 1.0,
    }
    assert len(dedupe_dividendos([fila, dict(fila)])) == 1
    otra = {**fila, "serie": "B"}
    assert len(dedupe_dividendos([fila, otra])) == 2


def test_params_y_url_de_la_grilla() -> None:
    params = grid_params(2026)
    assert params["sociedad[]"] == "0"
    assert params["anno"] == "2026"
    url = source_url(2026)
    assert url.startswith("https://www.cmfchile.cl/")
    assert "sociedad%5B%5D=0" in url
    assert "anno=2026" in url


# --------------------------------------------------------------------------
# Cliente con WAF
# --------------------------------------------------------------------------


class _Resp:
    def __init__(self, status: int, body: str) -> None:
        self.status_code = status
        self.content = body.encode("utf-8")


class _Session:
    def __init__(self, responses: list[object]) -> None:
        self.responses = list(responses)
        self.calls: list[tuple] = []

    def request(self, method, url, params=None, data=None, headers=None):  # noqa: ANN001
        self.calls.append((method, url, params))
        respuesta = self.responses.pop(0)
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta

    def close(self) -> None:  # pragma: no cover
        pass


def _client(responses: list[object], **kwargs) -> tuple[CmfClient, _Session]:
    client = CmfClient(min_interval=0, sleep=lambda _s: None, **kwargs)
    session = _Session(responses)
    client._session = session
    return client, session


def test_detecta_pagina_de_bloqueo() -> None:
    assert _is_blocked(200, _texto(BLOCKED))
    assert _is_blocked(403, "<html>ok</html>")
    assert not _is_blocked(200, "<html>Contenido normal</html>")


def test_get_lanza_cmfblocked_con_pagina_de_bloqueo() -> None:
    client, _ = _client([_Resp(200, _texto(BLOCKED))])
    with pytest.raises(CmfBlocked) as exc:
        client.get("/institucional/estadisticas/acc_dividendos1grid.php")
    assert exc.value.status == 200


def test_get_lanza_cmfblocked_con_403() -> None:
    client, _ = _client([_Resp(403, "")])
    with pytest.raises(CmfBlocked):
        client.get("https://www.cmfchile.cl/x")


def test_reintenta_en_5xx_y_devuelve_texto() -> None:
    client, session = _client([_Resp(503, "nope"), _Resp(200, "listo")], max_retries=1)
    assert client.get("/x") == "listo"
    assert len(session.calls) == 2


def test_reintenta_en_errores_de_red() -> None:
    client, session = _client([ConnectionError("boom"), _Resp(200, "ok")], max_retries=1)
    assert client.get("/x") == "ok"
    assert len(session.calls) == 2


def test_404_es_error_no_bloqueo() -> None:
    client, _ = _client([_Resp(404, "missing")])
    with pytest.raises(RuntimeError) as exc:
        client.get("/x")
    assert not isinstance(exc.value, CmfBlocked)


def test_get_pasa_los_params() -> None:
    client, session = _client([_Resp(200, "ok")])
    client.get("/x", params={"a": "1"})
    assert session.calls[0][2] == {"a": "1"}


# --------------------------------------------------------------------------
# Adaptador
# --------------------------------------------------------------------------


class _ClientStub:
    def __init__(self, body: str = "", error: Exception | None = None) -> None:
        self.body = body
        self.error = error
        self.llamadas = 0

    def get(self, url, params=None):  # noqa: ANN001
        self.llamadas += 1
        if self.error:
            raise self.error
        return self.body


def test_adapter_dry_run_no_escribe() -> None:
    adapter = CmfDividendosAdapter(dry_run=True, client=_ClientStub(_texto(GRID_2026)))
    resumen = adapter.run(None)
    assert resumen["status"] == "ok"
    assert resumen["dividendos"] == 201
    assert resumen["dry_run"] is True


def test_adapter_upsert_idempotente() -> None:
    llamadas: list[tuple] = []

    class _Query:
        def upsert(self, payload, **kwargs):  # noqa: ANN001
            llamadas.append((payload, kwargs))
            return self

        def execute(self):
            return self

    class _Db:
        def table(self, name):  # noqa: ANN001
            llamadas.append(("table", name))
            return _Query()

    adapter = CmfDividendosAdapter(dry_run=False, client=_ClientStub(_texto(GRID_2026)))
    resumen = adapter.run(_Db())
    assert resumen["dividendos"] == 201
    payload, kwargs = llamadas[-1]
    assert len(payload) == 201
    assert kwargs["on_conflict"] == "nemo,fecha_pago,numero_dividendo,serie"
    assert kwargs["ignore_duplicates"] is True
    assert all(fila["source_url"].startswith("https://www.cmfchile.cl/") for fila in payload)


def test_adapter_propaga_cmfblocked() -> None:
    adapter = CmfDividendosAdapter(
        dry_run=True,
        client=_ClientStub(error=CmfBlocked("https://www.cmfchile.cl/x", 403)),
    )
    with pytest.raises(CmfBlocked):
        adapter.run(None)


# --------------------------------------------------------------------------
# Etapa: CmfBlocked registra scraper_error y sigue
# --------------------------------------------------------------------------


def _load_stage():
    spec = importlib.util.spec_from_file_location("stage_cmf_dividendos", STAGE_PATH)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class _FakeResult:
    def __init__(self, data):  # noqa: ANN001
        self.data = data


class _FakeQuery:
    def __init__(self, db, name):  # noqa: ANN001
        self.db = db
        self.name = name
        self.op = None
        self.payload = None

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def insert(self, payload):  # noqa: ANN001
        self.op = "insert"
        self.payload = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        self.db.calls.append((self.name, self.op, self.payload))
        if self.name == "portfolios" and self.op == "select":
            return _FakeResult({"id": "pf-dividendos"})
        return _FakeResult(None)


class _FakeDb:
    def __init__(self):
        self.calls: list[tuple] = []

    def table(self, name):  # noqa: ANN001
        return _FakeQuery(self, name)


def _block_client(monkeypatch) -> None:
    import cmf_client

    def _boom(self, *args, **kwargs):  # noqa: ANN001
        raise CmfBlocked("https://www.cmfchile.cl/x", 403, "WAF")

    monkeypatch.setattr(cmf_client.CmfClient, "get", _boom)


def test_stage_registra_scraper_error_al_bloquear(monkeypatch) -> None:
    stage = _load_stage()
    db = _FakeDb()
    _block_client(monkeypatch)

    resultado = stage.run(db, dry_run=False)

    assert resultado[0]["status"] == "blocked"
    alertas = [c for c in db.calls if c[0] == "alerts" and c[1] == "insert"]
    assert len(alertas) == 1
    payload = alertas[0][2]
    assert payload["type"] == "scraper_error"
    assert payload["portfolio_id"] == "pf-dividendos"
    assert payload["is_published"] is False
    assert payload["payload"]["source"] == "cmf_dividendos"


def test_stage_en_dry_run_no_registra_error(monkeypatch) -> None:
    stage = _load_stage()
    db = _FakeDb()
    _block_client(monkeypatch)

    resultado = stage.run(db, dry_run=True)

    assert resultado[0]["status"] == "blocked"
    assert [c for c in db.calls if c[0] == "alerts"] == []


def test_stage_cmf_dividendos_define_stage() -> None:
    stage = _load_stage()
    assert stage.STAGE[0] == "cmf_dividendos"
    assert stage.STAGE[2] is False
    assert callable(stage.run)


# --------------------------------------------------------------------------
# Migracion 031: idempotente y de lectura publica
# --------------------------------------------------------------------------


def test_migracion_031_es_idempotente_y_publica() -> None:
    sql = (RAIZ.parent / "supabase" / "migrations" / "031_dividendos_cl.sql").read_text(
        encoding="utf-8"
    )
    assert "create table if not exists public.cl_dividends" in sql
    assert "unique (nemo, fecha_pago, numero_dividendo, serie)" in sql
    assert "drop policy if exists" in sql
    assert "using (true)" in sql
    assert "grant select on table public.cl_dividends to anon, authenticated" in sql
    # El portafolio se upsertea (no un insert a secas) para poder reejecutar.
    assert "'dividendos-cl'" in sql
    assert "on conflict (slug) do update" in sql
