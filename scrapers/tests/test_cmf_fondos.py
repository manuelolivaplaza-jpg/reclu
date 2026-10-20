"""Fondos mutuos de acciones nacionales CMF (F34): parser, adaptador y etapa.

Sin red: las respuestas de la CMF se reemplazan por fixtures de texto.

Correr:
  python -m pytest scrapers/tests/test_cmf_fondos.py -q
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from cmf_fondos import (  # noqa: E402
    CONFLICT_FUNDS,
    CONFLICT_HOLDINGS,
    CONFLICT_PORTFOLIO_HOLDINGS,
    CmfFondosAdapter,
    aplicar_previous,
    es_acciones_nacionales,
    fecha_cierre,
    parse_cartera,
    periodo_anterior,
    periodo_por_defecto,
    periodo_partes,
    ponderar_holdings,
    seleccionar_fondos,
)
from cmf_client import CmfBlocked  # noqa: E402
from stages import discover_stages  # noqa: E402

MIGRACION = RAIZ.parent / "supabase" / "migrations" / "034_fondos_mutuos.sql"

CABECERA = ";".join(
    [
        "Run Fondo",
        "Nombre Fondo",
        "FFM_6010100",
        "FFM_6010211",
        "FFM_6010212",
        "FFM_6010300",
        "FFM_6010400",
        "FFM_6010500",
        "FFM_6010600",
        "FFM_6010700",
        "FFM_6010800",
        "FFM_6010900",
        "FFM_6011000",
        "FFM_TIR_6011111",
        "FFM_PAR_6011111",
        "FFM_REL_6011111",
        "FFM_6011112",
        "FFM_6011113",
        "FFM_6011114",
        "FFM_6011200",
        "FFM_6011300",
        "FFM_6011400",
        "FFM_6011511",
        "FFM_6011512",
        "FFM_6011513",
    ]
)


def fila(
    run: str,
    fondo: str,
    symbol: str,
    valorizacion_miles: int,
    peso: str,
    *,
    tipo: str = "ACC",
    cantidad: str = "1000",
) -> str:
    """Arma una fila de 25 columnas como las del archivo NACI de la CMF."""
    celdas = [
        run,
        fondo,
        symbol,
        "91144000",
        "7",
        "CL",
        tipo,
        "",
        "1",
        "AA",
        "0000",
        cantidad,
        "$$",
        "",
        "",
        "",
        "1",
        "0",
        "RC",
        str(valorizacion_miles),
        "$$",
        "CL",
        "0",
        "0",
        peso,
    ]
    assert len(celdas) == 25
    return ";".join(celdas)


def cartera(*filas: str) -> str:
    return "\n".join([CABECERA, *filas, ""])


# Cartera de septiembre 2026. Los dos ultimos fondos son senuelos: uno
# extranjero y otro de deuda, con carteras mas grandes que el top 5.
CSV = cartera(
    fila("1000", "FM BCH SEL ACCIONES", "ANDINA-B", 1_000_000, "60"),
    fila("1000", "FM BCH SEL ACCIONES", "BCI", 500_000, "40"),
    fila("2000", "CHILE ACCION", "FALA", 900_000, "20"),
    fila("3000", "SELECTAS CHILE", "CMPC", 800_000, "30"),
    fila("4000", "FM BCH DIV ACC CH", "CCU", 700_000, "25"),
    fila("5000", "SELECCION ACCION", "SQM-B", 600_000, "15"),
    fila("6000", "RENTA VARIABLE NAC", "COPEC", 500_000, "10"),
    fila("7000", "ACCIONES EEUU", "AAPL", 9_999_999, "99"),
    fila("8000", "FONDO DEUDA", "BTP-2030", 8_888_888, "50", tipo="BTP"),
)

# Agosto 2026: cambia ANDINA-B, aparece NEW y desaparece BCI.
CSV_ANTERIOR = cartera(
    fila("1000", "FM BCH SEL ACCIONES", "ANDINA-B", 950_000, "55"),
    fila("1000", "FM BCH SEL ACCIONES", "NEW", 100_000, "5"),
    fila("2000", "CHILE ACCION", "FALA", 850_000, "25"),
    fila("3000", "SELECTAS CHILE", "CMPC", 780_000, "30"),
    fila("4000", "FM BCH DIV ACC CH", "CCU", 650_000, "25"),
    fila("5000", "SELECCION ACCION", "SQM-B", 580_000, "15"),
    fila("6000", "RENTA VARIABLE NAC", "COPEC", 480_000, "10"),
)


# --------------------------------------------------------------------------
# Utilidades puras
# --------------------------------------------------------------------------


def test_periodos_y_fecha_de_cierre() -> None:
    assert periodo_partes("2026-09") == ("09", "2026")
    for malo in ("2026-13", "2026-9", "2026", "09-2026", ""):
        with pytest.raises(ValueError):
            periodo_partes(malo)
    assert periodo_por_defecto(date(2026, 10, 20)) == "2026-09"
    assert periodo_por_defecto(date(2026, 1, 5)) == "2025-12"
    assert periodo_anterior("2026-01") == "2025-12"
    assert fecha_cierre("2026-09") == date(2026, 9, 30)
    assert fecha_cierre("2026-02") == date(2026, 2, 28)


def test_criterio_de_acciones_nacionales() -> None:
    for nombre in (
        "FM BCH SEL ACCIONES",
        "CHILE ACCION",
        "SELECTAS CHILE",
        "FM BCH DIV ACC CH",
        "SELECCION ACCION",
        "RENTA VARIABLE NAC",
        "BICE ACCIONES CHILE ACTIVO",
        "BCI ACCIONES CHILENAS",
        "LARRAINVIAL ACCIONES NACIONALES",
        "TOESCA CHILE EQUITIES",
    ):
        assert es_acciones_nacionales(nombre), nombre
    for nombre in (
        "ACCIONES EEUU",
        "ACCIONES MUNDO",
        "BTG PACTUAL ACCIONES USA",
        "FONDO DEUDA",
        "FM MIXTO",
        "FONDO ESTRUCTURADO",
        "",
    ):
        assert not es_acciones_nacionales(nombre), nombre


# --------------------------------------------------------------------------
# Parser y ranking
# --------------------------------------------------------------------------


def test_parse_cartera_lee_las_columnas_de_la_circular_1333() -> None:
    filas = parse_cartera(CSV, "2026-09")
    assert len(filas) == 9
    primera = filas[0]
    assert primera.run == "1000"
    assert primera.fondo == "FM BCH SEL ACCIONES"
    assert primera.symbol == "ANDINA-B"
    assert primera.tipo == "ACC"
    assert primera.es_accion
    assert primera.valorizacion_miles == 1_000_000
    assert primera.weight == pytest.approx(60.0)
    # La fila de deuda se conserva en el total del fondo, pero no es accion.
    assert filas[-1].tipo == "BTP"
    assert not filas[-1].es_accion


def test_parse_cartera_tolera_archivo_vacio_o_truncado() -> None:
    assert parse_cartera("", "2026-09") == []
    assert parse_cartera(CABECERA, "2026-09") == []
    assert parse_cartera("1000;FONDO;ACC\n", "2026-09") == []


def test_top_5_por_cartera_nacional_y_sin_extranjeros() -> None:
    fondos = seleccionar_fondos(parse_cartera(CSV, "2026-09"), limite=5)
    assert [fondo.run for fondo in fondos] == ["1000", "2000", "3000", "4000", "5000"]
    assert [fondo.cartera_nacional_clp for fondo in fondos] == [
        1_500_000_000,
        900_000_000,
        800_000_000,
        700_000_000,
        600_000_000,
    ]
    assert all(fondo.nombre != "ACCIONES EEUU" for fondo in fondos)
    assert all(fondo.nombre != "FONDO DEUDA" for fondo in fondos)


def test_limite_cero_no_devuelve_fondos() -> None:
    assert seleccionar_fondos(parse_cartera(CSV, "2026-09"), limite=0) == []


def test_previous_weight_marca_posiciones_nuevas() -> None:
    actuales = parse_cartera(CSV, "2026-09")
    anteriores = parse_cartera(CSV_ANTERIOR, "2026-08")
    previos = aplicar_previous(actuales, anteriores)
    assert previos[("1000", "ANDINA-B")] == pytest.approx(55.0)
    assert previos[("1000", "BCI")] == 0.0  # no estaba en agosto
    assert previos[("2000", "FALA")] == pytest.approx(25.0)


def test_cartera_agregada_pondera_por_tamano_de_cada_fondo() -> None:
    fondos = seleccionar_fondos(parse_cartera(CSV, "2026-09"), limite=5)
    agregados = {fila["symbol"]: fila for fila in ponderar_holdings(fondos)}
    # 1.500.000 de 4.500.000 = 1/3; ANDINA-B pesa 60% en ese fondo.
    assert agregados["ANDINA-B"]["weight"] == pytest.approx(20.0)
    assert agregados["BCI"]["weight"] == pytest.approx(13.33)
    assert agregados["CMPC"]["weight"] == pytest.approx(5.33)
    assert agregados["SQM-B"]["weight"] == pytest.approx(2.0)
    assert "AAPL" not in agregados
    assert "BTP-2030" not in agregados
    assert all(0 <= fila["weight"] <= 100 for fila in agregados.values())


def test_cartera_agregada_calcula_previous_weight() -> None:
    actuales = parse_cartera(CSV, "2026-09")
    previos = aplicar_previous(actuales, parse_cartera(CSV_ANTERIOR, "2026-08"))
    fondos = seleccionar_fondos(actuales, limite=5)
    agregados = {fila["symbol"]: fila for fila in ponderar_holdings(fondos, previous=previos)}
    assert agregados["ANDINA-B"]["previous_weight"] == pytest.approx(18.33)
    assert agregados["BCI"]["previous_weight"] == 0.0
    assert agregados["FALA"]["previous_weight"] == pytest.approx(5.0)


def test_ponderar_sin_fondos_no_inventa_filas() -> None:
    assert ponderar_holdings([]) == []


# --------------------------------------------------------------------------
# Adaptador (sin red)
# --------------------------------------------------------------------------


class FakeClient:
    def __init__(self, texto: str = CSV) -> None:
        self.texto = texto
        self.calls: list[tuple] = []

    def post(self, url: str, data=None, **kwargs) -> str:
        self.calls.append(("POST", url, data, kwargs))
        return self.texto


class FakeResponse:
    def __init__(self, data) -> None:
        self.data = data


class FakeTable:
    def __init__(self, nombre: str) -> None:
        self.nombre = nombre
        self.upserts: list[dict] = []
        self.filtros: list[tuple] = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, columna, valor):
        self.filtros.append((columna, valor))
        return self

    def single(self):
        return self

    def upsert(self, payload, *, on_conflict=None, ignore_duplicates=False):
        self.upserts.append(
            {
                "payload": payload,
                "on_conflict": on_conflict,
                "ignore_duplicates": ignore_duplicates,
            }
        )
        return self

    def execute(self):
        if self.nombre == "portfolios":
            return FakeResponse({"id": "portfolio-1"})
        return FakeResponse([])


class FakeDb:
    def __init__(self) -> None:
        self.tables: dict[str, FakeTable] = {}

    def table(self, nombre: str) -> FakeTable:
        return self.tables.setdefault(nombre, FakeTable(nombre))


def test_dry_run_no_toca_la_base_y_resume() -> None:
    adapter = CmfFondosAdapter(
        periodo="2026-09", texto=CSV, comparar=False, dry_run=True
    )
    resumen = adapter.run(None)
    assert resumen["status"] == "ok"
    assert resumen["dry_run"] is True
    assert resumen["fondos"] == 5
    assert resumen["holdings"] == 6  # 2 + 1 + 1 + 1 + 1 acciones
    assert resumen["top"][0]["run"] == "1000"


def test_dry_run_descarga_el_mes_anterior_para_comparar() -> None:
    cliente = FakeClient()
    adapter = CmfFondosAdapter(periodo="2026-09", dry_run=True, client=cliente)
    resumen = adapter.run(None)
    assert resumen["comparado"] is True
    assert [llamada[2] for llamada in cliente.calls] == [
        {"mm": "09", "aa": "2026", "cartera": "NACI"},
        {"mm": "08", "aa": "2026", "cartera": "NACI"},
    ]


def test_upsert_escribe_ranking_holdings_y_cartera_agregada() -> None:
    db = FakeDb()
    adapter = CmfFondosAdapter(
        periodo="2026-09",
        texto=CSV,
        texto_anterior=CSV_ANTERIOR,
        dry_run=False,
    )
    resumen = adapter.run(db)
    assert resumen["status"] == "ok"
    assert resumen["comparado"] is True

    fondos = db.tables["cl_mutual_funds"]
    assert len(fondos.upserts) == 1
    assert fondos.upserts[0]["on_conflict"] == CONFLICT_FUNDS
    payload_fondos = fondos.upserts[0]["payload"]
    assert len(payload_fondos) == 5
    assert payload_fondos[0]["run"] == "1000"
    assert payload_fondos[0]["cartera_nacional_clp"] == 1_500_000_000
    assert payload_fondos[0]["periodo"] == "2026-09"

    holdings = db.tables["cl_mutual_fund_holdings"]
    assert holdings.upserts[0]["on_conflict"] == CONFLICT_HOLDINGS
    payload_holdings = holdings.upserts[0]["payload"]
    andina = next(f for f in payload_holdings if f["symbol"] == "ANDINA-B")
    assert andina["fund_run"] == "1000"
    assert andina["weight"] == pytest.approx(60.0)
    assert andina["previous_weight"] == pytest.approx(55.0)
    assert andina["valorizacion_miles"] == 1_000_000

    agregados = db.tables["holdings"]
    assert agregados.upserts[0]["on_conflict"] == CONFLICT_PORTFOLIO_HOLDINGS
    payload_agregado = agregados.upserts[0]["payload"]
    assert payload_agregado[0]["as_of"] == "2026-09-30"
    assert payload_agregado[0]["portfolio_id"] == "portfolio-1"
    assert payload_agregado[0]["currency"] == "CLP"
    assert {fila["symbol"] for fila in payload_agregado} == {
        "ANDINA-B",
        "BCI",
        "FALA",
        "CMPC",
        "CCU",
        "SQM-B",
    }


def test_sin_comparacion_deja_previous_weight_null() -> None:
    db = FakeDb()
    adapter = CmfFondosAdapter(
        periodo="2026-09", texto=CSV, comparar=False, dry_run=False
    )
    adapter.run(db)
    payload = db.tables["cl_mutual_fund_holdings"].upserts[0]["payload"]
    assert all(fila["previous_weight"] is None for fila in payload)
    agregados = db.tables["holdings"].upserts[0]["payload"]
    assert all(fila["previous_weight"] is None for fila in agregados)


def test_falta_el_portafolio_falla_con_mensaje_util() -> None:
    class DbSinPortafolio(FakeDb):
        def table(self, nombre: str) -> FakeTable:
            tabla = super().table(nombre)
            if nombre == "portfolios":
                tabla.execute = lambda: FakeResponse(None)  # type: ignore[method-assign]
            return tabla

    adapter = CmfFondosAdapter(
        periodo="2026-09", texto=CSV, comparar=False, dry_run=False
    )
    with pytest.raises(RuntimeError, match="034_fondos_mutuos"):
        adapter.run(DbSinPortafolio())


def test_el_waf_se_propaga_desde_el_adaptador() -> None:
    class ClienteBloqueado(FakeClient):
        def post(self, url: str, data=None, **kwargs) -> str:
            raise CmfBlocked(url, 403, "Web Page Blocked")

    adapter = CmfFondosAdapter(periodo="2026-09", dry_run=True, client=ClienteBloqueado())
    with pytest.raises(CmfBlocked):
        adapter.run(None)


# --------------------------------------------------------------------------
# Etapa y migracion
# --------------------------------------------------------------------------


def test_la_etapa_se_descubre_y_es_opcional() -> None:
    etapas = {meta[0]: (meta, runner) for meta, runner in discover_stages()}
    assert "cmf_fondos" in etapas
    meta, runner = etapas["cmf_fondos"]
    assert meta[1]
    assert meta[2] is False
    assert callable(runner)


def test_la_etapa_devuelve_blocked_sin_tumbar(monkeypatch) -> None:
    etapas = {meta[0]: (meta, runner) for meta, runner in discover_stages()}

    def bloqueado(self, periodo):
        raise CmfBlocked("https://www.cmfchile.cl", 403, "Web Page Blocked")

    monkeypatch.setattr(CmfFondosAdapter, "descargar", bloqueado)
    resultado = etapas["cmf_fondos"][1](None, True)
    assert resultado[0]["status"] == "blocked"
    assert resultado[0]["dry_run"] is True


def test_migracion_034_es_idempotente_por_texto() -> None:
    assert MIGRACION.is_file(), f"falta {MIGRACION}"
    sql = MIGRACION.read_text(encoding="utf-8")
    sentencias = "\n".join(
        linea for linea in sql.splitlines() if not linea.lstrip().startswith("--")
    ).lower()
    assert "create table if not exists public.cl_mutual_funds" in sentencias
    assert "create table if not exists public.cl_mutual_fund_holdings" in sentencias
    assert "create index if not exists" in sentencias
    assert "drop policy if exists" in sentencias
    assert "drop view if exists public.cl_mutual_funds_ranking" in sentencias
    assert "unique (run, periodo)" in sentencias
    assert "unique (fund_run, periodo, symbol)" in sentencias
    assert "on conflict (slug) do update" in sentencias
    assert "'fondos-mutuos-acciones-cl'" in sentencias
    assert "'broker_cl'" in sentencias
    assert "drop table" not in sentencias
    assert "truncate" not in sentencias
    assert "delete from" not in sentencias
