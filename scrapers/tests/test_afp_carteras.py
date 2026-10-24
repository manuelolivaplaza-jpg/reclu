from unittest.mock import patch

import pytest

import afp_carteras as ac
import spensiones as sp


def test_siete_afp_con_idu_unico():
    assert len(ac.AFPS) == 7
    assert len({v["idu"] for v in ac.AFPS.values()}) == 7
    assert ac.AFPS["habitat"]["idu"] == "27"


def test_slugs():
    assert ac.slug_for("modelo") == "afp-modelo-acciones-cl"
    assert ac.slug_for("habitat") == "afp-habitat-acciones-cl"
    with pytest.raises(ValueError):
        ac.slug_for("inexistente")


def test_url_usa_idu():
    assert "idu=29" in ac.url_for("provida", "202605")
    assert "fecpro=202605" in ac.url_for("provida", "202605")
    # Modelo sigue igual que antes
    assert sp.url_cuadro14("202605") == ac.url_for("modelo", "202605")


def test_buscar_cuadro14_pasa_idu():
    llamadas = []

    def falso(client, fecpro, idu="50"):
        llamadas.append((fecpro, idu))
        return b""

    with patch.object(sp, "leer_cuerpo", falso):
        assert sp.buscar_cuadro14(None, sp.date(2026, 6, 15), max_meses=2, idu="35") is None
    assert llamadas == [("202606", "35"), ("202605", "35")]


def test_adapter_slug_y_dry_run_sin_filas():
    a = ac.AfpCarterasAdapter("cuprum", dry_run=True)
    assert a.portfolio_slug == "afp-cuprum-acciones-cl"
    with patch.object(ac, "buscar_cuadro14", return_value=None):
        r = a.run()
    assert r["status"] == "empty"
