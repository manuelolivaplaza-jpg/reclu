"""Etapa activists_13d. Activa y opcional: un XML roto no tumba la corrida.

Solo lee documentos públicos de la SEC (EDGAR). Las alertas son de tipo
new_trade con payload.source_url al filing. El aviso legal de estas
carteras vive en el componente de F16; aquí no hay UI.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica)
STAGE = (
    "activists_13d",
    "Activistas: Schedule 13D (SEC EDGAR)",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from activists_13d import Activists13DAdapter

    return [Activists13DAdapter(dry_run=dry_run).run(db)]
