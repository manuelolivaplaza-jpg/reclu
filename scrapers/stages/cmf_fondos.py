"""Etapa cmf_fondos. Opcional: si el WAF de la CMF bloquea, no tumba la corrida.

Descarga la cartera nacional (Circular 1333) del ultimo mes cerrado, elige
los 5 fondos mutuos de acciones nacionales con mayor cartera y guarda:

  - `cl_mutual_funds` (ranking por cartera nacional informada),
  - `cl_mutual_fund_holdings` (posiciones y `previous_weight` mensual),
  - `holdings` del portafolio `fondos-mutuos-acciones-cl` (cartera agregada
    ponderada por tamano de cada fondo).

Ante `CmfBlocked` devuelve status "blocked" y termina sin error; el resto de
la corrida sigue.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripcion, critica)
STAGE = (
    "cmf_fondos",
    "Top 5 fondos mutuos de acciones nacionales (CMF)",
    False,
)


def _raiz() -> Path:
    return Path(__file__).resolve().parent.parent


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = _raiz()
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from cmf_client import CmfBlocked
    from cmf_fondos import CmfFondosAdapter

    adapter = CmfFondosAdapter(dry_run=dry_run)
    try:
        return [adapter.run(db)]
    except CmfBlocked as exc:
        print(f"[cmf_fondos] bloqueado por el WAF: {exc}")
        return [
            {
                "source": "cmf_fondos",
                "status": "blocked",
                "error": str(exc),
                "dry_run": dry_run,
            }
        ]
