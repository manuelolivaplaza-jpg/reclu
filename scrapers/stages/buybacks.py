"""Etapa buybacks. Opcional: un frame caído no tumba la corrida.

Lee los XBRL frames públicos de la SEC y arma el ranking trimestral de
recompras. El portafolio recompras-top20 se mantiene con las 20 empresas de
mayor monto que tengan ticker identificable. El aviso legal de estas carteras
vive en el componente de F16; aquí no hay UI. En --dry-run no se escribe nada
en Supabase.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica)
STAGE = (
    "buybacks",
    "Recompras de acciones: XBRL frames (SEC)",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from buybacks import BuybackAdapter

    return [BuybackAdapter(dry_run=dry_run).run(db)]
