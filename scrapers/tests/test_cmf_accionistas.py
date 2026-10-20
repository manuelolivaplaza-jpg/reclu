"""Mayores accionistas CMF (F33): parser, adaptador y etapa. Sin red.

Correr:
  python -m pytest scrapers/tests/test_cmf_accionistas.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from cmf_accionistas import (  # noqa: E402
    CONFLICT_COLUMNS,
    CmfAccionistasAdapter,
    _periodo_partes,
    dedupe_accionistas,
    entidad_params,
    es_persona_natural,
    load_emisores,
    parse_accionistas,
    periodo_de,
    rut_key,
    source_url,
)
from cmf_client import CmfBlocked  # noqa: E402
from stages import discover_stages  # noqa: E402

MIGRACION = RAIZ.parent / "supabase" / "migrations" / "033_mayores_accionistas.sql"
MIGRACION_ANONIMIZAR = (
    RAIZ.parent / "supabase" / "migrations" / "045_accionistas_anonimizar.sql"
)

# Recorte representativo de la pestania 5 real (RUT 96766110, periodo 09/2026).
HTML = """
<html><body>
<h2> 12 Mayores Accionistas</h2>
<dl id="datos_ent">
  <dt>Raz&oacute;n Social: </dt><dd>ENERGIA DE CASABLANCA S.A.</dd>
  <dt>RUT:</dt><dd>96766110-4</dd>
</dl>
<table>
  <tr><td><strong>Per&iacute;odo:</strong> 09 / 2026  (Ultimo Per&iacute;odo Informado)</td></tr>
  <tbody>
  <table>
    <tr>
      <th>Nombre</th><th>Acciones suscritas</th>
      <th>Acciones pagadas</th><th>% de propiedad</th>
    </tr>
    <tr>
      <td>CHILQUINTA ENERGIA S.A.</td>
      <td>                       2.022.712</td>
      <td>                       2.022.712</td>
      <td>69,75%</td>
    </tr>
    <tr>
      <td>INVERSIONES MAGNUM LIMITADA</td>
      <td>                          96.524</td>
      <td>                          96.524</td>
      <td>3,33%</td>
    </tr>
    <tr>
      <td>LIRA VERONICA CISTERNAS</td>
      <td>                          49.489</td>
      <td>                          49.489</td>
      <td>1,71%</td>
    </tr>
    <tr>
      <td>ILUSTRE MUNICIPALIDAD DE CASABLANCA</td>
      <td>                          24.509</td>
      <td>                          24.509</td>
      <td>0</td>
    </tr>
  </tbody>
  </table>
  <!-- end inc/propiedad.php -->
</body></html>
"""


# --------------------------------------------------------------------------
# Parser y utilidades puras
# --------------------------------------------------------------------------


def test_periodo_y_datos_del_emisor() -> None:
    assert periodo_de(HTML) == "2026-09"
    filas = parse_accionistas(HTML)
    assert len(filas) == 4
    primera = filas[0]
    assert primera["rut_emisor"] == "96766110"
    assert primera["razon_social"] == "ENERGIA DE CASABLANCA S.A."
    assert primera["periodo"] == "2026-09"
    assert primera["ranking"] == 1
    assert primera["accionista"] == "CHILQUINTA ENERGIA S.A."
    assert primera["porcentaje_propiedad"] == pytest.approx(69.75)
    assert primera["acciones_suscritas"] == 2022712
    assert primera["acciones_pagadas"] == 2022712


def test_conserva_el_cero_y_anonimiza_la_persona_natural() -> None:
    filas = parse_accionistas(HTML)
    municipalidad = filas[3]
    assert municipalidad["porcentaje_propiedad"] == 0.0
    # F33-B: persona natural sin nombre ni RUT, con ranking para la clave unica.
    natural = filas[2]
    assert natural["accionista"] == "Persona natural (#3)"
    assert natural["es_persona_natural"] is True
    assert natural["porcentaje_propiedad"] == pytest.approx(1.71)
    assert natural["acciones_suscritas"] == 49489
    assert "LIRA" not in str(natural)


def test_es_persona_natural_por_rut_y_por_nombre() -> None:
    # Con RUT manda el umbral (< 50.000.000 natural).
    assert es_persona_natural("PEREZ JUAN", "12.345.678-5") is True
    assert es_persona_natural("INVERSIONES X", "96.555.444-3") is False
    # Sin RUT mandan los marcadores societarios.
    assert es_persona_natural("CHILQUINTA ENERGIA S.A.") is False
    assert es_persona_natural("INVERSIONES MAGNUM LIMITADA") is False
    assert es_persona_natural("FONDO DE INVERSION XYZ") is False
    assert es_persona_natural("SOTO MARIA") is True
    # Ante la duda se oculta (falla cerrado).
    assert es_persona_natural("") is True
    assert es_persona_natural("ILUSTRE MUNICIPALIDAD DE CASABLANCA") is True


def test_persona_natural_con_rut_no_guarda_ni_muestra_el_rut() -> None:
    html = HTML.replace(
        "<td>LIRA VERONICA CISTERNAS</td>",
        "<td>LIRA VERONICA CISTERNAS 12.345.678-5</td>",
    )
    filas = parse_accionistas(html)
    natural = filas[2]
    assert natural["accionista"] == "Persona natural (#3)"
    assert natural["es_persona_natural"] is True
    volcado = str(natural)
    for prohibido in ("LIRA", "12.345.678", "12345678", "CISTERNAS"):
        assert prohibido not in volcado
    # El resto de la fila se conserva.
    assert natural["porcentaje_propiedad"] == pytest.approx(1.71)
    assert natural["acciones_suscritas"] == 49489


def test_persona_juridica_con_rut_mantiene_el_nombre_y_oculta_el_rut() -> None:
    html = HTML.replace(
        "<td>CHILQUINTA ENERGIA S.A.</td>",
        "<td>CHILQUINTA ENERGIA S.A. 96.555.444-3</td>",
    )
    filas = parse_accionistas(html)
    juridica = filas[0]
    assert juridica["accionista"] == "CHILQUINTA ENERGIA S.A."
    assert juridica["es_persona_natural"] is False
    assert "96.555.444" not in str(juridica)
    assert "96555444" not in str(juridica)



def test_rut_del_parametro_manda_sobre_el_de_la_pagina_y_nemo() -> None:
    filas = parse_accionistas(HTML, rut_emisor="96.766.110-4", nemo="test")
    assert filas[0]["rut_emisor"] == "96766110"
    assert filas[0]["nemo"] == "TEST"


def test_sin_periodo_o_sin_tabla_no_inventa_datos() -> None:
    assert parse_accionistas("<html><body>Sin datos</body></html>") == []
    sin_seccion = HTML.replace("12 Mayores Accionistas", "Otra cosa")
    assert parse_accionistas(sin_seccion) == []
    sin_periodo = HTML.replace("09 / 2026", "")
    assert parse_accionistas(sin_periodo) == []


def test_dedupe_por_emisor_periodo_y_accionista() -> None:
    filas = parse_accionistas(HTML)
    duplicada = dict(filas[0])
    duplicada["accionista"] = filas[0]["accionista"].lower()
    salida = dedupe_accionistas([*filas, duplicada])
    assert len(salida) == len(filas)


def test_rut_key_y_url_de_la_ficha() -> None:
    assert rut_key("96.766.110-4") == "96766110"
    assert rut_key("96766110") == "96766110"
    params = entidad_params("96.766.110-4")
    assert params["pestania"] == "5"
    assert params["rut"] == "96766110"
    assert params["tipoentidad"] == "RVEMI"
    assert "pestania=5" in source_url("96766110")


def test_periodo_partes_valida_trimestres() -> None:
    assert _periodo_partes("2026-09") == ("09", "2026")
    for malo in ("2026-10", "2026-9", "2026", "2026-00"):
        with pytest.raises(ValueError):
            _periodo_partes(malo)


def test_load_emisores_filtra_los_que_no_cotizan() -> None:
    emisores = load_emisores(
        {"97004000": "chile", "82878900": None, "90222000": "CMPC"}
    )
    assert emisores == [("90222000", "CMPC"), ("97004000", "CHILE")]


# --------------------------------------------------------------------------
# Adaptador (cliente falso, sin red)
# --------------------------------------------------------------------------


class FakeClient:
    def __init__(self, html: str = HTML) -> None:
        self.html = html
        self.calls: list[tuple] = []

    def get(self, url: str, params=None, **_kwargs) -> str:
        self.calls.append(("GET", url, params))
        return self.html

    def post(self, url: str, data=None, *, params=None, **_kwargs) -> str:
        self.calls.append(("POST", url, data, params))
        return self.html


class FakeTable:
    def __init__(self) -> None:
        self.upserts: list[dict] = []

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
        return self


class FakeDb:
    def __init__(self) -> None:
        self.tables: dict[str, FakeTable] = {}

    def table(self, name: str) -> FakeTable:
        return self.tables.setdefault(name, FakeTable())


def test_dry_run_no_toca_la_base_y_resume() -> None:
    cliente = FakeClient()
    adapter = CmfAccionistasAdapter(
        emisores=[("96766110", "TEST")], dry_run=True, client=cliente
    )
    resumen = adapter.run(None)
    assert resumen["status"] == "ok"
    assert resumen["ok"] == 1
    assert resumen["accionistas"] == 4
    assert resumen["dry_run"] is True
    assert "GET" in cliente.calls[0][0]


def test_periodo_historico_usa_post() -> None:
    cliente = FakeClient()
    adapter = CmfAccionistasAdapter(
        periodo="2026-06",
        emisores=[("96766110", "TEST")],
        dry_run=True,
        client=cliente,
    )
    adapter.run(None)
    metodo, _url, data, params = cliente.calls[0]
    assert metodo == "POST"
    assert data == {"mm": "06", "aa": "2026"}
    assert params["pestania"] == "5"


def test_prueba_el_tipo_de_entidad_de_los_bancos() -> None:
    class ClientePorTipo(FakeClient):
        def get(self, url: str, params=None, **_kwargs) -> str:
            self.calls.append(("GET", url, params))
            if params and params["tipoentidad"] == "BANCO":
                return HTML
            return "<html><body>Sin informacion.</body></html>"

    cliente = ClientePorTipo()
    adapter = CmfAccionistasAdapter(
        emisores=[("97004000", "CHILE")], dry_run=True, client=cliente
    )
    resumen = adapter.run(None)
    assert resumen["ok"] == 1
    tipos = [llamada[2]["tipoentidad"] for llamada in cliente.calls]
    assert tipos == ["RVEMI", "BANCO"]
    assert "tipoentidad=BANCO" in adapter.url("97004000")


def test_upsert_usa_la_clave_y_la_url_de_la_ficha() -> None:
    db = FakeDb()
    adapter = CmfAccionistasAdapter(
        emisores=[("96766110", "TEST")], dry_run=False, client=FakeClient()
    )
    resumen = adapter.run(db)
    assert resumen["status"] == "ok"
    tabla = db.tables["cl_top_shareholders"]
    assert len(tabla.upserts) == 1
    upsert = tabla.upserts[0]
    assert upsert["on_conflict"] == CONFLICT_COLUMNS
    assert upsert["ignore_duplicates"] is True
    fila = upsert["payload"][0]
    assert fila["rut_emisor"] == "96766110"
    assert fila["nemo"] == "TEST"
    assert fila["periodo"] == "2026-09"
    assert fila["ranking"] == 1
    assert fila["porcentaje_propiedad"] == pytest.approx(69.75)
    assert fila["es_persona_natural"] is False
    assert upsert["payload"][2]["es_persona_natural"] is True
    assert "pestania=5" in fila["source_url"]


def test_un_error_de_una_emisora_no_corta_las_demas() -> None:
    class ClienteConFallo(FakeClient):
        def get(self, url: str, params=None, **_kwargs) -> str:
            if params and params["rut"] == "1":
                raise RuntimeError("timeout")
            return super().get(url, params=params, **_kwargs)

    adapter = CmfAccionistasAdapter(
        emisores=[("1", "MALO"), ("96766110", "BIEN")],
        dry_run=True,
        client=ClienteConFallo(),
    )
    resumen = adapter.run(None)
    assert resumen["status"] == "partial"
    assert resumen["ok"] == 1
    assert resumen["errores"][0]["rut"] == "1"


def test_el_waf_no_se_traga_como_error_puntual() -> None:
    class ClienteBloqueado(FakeClient):
        def get(self, url: str, params=None, **_kwargs) -> str:
            raise CmfBlocked(url, 403, "Web Page Blocked")

    adapter = CmfAccionistasAdapter(
        emisores=[("96766110", "TEST")], dry_run=True, client=ClienteBloqueado()
    )
    with pytest.raises(CmfBlocked):
        adapter.run(None)


# --------------------------------------------------------------------------
# Etapa y migracion
# --------------------------------------------------------------------------


def test_la_etapa_se_descubre_y_es_opcional() -> None:
    etapas = {meta[0]: (meta, runner) for meta, runner in discover_stages()}
    assert "cmf_accionistas" in etapas
    meta, runner = etapas["cmf_accionistas"]
    assert meta[1]
    assert meta[2] is False
    assert callable(runner)


def test_la_etapa_devuelve_blocked_sin_tumbar(monkeypatch) -> None:
    etapas = {meta[0]: (meta, runner) for meta, runner in discover_stages()}

    def bloqueado(self, rut):
        raise CmfBlocked("https://www.cmfchile.cl", 403, "Web Page Blocked")

    monkeypatch.setattr(CmfAccionistasAdapter, "fetch_raw", bloqueado)
    resultado = etapas["cmf_accionistas"][1](None, True)
    assert resultado[0]["status"] == "blocked"
    assert resultado[0]["dry_run"] is True


def test_migracion_033_es_idempotente_por_texto() -> None:
    assert MIGRACION.is_file(), f"falta {MIGRACION}"
    sql = MIGRACION.read_text(encoding="utf-8")
    sentencias = "\n".join(
        linea for linea in sql.splitlines() if not linea.lstrip().startswith("--")
    ).lower()
    assert "create table if not exists public.cl_top_shareholders" in sentencias
    assert "create index if not exists" in sentencias
    assert "drop policy if exists" in sentencias
    assert "unique (rut_emisor, periodo, accionista)" in sentencias
    assert "periodo ~ '^[0-9]{4}-(03|06|09|12)$'" in sentencias
    assert "drop table" not in sentencias
    assert "truncate" not in sentencias
    assert "delete from" not in sentencias


def test_migracion_045_anonimiza_de_forma_idempotente() -> None:
    assert MIGRACION_ANONIMIZAR.is_file(), f"falta {MIGRACION_ANONIMIZAR}"
    sql = MIGRACION_ANONIMIZAR.read_text(encoding="utf-8")
    sentencias = "\n".join(
        linea for linea in sql.splitlines() if not linea.lstrip().startswith("--")
    ).lower()
    assert "add column if not exists es_persona_natural boolean not null default false" in sentencias
    assert "persona natural (#" in sentencias
    assert "coalesce(ranking::text" in sentencias
    assert "accionista !~*" in sentencias
    assert "rollback" in sql.lower()
    # No borra datos ni toca otras tablas.
    assert "delete from" not in sentencias
    assert "truncate" not in sentencias
    assert "drop table" not in sentencias
    assert "drop column" not in sentencias
