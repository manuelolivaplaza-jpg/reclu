"""XT2: humo de etapas de scrapers/stages/ en dry-run. Sin red ni Supabase.

Cada modulo de scrapers/stages/*.py debe exoner lo que discover_stages()
espera: STAGE = (id, desc, critical) con id == nombre del archivo, orden
alfabetico, y run(db, dry_run) callable. Ningun stage puede escribir (ni
leer) Supabase en dry-run: la base es un mock que hace fallar el test.

Correr desde scrapers/:
  uv run --with pytest --with-requirements requirements.txt pytest tests/ -q
"""

from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from stages import discover_stages  # noqa: E402

STAGES_DIR = Path(__file__).resolve().parent.parent / "stages"
MODULOS = sorted(
    path
    for path in STAGES_DIR.glob("*.py")
    if path.name != "__init__.py" and not path.name.startswith("_")
)


class _RespuestaWaf:
    """Respuesta tipo 'Web Page Blocked' (403), el camino documentado de la CMF."""

    status_code = 403
    content = b"Web Page Blocked"
    text = "Web Page Blocked"


@pytest.fixture(autouse=True)
def _sin_red_ni_sleeps(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bloquea httpx, curl_cffi y time.sleep para todo el modulo de tests."""

    def _boom(*_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("XT2: se intento usar la red durante el smoke")

    monkeypatch.setattr(httpx.Client, "send", _boom)
    try:
        from curl_cffi import requests as curl_requests

        # La CMF no debe salir a la red: el WAF "responde" bloqueo, que es
        # exactamente lo que ven los scrapers desde datacenter (docs/sources.md).
        def _waf(*_args: Any, **_kwargs: Any) -> _RespuestaWaf:
            return _RespuestaWaf()

        monkeypatch.setattr(curl_requests.Session, "request", _waf)
    except ImportError:  # sin curl_cffi, los adapters CMF revientan igual sin red
        pass
    monkeypatch.setattr(time, "sleep", lambda *_args, **_kwargs: None)


def _cargar(path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(f"xt2_{path.stem}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- 1. Contrato: cada modulo expone lo que discover_stages espera --------


@pytest.mark.parametrize("path", MODULOS, ids=lambda p: p.stem)
def test_contrato_del_modulo(path: Path) -> None:
    """STAGE = (id, desc, critical) con id == nombre de archivo, y run callable."""
    module = _cargar(path)

    stage = getattr(module, "STAGE", None)
    assert isinstance(stage, tuple), f"{path.name} no define STAGE como tupla"
    assert len(stage) == 3, f"{path.name}: STAGE debe ser (id, desc, critical)"
    stage_id, desc, critical = stage
    assert isinstance(stage_id, str) and stage_id, f"{path.name}: STAGE[0] vacio"
    assert stage_id == path.stem, (
        f"{path.name}: STAGE[0] es {stage_id!r}, debia ser el nombre del archivo"
    )
    assert isinstance(desc, str) and desc, f"{path.name}: STAGE[1] sin descripcion"
    assert isinstance(critical, bool), f"{path.name}: STAGE[2] debe ser bool"

    runner = getattr(module, "run", None)
    assert callable(runner), f"{path.name} debe definir run(db, dry_run)"


def test_discover_stages_ve_todos_en_orden_alfabetico() -> None:
    """discover_stages() encuentra los 10 modulos, sin duplicados y en orden."""
    discovered = discover_stages()

    ids = [meta[0] for meta, _runner in discovered]
    assert ids == [path.stem for path in MODULOS]
    assert len(ids) == len(set(ids)), "ids de etapas duplicados"
    assert len(discovered) == len(MODULOS)
    for _meta, runner in discovered:
        assert callable(runner)


# --- 2. Dry-run no toca Supabase ------------------------------------------


class _DbVeneno:
    """Cualquier acceso a la base (select incluido) hace fallar el test."""

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"dry-run toco Supabase: db.{name}()")


@pytest.mark.parametrize("path", MODULOS, ids=lambda p: p.stem)
def test_dry_run_no_toca_supabase(path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """run(db, dry_run=True) con red bloqueada jamas accede a la base.

    Igual que `run_all.py --dry-run`: la etapa recibe un cliente trampa. Los
    fallos de red (httpx bloqueado / WAF de la CMF) son esperados y no fallan
    el test; si el stage intenta leer o escribir Supabase, si.
    """
    import base

    def _get_db_veneno() -> Any:
        raise AssertionError("dry-run no debe abrir su propio cliente Supabase")

    monkeypatch.setattr(base, "get_db", _get_db_veneno)

    module = _cargar(path)
    db = _DbVeneno()
    try:
        module.run(db, True)
    except AssertionError:
        # Toco la base (o quizo abrir un cliente): ese es el bug del test.
        raise
    except SystemExit as exc:
        pytest.fail(f"{path.stem}: dry-run intento salir/crear cliente: {exc}")
    except Exception:  # noqa: BLE001 — red bloqueada: fallo de red es esperado
        pass
