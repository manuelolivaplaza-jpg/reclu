"""Etapa corredoras_cl. Opcional: un PDF que cambie de formato no tumba la corrida.

La UI y el aviso legal viven en
`src/components/source-panels/corredoras-cl.tsx` (F16/F24). Aquí solo se
leen PDF públicos.
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
