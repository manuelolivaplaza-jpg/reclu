"""Hechos esenciales CMF (F32): parser, clasificacion pura y etapa. Sin red.

Correr:
  uv run --no-project --with pytest --with-requirements scrapers/requirements.txt \
      python -m pytest scrapers/tests/test_cmf_hechos.py -q
o con el venv del proyecto:
  python -m pytest scrapers/tests/test_cmf_hechos.py -q
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from cmf_client import CmfBlocked  # noqa: E402
from cmf_hechos import (  # noqa: E402
    CATEGORIAS,
    CmfHechosAdapter,
    alert_title,
    classify,
    dedupe_hechos,
    is_relevant,
    match_rut,
    mention_alert,
    parse_hechos,
    rut_map_from_dividendos,
    source_url,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "cmf"
PORTADA = FIXTURES / "hechos_portada_2026.html"
STAGE_PATH = RAIZ / "stages" / "cmf_hechos.py"


def _texto(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# Clasificacion pura
# --------------------------------------------------------------------------


def test_classify_categorias_relevantes() -> None:
    assert classify("Oferta pública de adquisición de acciones (OPA)") == "opa"
    assert classify("Aumento de capital") == "aumento_capital"
    assert classify("Reparto de utilidades (pago de dividendos)") == "dividendo"
    assert classify("Cambio de control") == "cambio_control"
    assert classify("Activos o paquetes accionarios, adquisición o enajenación") == "cambio_control"
    assert classify("Compra o venta de acciones") == "compra_venta_acciones"


def test_classify_ignora_tildes_y_mayusculas() -> None:
    assert classify("CAMBIO DE CONTROL") == "cambio_control"
    assert classify("junta extraordinaria de accionistas, citaciones") == "junta_accionistas"
    assert classify("Colocación de valores en mercados internacionales") == "colocacion"
    assert classify("División, fusión o constitución de sociedades") == "fusion"


def test_classify_otro_y_vacio() -> None:
    assert classify("Otros") == "otro"
    assert classify("Cambio Gerentes / Directorio") == "otro"
    assert classify("") == "otro"
    assert classify("   ") == "otro"


def test_classify_no_es_recomendacion_ni_ia() -> None:
    # Pura: misma entrada, misma salida, sin red ni estado.
    for materia in ("Aumento de capital", "Otros", "OPA"):
        assert classify(materia) == classify(materia)


def test_is_relevant() -> None:
    assert is_relevant("opa")
    assert is_relevant("aumento_capital")
    assert is_relevant("dividendo")
    assert is_relevant("cambio_control")
    assert is_relevant("compra_venta_acciones")
    assert not is_relevant("colocacion")
    assert not is_relevant("junta_accionistas")
    assert not is_relevant("otro")


def test_categorias_cubren_todas_las_reglas() -> None:
    assert "otro" in CATEGORIAS
    assert len(CATEGORIAS) == len(set(CATEGORIAS))  # sin duplicados


# --------------------------------------------------------------------------
# Parser de la portada real (fixture vivo 2026-10-19)
# --------------------------------------------------------------------------


def test_parser_trae_los_hechos_de_la_portada() -> None:
    registros = parse_hechos(_texto(PORTADA))
    assert len(registros) == 71


def test_parser_primera_fila_banchile() -> None:
    registros = parse_hechos(_texto(PORTADA))
    fila = registros[0]
    assert fila["numero_documento"] == "2026100670579"
    assert fila["fecha"] == "2026-10-19"
    assert fila["fecha_hora"] == "2026-10-19T18:14:30"
    assert fila["emisor"] == "BANCHILE CORREDORES DE BOLSA S.A."
    assert fila["materia"] == "Otros"
    assert fila["categoria"] == "otro"
    assert fila["url"].startswith("https://www.cmfchile.cl/sitio/aplic/serdoc/ver_sgd.php?s567=")


def test_parser_decodea_tildes_y_links() -> None:
    registros = parse_hechos(_texto(PORTADA))
    itau = next(r for r in registros if r["emisor"] == "BANCO ITAÚ CHILE")
    assert itau["categoria"] == "colocacion"
    enap = next(r for r in registros if "ENAP" in r["emisor"])
    assert enap["categoria"] == "cambio_control"
    assert "s567=" in enap["url"]


def test_parser_titulo_es_emisor_mas_materia() -> None:
    registros = parse_hechos(_texto(PORTADA))
    assert registros[0]["titulo"] == "BANCHILE CORREDORES DE BOLSA S.A.: Otros"


def test_parser_html_vacio_o_basura_no_es_datos() -> None:
    assert parse_hechos("") == []
    assert parse_hechos("<html><body>Sin datos</body></html>") == []
    # El index del buscador (con captcha) no es la portada: no trae filas de datos.
    assert parse_hechos("<table><tr><td>x</td></tr></table>") == []


def test_dedupe_por_numero_documento() -> None:
    registros = parse_hechos(_texto(PORTADA))
    duplicados = dedupe_hechos(registros + [dict(registros[0])])
    assert len(duplicados) == len(registros)
    fila = {"numero_documento": ""}
    assert dedupe_hechos([fila]) == []


def test_source_url_es_la_portada() -> None:
    assert source_url() == "https://www.cmfchile.cl/institucional/hechos/hechos_portada.php"


# --------------------------------------------------------------------------
# RUT opcional desde cl_dividends (F31)
# --------------------------------------------------------------------------


def test_rut_map_y_match() -> None:
    rows = [
        {"rut_emisor": "96.000.000-1", "razon_social": "SANTAMARIA S.A.", "nemo": "SANTAMARIA"},
        {"rut_emisor": "", "razon_social": "VACIO S.A.", "nemo": "VACIO"},
    ]
    mapa = rut_map_from_dividendos(rows)
    assert mapa["santamaria s.a."] == "96.000.000-1"
    assert match_rut("SANTAMARIA S.A.", mapa) == "96.000.000-1"
    assert match_rut("Otra Empresa", mapa) == ""
    assert match_rut("", mapa) == ""
    assert match_rut("X", {}) == ""


# --------------------------------------------------------------------------
# Alertas mention
# --------------------------------------------------------------------------


def test_mention_alert_tiene_source_url() -> None:
    hecho = {
        "fecha": "2026-10-19",
        "numero_documento": "2026100670499",
        "emisor": "FACTORING SECURITY S.A.",
        "materia": "Colocación de valores en mercados internacionales y/o nacionales",
        "categoria": "colocacion",
        "url": "https://www.cmfchile.cl/sitio/aplic/serdoc/ver_sgd.php?s567=x",
    }
    alerta = mention_alert("pf-1", hecho)
    assert alerta["type"] == "mention"
    assert alerta["portfolio_id"] == "pf-1"
    assert alerta["payload"]["source_url"].startswith("https://www.cmfchile.cl/")
    assert alerta["payload"]["numero_documento"] == "2026100670499"
    assert alerta["is_published"] is True
    assert alerta["summary"] is None  # la IA lo llena despues


def test_alert_title_y_severity() -> None:
    opa = {
        "emisor": "EMPRESA X",
        "categoria": "opa",
        "numero_documento": "1",
        "url": "https://www.cmfchile.cl/x",
    }
    assert alert_title(opa) == "CMF: OPA — EMPRESA X"
    dividendo = {
        "emisor": "EMPRESA X",
        "categoria": "dividendo",
        "numero_documento": "2",
        "url": "https://www.cmfchile.cl/y",
    }
    assert alert_title(dividendo) == "CMF: Dividendo — EMPRESA X"
    assert mention_alert("pf", opa)["severity"] == "high"
    assert mention_alert("pf", dividendo)["severity"] == "medium"


# --------------------------------------------------------------------------
# Adaptador
# --------------------------------------------------------------------------


class _ClientStub:
    def __init__(self, body: str = "", error: Exception | None = None) -> None:
        self.body = body
        self.error = error

    def get(self, url, params=None):  # noqa: ANN001
        if self.error:
            raise self.error
        return self.body


def test_adapter_dry_run_no_escribe() -> None:
    adapter = CmfHechosAdapter(dry_run=True, client=_ClientStub(_texto(PORTADA)))
    resumen = adapter.run(None)
    assert resumen["status"] == "ok"
    assert resumen["hechos"] == 71
    assert resumen["dry_run"] is True


def test_adapter_upsert_idempotente_y_solo_nuevos_alertan() -> None:
    llamadas: list[tuple] = []
    existentes = {"2026100670579"}  # ya en la DB

    class _Query:
        def __init__(self, name):  # noqa: ANN001
            self.name = name
            self.op = None
            self.payload = None

        def upsert(self, payload, **kwargs):  # noqa: ANN001
            self.op = "upsert"
            self.payload = payload
            llamadas.append(("upsert", self.name, payload, kwargs))
            return self

        def select(self, *_a):
            self.op = "select"
            return self

        def in_(self, *_a):
            return self

        def eq(self, *_a):
            return self

        def maybe_single(self):
            return self

        def insert(self, payload):  # noqa: ANN001
            self.op = "insert"
            self.payload = payload
            llamadas.append(("insert", self.name, payload))
            return self

        def execute(self):
            if self.name == "cl_material_events" and self.op == "select":
                return _FakeResult(
                    [{"numero_documento": n} for n in existentes]
                )
            if self.name == "portfolios" and self.op == "select":
                return _FakeResult({"id": "pf-hechos"})
            return _FakeResult(None)

    class _Db:
        def table(self, name):  # noqa: ANN001
            return _Query(name)

    class _FakeResult:
        def __init__(self, data):  # noqa: ANN001
            self.data = data

    adapter = CmfHechosAdapter(dry_run=False, client=_ClientStub(_texto(PORTADA)))
    db = _Db()
    resumen = adapter.run(db)
    assert resumen["hechos"] == 71
    assert resumen["upsert"] == 71
    # upsert con on_conflict numero_documento, ignore_duplicates
    ups = [c for c in llamadas if c[0] == "upsert"]
    assert len(ups) == 1
    assert ups[0][3]["on_conflict"] == "numero_documento"
    assert ups[0][3]["ignore_duplicates"] is True
    # solo los hechos nuevos relevantes generan alerta
    alertas = [c for c in llamadas if c[0] == "insert" and c[1] == "alerts"]
    insertados = [c for c in llamadas if c[0] == "insert" and c[1] == "cl_material_events"]
    # 'hechos_nuevos' filtrara el 2026100670579; alertas solo de relevantes nuevos
    assert all(a[2]["type"] == "mention" for a in alertas)


def test_adapter_propaga_cmfblocked() -> None:
    adapter = CmfHechosAdapter(
        dry_run=True,
        client=_ClientStub(error=CmfBlocked("https://www.cmfchile.cl/x", 403)),
    )
    with pytest.raises(CmfBlocked):
        adapter.run(None)


# --------------------------------------------------------------------------
# Etapa: CmfBlocked registra scraper_error y sigue
# --------------------------------------------------------------------------


def _load_stage():
    spec = importlib.util.spec_from_file_location("stage_cmf_hechos", STAGE_PATH)
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
            return _FakeResult({"id": "pf-hechos"})
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
    assert payload["portfolio_id"] == "pf-hechos"
    assert payload["is_published"] is False
    assert payload["payload"]["source"] == "cmf_hechos"


def test_stage_en_dry_run_no_registra_error(monkeypatch) -> None:
    stage = _load_stage()
    db = _FakeDb()
    _block_client(monkeypatch)

    resultado = stage.run(db, dry_run=True)

    assert resultado[0]["status"] == "blocked"
    assert [c for c in db.calls if c[0] == "alerts"] == []


def test_stage_cmf_hechos_define_stage() -> None:
    stage = _load_stage()
    assert stage.STAGE[0] == "cmf_hechos"
    assert stage.STAGE[2] is False
    assert callable(stage.run)


# --------------------------------------------------------------------------
# Migracion 032: idempotente y de lectura publica
# --------------------------------------------------------------------------


def test_migracion_032_es_idempotente_y_publica() -> None:
    sql = (RAIZ.parent / "supabase" / "migrations" / "032_hechos_esenciales.sql").read_text(
        encoding="utf-8"
    )
    assert "create table if not exists public.cl_material_events" in sql
    assert "unique (numero_documento)" in sql
    assert "drop policy if exists" in sql
    assert "using (true)" in sql
    assert "grant select on table public.cl_material_events to anon, authenticated" in sql
    # El portafolio se upsertea para poder reejecutar la migracion.
    assert "'hechos-esenciales-cl'" in sql
    assert "on conflict (slug) do update" in sql
    # El check de categorias coincide con CATEGORIAS del scraper.
    for categoria in CATEGORIAS:
        assert f"'{categoria}'" in sql
