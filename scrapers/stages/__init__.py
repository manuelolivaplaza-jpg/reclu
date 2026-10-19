"""Autodescubrimiento de etapas para `scrapers/run_all.py`.

Cada `scrapers/stages/<nombre>.py` (salvo `__init__.py` y `_*.py`) define:

    STAGE = ("id", "descripción", False)  # (id, desc, critical)

    def run(db, dry_run) -> list[dict]:
        ...

`run_all` las inserta en orden alfabético, siempre antes de `radar_ia`.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Callable

StageMeta = tuple[str, str, bool]
StageRunner = Callable[..., list[dict[str, Any]]]
DiscoveredStage = tuple[StageMeta, StageRunner]

RADAR_STAGE_ID = "radar_ia"


def discover_stages(directory: Path | None = None) -> list[DiscoveredStage]:
    """Importa cada `scrapers/stages/*.py` en orden alfabético."""
    root = directory if directory is not None else Path(__file__).resolve().parent
    if not root.is_dir():
        return []

    found: list[DiscoveredStage] = []
    seen: set[str] = set()
    paths = sorted(
        (
            path
            for path in root.glob("*.py")
            if path.name != "__init__.py" and not path.name.startswith("_")
        ),
        key=lambda path: path.name,
    )
    for path in paths:
        module = _load_module(path)
        meta = _read_stage(path.name, module)
        if meta[0] in seen:
            raise ValueError(f"etapa duplicada: {meta[0]} ({path.name})")
        seen.add(meta[0])
        runner = getattr(module, "run", None)
        if not callable(runner):
            raise ValueError(f"{path.name} debe definir run(db, dry_run)")
        found.append((meta, runner))
    return found


def insert_before_radar(
    stages: list[StageMeta],
    runners: dict[str, StageRunner],
    discovered: list[DiscoveredStage],
    *,
    before: str = RADAR_STAGE_ID,
) -> tuple[list[StageMeta], dict[str, StageRunner]]:
    """Copia etapas y runners e inserta lo descubierto justo antes de `radar_ia`."""
    merged = list(stages)
    merged_runners = dict(runners)
    known = {stage[0] for stage in merged}
    index = next((i for i, stage in enumerate(merged) if stage[0] == before), len(merged))
    for offset, (meta, runner) in enumerate(discovered):
        stage_id = meta[0]
        if stage_id in known or stage_id in merged_runners:
            raise ValueError(f"etapa duplicada: {stage_id}")
        merged.insert(index + offset, meta)
        merged_runners[stage_id] = runner
        known.add(stage_id)
    return merged, merged_runners


def _load_module(path: Path) -> Any:
    module_name = f"reclu_stage_{path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ValueError(f"no se pudo importar {path.name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _read_stage(filename: str, module: Any) -> StageMeta:
    stage = getattr(module, "STAGE", None)
    if not isinstance(stage, tuple) or len(stage) != 3:
        raise ValueError(f"{filename} debe definir STAGE = (id, desc, critical)")
    stage_id, desc, critical = stage
    if not isinstance(stage_id, str) or not stage_id:
        raise ValueError(f"{filename}: STAGE[0] debe ser un id no vacío")
    if not isinstance(desc, str):
        raise ValueError(f"{filename}: STAGE[1] debe ser la descripción")
    if not isinstance(critical, bool):
        raise ValueError(f"{filename}: STAGE[2] debe ser bool")
    return (stage_id, desc, critical)
