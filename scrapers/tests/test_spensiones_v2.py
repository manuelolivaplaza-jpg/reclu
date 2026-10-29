"""D71: el cuadro 14 por el enlace v2 del portal (sin red ni DB)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import spensiones as sp  # noqa: E402

V2 = "/apps/carteras/genera_desagregada_xsl_v2.0.php?param="


def _fila(nombre: str, token: str) -> str:
    return (
        f"<li><table width='50%'><tr><td width='20%'>&nbsp;</td><td width='50%'>{nombre}</td>"
        f"<td width='15%'><A title='Html' HREF='{V2}{token}'><span></span></a></td>"
        f"<td width='15%'><A title='Excel' HREF='/apps/carteras/genera_desagregada_xsl2xls.php?param={token}'>"
        "</a></td></tr></table></li>"
    )


PORTAL = (
    "<li>13. Diversificaci&oacute;n ... Total de Fondos" + _fila("HABITAT", "T13") +
    "<li>14. Diversificaci&oacute;n de los Fondos de Pensiones en acciones nacionales por AFP"
    + _fila("CAPITAL", "C14") + _fila("HABITAT", "H14") + _fila("UNO", "U14") +
    "<li>15. Diversificaci&oacute;n ... bonos" + _fila("HABITAT", "H15")
)

CUADRO = (
    "<h3>CUADRO N 14</h3> Al 29-05-2026 " + "x" * 1200 +
    "<table><tr>" + "".join(f"<td>{v}</td>" for v in
    ["SQM-B", "SQM S.A.", "N", "E", "1", "1", "1", "1", "1", "120,50", "2,10", "0,90"]) +
    "</tr></table>"
)


def test_enlace_v2_toma_solo_la_seccion_14_y_la_afp_pedida():
    assert sp.enlace_v2_cuadro14(PORTAL, "27") == V2 + "H14"
    assert sp.enlace_v2_cuadro14(PORTAL, "42") == V2 + "C14"
    assert sp.enlace_v2_cuadro14(PORTAL, "51") == V2 + "U14"


def test_enlace_v2_none_si_falta_afp_o_seccion():
    assert sp.enlace_v2_cuadro14(PORTAL, "35") is None  # CUPRUM no esta
    assert sp.enlace_v2_cuadro14("<p>sin cuadros</p>", "27") is None
    assert sp.enlace_v2_cuadro14(PORTAL, "999") is None


def test_siete_afp_tienen_nombre_de_portal():
    from afp_carteras import AFPS

    assert {v["idu"] for v in AFPS.values()} == set(sp.NOMBRE_PORTAL_POR_IDU)


class _Resp:
    def __init__(self, body: bytes, status: int = 200):
        self.content = body
        self.status_code = status


class _Cliente:
    def __init__(self, rutas: dict[str, bytes]):
        self.rutas = rutas
        self.pedidas: list[str] = []

    def get(self, url, headers=None, timeout=None):
        self.pedidas.append(url)
        for clave, body in self.rutas.items():
            if clave in url:
                return _Resp(body)
        return _Resp(b"", 404)


VACIO = b"<hr>" + b" " * 359  # lo que responde el sitio cuando no hay datos (363 B)


def test_leer_cuerpo_usa_v2_cuando_el_antiguo_viene_vacio():
    c = _Cliente({
        "genera_desagregada_xsl.php": VACIO,
        "loadCarInv.php": PORTAL.encode("latin-1"),
        "param=H14": CUADRO.encode("latin-1"),
    })
    cuerpo = sp.leer_cuerpo(c, "202605", "27")
    assert sp.respuesta_publicada(cuerpo)
    fecha, filas = sp.parse_cuadro14(sp._decode(cuerpo))
    assert fecha == "29-05-2026" and filas[0]["nemo"] == "SQM-B"
    assert any("param=H14" in u for u in c.pedidas)


def test_leer_cuerpo_no_pide_el_portal_si_el_antiguo_funciona():
    c = _Cliente({"genera_desagregada_xsl.php": CUADRO.encode("latin-1")})
    assert sp.respuesta_publicada(sp.leer_cuerpo(c, "202604", "27"))
    assert len(c.pedidas) == 1


def test_mes_no_publicado_devuelve_cuerpo_no_publicado():
    c = _Cliente({
        "genera_desagregada_xsl.php": VACIO,
        "loadCarInv.php": PORTAL.encode("latin-1"),
        "param=H14": VACIO,
    })
    assert not sp.respuesta_publicada(sp.leer_cuerpo(c, "202609", "27"))
