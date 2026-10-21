"""Etapa news_edgar: noticias de los 8-K de la SEC (EDGAR).

Apagada por defecto: solo corre con ``NEWS_IMPACT_ENABLED=true``. Lee el feed
Atom oficial de 8-K, extrae los ítems del documento principal y escribe
``news_items`` + ``news_tickers`` (relación directa). Sin APIs pagadas.

Opcional: un filing roto no tumba la corrida. En ``--dry-run`` se lee la red
pero no se escribe nada en Supabase.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripción, crítica)
STAGE = (
    "news_edgar",
    "Noticias 8-K (SEC EDGAR) → news_items",
    False,
)


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = Path(__file__).resolve().parent.parent
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from base import log
    from news_edgar import NEWS_FLAG, NewsEdgarAdapter, news_enabled

    if not news_enabled():
        log(f"[news_edgar] omitida: {NEWS_FLAG} != true")
        return [
            {
                "source": "news_edgar",
                "status": "skipped",
                "reason": f"{NEWS_FLAG} != true",
                "dry_run": dry_run,
            }
        ]

    return [NewsEdgarAdapter(dry_run=dry_run).run(db)]
