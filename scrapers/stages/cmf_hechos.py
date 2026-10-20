"""Etapa cmf_hechos. Opcional: si el WAF de la CMF bloquea, no tumba la corrida.

Descarga la portada de hechos esenciales de la CMF (ultimos 7 dias, sin
captcha) y la deja en `cl_material_events`. Ante `CmfBlocked` registra un
`scraper_error` sobre el portafolio `hechos-esenciales-cl`
(is_published=false) y termina sin error.

No usa el MCP de terceros mcp-cmf-chile.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# (id, descripcion, critica)
STAGE = (
    "cmf_hechos",
    "Hechos esenciales CMF (OPA, capital, dividendos, control)",
    False,
)

PORTFOLIO_SLUG = "hechos-esenciales-cl"


def _raiz() -> Path:
    return Path(__file__).resolve().parent.parent


def _registrar_scraper_error(db: Any, mensaje: str, source_url: str) -> None:
    """Alerta interna (is_published=false). Si falta el portafolio, solo loguea."""
    try:
        fila = (
            db.table("portfolios")
            .select("id")
            .eq("slug", PORTFOLIO_SLUG)
            .maybe_single()
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[cmf_hechos] WARNING no pude resolver {PORTFOLIO_SLUG}: {exc}")
        return
    if not fila or not fila.data:
        print(f"[cmf_hechos] WARNING falta el portafolio {PORTFOLIO_SLUG}; no registro scraper_error")
        return
    db.table("alerts").insert(
        {
            "portfolio_id": fila.data["id"],
            "type": "scraper_error",
            "severity": "low",
            "title": "CMF: el WAF bloqueo la descarga de hechos esenciales",
            "payload": {
                "source": "cmf_hechos",
                "source_url": source_url,
                "error": mensaje[:500],
            },
            "is_published": False,
        }
    ).execute()
    print("[cmf_hechos] scraper_error registrado (is_published=false)")


def run(db: Any, dry_run: bool) -> list[dict[str, Any]]:
    raiz = _raiz()
    if str(raiz) not in sys.path:
        sys.path.insert(0, str(raiz))
    from cmf_client import CmfBlocked
    from cmf_hechos import CmfHechosAdapter, source_url

    adapter = CmfHechosAdapter(dry_run=dry_run)
    try:
        return [adapter.run(db)]
    except CmfBlocked as exc:
        print(f"[cmf_hechos] bloqueado por el WAF: {exc}")
        if not dry_run and db is not None:
            _registrar_scraper_error(db, str(exc), source_url())
        return [
            {
                "source": "cmf_hechos",
                "status": "blocked",
                "error": str(exc),
                "dry_run": dry_run,
            }
        ]
