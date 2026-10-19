"""Etapa F26: ETFs de congresistas NANC y GOP (Subversive).

Los holdings salen del N-PORT oficial en EDGAR (CIK 1742912). La web del
emisor devuelve 403 a curl y carga los holdings con JS. Si EDGAR no tiene un
N-PORT reciente, la etapa avisa y sigue: no inventa posiciones.
"""

from __future__ import annotations

STAGE = ("etfs_subversive", "ETFs NANC/GOP (Subversive, N-PORT EDGAR)", False)


def run(db, dry_run: bool) -> list[dict]:
    import etfs
    from base import log

    slugs = sorted(etfs.SUBVERSIVE_FUNDS)
    ok = 0
    for slug in slugs:
        try:
            rows = etfs.fetch_etf(slug)
            if not rows:
                log(f"[etfs_subversive] WARNING {slug}: 0 holdings")
                continue
            if dry_run:
                top = sorted(rows, key=lambda r: -r["weight"])[:3]
                preview = ", ".join(f"{r['symbol']} {r['weight']:.2f}%" for r in top)
                log(f"[etfs_subversive] DRY-RUN {slug}: {len(rows)} holdings ({preview})")
                ok += 1
                continue
            if not etfs.save_holdings(db, slug, rows):
                continue
            log(f"[etfs_subversive] OK {slug}: {len(rows)} holdings")
            ok += 1
        except Exception as e:  # noqa: BLE001 - una fuente no tumba la corrida
            log(f"[etfs_subversive] WARNING {slug}: {e}")
    return [
        {
            "source": "etfs_subversive",
            "status": "ok",
            "etfs_ok": ok,
            "total": len(slugs),
        }
    ]
