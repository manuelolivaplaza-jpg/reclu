"""Etapa cmf_accionistas. Opcional: si el WAF de la CMF bloquea, no tumba la corrida.

Recorre las emisoras con nemotecnico del mapa verificado de F15 y guarda sus
12 mayores accionistas (pestania 5 de la ficha CMF) en `cl_top_shareholders`.
El periodo lo informa la propia CMF ("09 / 2026" -> "2026-09"), asi que cada
corrida agrega el trimestre publicado sin pisar los anteriores.

Ante `CmfBlocked` (pagina "Web Page Blocked") devuelve status "blocked" y
termina sin error; el resto de la corrida sigue. Los errores de una emisora
puntual se acumulan en `errores` sin cortar las demas.

No usa el MCP de terceros mcp-cmf-chile.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripcion, critica)
STAGE = (
    "cmf_accionistas",
    "12 mayores accionistas de acciones IPSA (CMF)",
    False,
)


def _raiz() -> Path:
    return Path(__file__).resolve().parent.parent


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = _raiz()
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from cmf_accionistas import CmfAccionistasAdapter
    from cmf_client import CmfBlocked

    adapter = CmfAccionistasAdapter(dry_run=dry_run)
    try:
        return [adapter.run(db)]
    except CmfBlocked as exc:
        print(f"[cmf_accionistas] bloqueado por el WAF: {exc}")
        return [
            {
                "source": "cmf_accionistas",
                "status": "blocked",
                "error": str(exc),
                "dry_run": dry_run,
            }
        ]
