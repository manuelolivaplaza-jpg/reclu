"""Autodescubrimiento de etapas. Sin red ni Supabase.

Correr: python -m pytest scrapers/tests/test_stages_discovery.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from stages import discover_stages, insert_before_radar  # noqa: E402


def _write(path: Path, source: str) -> None:
    path.write_text(source, encoding="utf-8")


def test_descubre_etapa_falsa_en_directorio_temporal(tmp_path: Path) -> None:
    _write(
        tmp_path / "b_tarde.py",
        'STAGE = ("b_tarde", "Tarde", False)\n'
        "def run(db, dry_run):\n"
        '    return [{"source": "b_tarde", "dry_run": dry_run, "db": db}]\n',
    )
    _write(
        tmp_path / "a_temprano.py",
        'STAGE = ("a_temprano", "Temprano", True)\n'
        "def run(db, dry_run):\n"
        '    return [{"source": "a_temprano"}]\n',
    )
    _write(
        tmp_path / "_oculto.py",
        'STAGE = ("oculto", "No debe cargarse", False)\n'
        "def run(db, dry_run):\n"
        "    return []\n",
    )
    _write(tmp_path / "README.md", "no es una etapa")

    found = discover_stages(tmp_path)

    assert [meta[0] for meta, _runner in found] == ["a_temprano", "b_tarde"]
    assert found[0][0] == ("a_temprano", "Temprano", True)
    assert found[1][1](None, True) == [
        {"source": "b_tarde", "dry_run": True, "db": None}
    ]


def test_inserta_antes_de_radar_ia() -> None:
    stages = [
        ("insiders_form4", "Form 4", False),
        ("radar_ia", "Radar", False),
    ]
    runners = {
        "insiders_form4": lambda db, dry_run: [],
        "radar_ia": lambda db, dry_run: [],
    }
    merged, merged_runners = insert_before_radar(
        stages,
        runners,
        [(("zeta", "Z", False), lambda db, dry_run: [{"ok": True}])],
    )
    assert [stage[0] for stage in merged] == ["insiders_form4", "zeta", "radar_ia"]
    assert merged_runners["zeta"](None, True) == [{"ok": True}]
    assert "radar_ia" in merged_runners


def test_sin_etapas_el_orden_no_cambia(tmp_path: Path) -> None:
    stages = [("house_disclosure", "Cámara", True), ("radar_ia", "Radar", False)]
    runners = {"house_disclosure": lambda db, dry_run: [], "radar_ia": lambda db, dry_run: []}
    merged, merged_runners = insert_before_radar(stages, runners, [])
    assert [stage[0] for stage in merged] == ["house_disclosure", "radar_ia"]
    assert set(merged_runners) == set(runners)
    assert discover_stages(tmp_path) == []


def test_corredoras_cl_aparece_antes_de_radar_ia() -> None:
    stages = [("house_disclosure", "Cámara", True), ("radar_ia", "Radar", False)]
    runners = {"house_disclosure": lambda db, dry_run: [], "radar_ia": lambda db, dry_run: []}
    discovered = discover_stages()
    assert any(meta[0] == "corredoras_cl" for meta, _runner in discovered)
    merged, _merged_runners = insert_before_radar(stages, runners, discovered)
    order = [stage[0] for stage in merged]
    assert order.index("corredoras_cl") < order.index("radar_ia")


def test_modulo_sin_stage_falla(tmp_path: Path) -> None:
    _write(tmp_path / "malo.py", "def run(db, dry_run):\n    return []\n")
    with pytest.raises(ValueError, match="malo.py"):
        discover_stages(tmp_path)


def test_id_duplicado_falla() -> None:
    stages = [("radar_ia", "Radar", False)]
    runners = {"radar_ia": lambda db, dry_run: []}
    with pytest.raises(ValueError, match="duplicada"):
        insert_before_radar(
            stages,
            runners,
            [(("radar_ia", "Otra", False), lambda db, dry_run: [])],
        )
