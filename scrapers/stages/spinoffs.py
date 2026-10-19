"""Etapa spinoffs. Opcional: un EFTS caído no tumba la corrida.

Solo lee documentos públicos de la SEC (EDGAR). La cartera spinoffs-12m se
mantiene con los spin-offs que ya muestran ticker. El aviso legal de estas
carteras vive en el componente de F16; aquí no hay UI. En --dry-run no se
escribe nada en Supabase.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica)
STAGE = (
    "spinoffs",
    "Spin-offs: Form 10-12B (SEC EDGAR)",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from spinoffs import SpinoffsAdapter

    return [SpinoffsAdapter(dry_run=dry_run).run(db)]
