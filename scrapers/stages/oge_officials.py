"""Etapa oge_officials. Opcional: un índice caído no tumba la corrida.

Generaliza F13 (Trump) al resto del gabinete de EE.UU. Los informes 278-T se
publican en la OGE y son públicos: 5 U.S.C. § 13107(c)(1)(B). En --dry-run no
se escribe nada en Supabase.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica)
STAGE = (
    "oge_officials",
    "Funcionarios de EE.UU.: declaraciones OGE 278-T",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from oge_officials import OgeOfficialsAdapter

    return [OgeOfficialsAdapter(dry_run=dry_run).run(db)]
