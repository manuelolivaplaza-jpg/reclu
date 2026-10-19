"""Etapa corredoras_cl. Opcional: un PDF que cambie de formato no tumba la corrida.

TODO(F16): sin UI. El aviso legal, cuando estas carteras se muestren,
vive en el componente de F16. Aquí solo se leen PDF públicos.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica)
STAGE = (
    "corredoras_cl",
    "Carteras recomendadas BICE y MBI (PDF público)",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from corredoras_cl import correr

    return correr(db, dry_run)
