"""Exporta el feed privado firmado para Maverlang (vía B).

Solo familias 13F y ETF, slugs canónicos. Sin serie de Yahoo, sin PTR,
sin OGE y sin políticos. Apagado por defecto: solo corre si
FRACCION_FEED_EXPORT_ENABLED=true (exacto, minúsculas).

Uso:
    python export_maverlang_feed.py
    python export_maverlang_feed.py --output-dir /tmp/feed

No genera claves. La privada se lee de FRACCION_FEED_SIGNING_KEY.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

from feed_canonical_slugs import (
    ALIAS_TO_CANONICAL,
    CANONICAL_BY_SLUG,
    FEED_ENTRIES,
    is_exportable_slug,
)
from feed_sign import (
    canonical_json_bytes,
    export_enabled,
    load_private_key_from_env,
    sha256_hex,
    sign_index,
)

OUTPUT_DIR_ENV = "FRACCION_FEED_OUTPUT_DIR"
UPLOAD_URL_ENV = "FRACCION_FEED_UPLOAD_URL"
UPLOAD_TOKEN_ENV = "FRACCION_FEED_UPLOAD_TOKEN"
PING_URL_ENV = "MAVERLANG_REVALIDATE_URL"
PING_SECRET_ENV = "MAVERLANG_REVALIDATE_SECRET"

SCHEMA_INDEX = "fraccion.feed.index.v1"
SCHEMA_DETAIL = "fraccion.feed.detail.v1"
SCHEMA_STATUS = "fraccion.feed.status.v1"
PING_TAG = "fraccion-feed"
PING_SOURCE = "fraccion.si"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "data" / "maverlang-feed"

HttpPost = Callable[[str, dict[str, str], bytes, float], tuple[int, str]]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def iso_date(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:10]


def is_pending_row(row: dict[str, Any]) -> bool:
    status = str(row.get("status") or row.get("ticker_status") or "").strip().lower()
    if status in {"pending", "pendiente", "unresolved"}:
        return True
    if row.get("pending") is True:
        return True
    symbol = str(row.get("symbol") or "").strip()
    return not symbol


def normalize_position(row: dict[str, Any]) -> dict[str, Any]:
    weight = row.get("weight")
    try:
        weight_num = float(weight) if weight is not None else 0.0
    except (TypeError, ValueError):
        weight_num = 0.0
    position: dict[str, Any] = {
        "symbol": str(row.get("symbol") or "").strip(),
        "name": str(row.get("name") or "").strip(),
        "weight": weight_num,
    }
    currency = row.get("currency")
    if currency:
        position["currency"] = str(currency)
    asset_class = row.get("asset_class")
    if asset_class:
        position["asset_class"] = str(asset_class)
    return position


def sort_positions(positions: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(positions, key=lambda p: (str(p.get("symbol") or ""), str(p.get("name") or "")))


def compute_version_id(
    slug: str,
    as_of: str | None,
    filed_at: str | None,
    coverage: str,
    is_frozen: bool,
    positions: list[dict[str, Any]],
) -> str:
    payload = {
        "as_of": as_of,
        "coverage": coverage,
        "filed_at": filed_at,
        "is_frozen": bool(is_frozen),
        "positions": sort_positions(positions),
        "slug": slug,
    }
    return "v1:" + sha256_hex(canonical_json_bytes(payload))


def copyable_hint(entry: dict[str, Any]) -> str:
    if entry.get("is_frozen") or entry.get("coverage") == "top50_of_full_book":
        return "informational"
    return "lagged_disclosure"


def build_detail(
    entry: dict[str, Any],
    holdings: list[dict[str, Any]],
    *,
    generated_at: str,
    portfolio_meta: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Arma el detalle del último as_of. Devuelve None si no hay posiciones listables."""
    current: list[dict[str, Any]] = []
    skipped_pending = 0
    as_of_dates = {iso_date(row.get("as_of")) for row in holdings if iso_date(row.get("as_of"))}
    latest = max(as_of_dates) if as_of_dates else None
    for row in holdings:
        if latest and iso_date(row.get("as_of")) != latest:
            continue
        if is_pending_row(row):
            skipped_pending += 1
            continue
        current.append(normalize_position(row))
    current = sort_positions(current)
    if not current:
        return None

    filed_candidates = [
        iso_date((portfolio_meta or {}).get("filed_at")),
        iso_date((portfolio_meta or {}).get("filing_date")),
        latest,
    ]
    filed_at = next((item for item in filed_candidates if item), None)
    coverage = str(entry["coverage"])
    is_frozen = bool(entry["is_frozen"])
    is_complete = coverage != "top50_of_full_book"
    version_id = compute_version_id(
        entry["slug"], latest, filed_at, coverage, is_frozen, current
    )
    return {
        "schema": SCHEMA_DETAIL,
        "slug": entry["slug"],
        "aliases": list(entry.get("aliases") or ()),
        "name": entry["name"],
        "manager": entry.get("manager"),
        "family": entry["family"],
        "source": entry.get("source"),
        "country": entry.get("country"),
        "as_of": latest,
        "filed_at": filed_at,
        "generated_at": generated_at,
        "version_id": version_id,
        "coverage": coverage,
        "is_frozen": is_frozen,
        "is_complete": is_complete,
        "copyable_hint": copyable_hint(entry),
        "lag_note": entry.get("lag_note"),
        "license": entry.get("license"),
        "attribution": entry.get("attribution"),
        "source_url": entry.get("source_url"),
        "position_count": len(current),
        "positions": current,
        "skipped_pending": skipped_pending,
    }


def write_json(path: Path, payload: dict[str, Any]) -> bytes:
    data = canonical_json_bytes(payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def default_http_post(url: str, headers: dict[str, str], body: bytes, timeout: float) -> tuple[int, str]:
    import httpx

    response = httpx.post(url, headers=headers, content=body, timeout=timeout)
    return response.status_code, (response.text or "")[:500]


def ping_maverlang(
    env: dict[str, str],
    body: dict[str, Any],
    *,
    http_post: HttpPost | None = None,
) -> dict[str, Any]:
    """Un solo intento. Si falta URL o secreto, se omite con advertencia."""
    url = str(env.get(PING_URL_ENV, "")).strip()
    secret = str(env.get(PING_SECRET_ENV, "")).strip()
    if not url or not secret:
        return {"ok": False, "skipped": True, "reason": "missing_url_or_secret"}
    poster = http_post or default_http_post
    payload = canonical_json_bytes(body)
    headers = {
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        status, text = poster(url, headers, payload, 15.0)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "skipped": False, "reason": str(exc)}
    if 200 <= status < 300:
        return {"ok": True, "skipped": False, "status_code": status}
    return {
        "ok": False,
        "skipped": False,
        "reason": f"http_{status}",
        "status_code": status,
        "body": text,
    }


def upload_tree(
    output_dir: Path,
    env: dict[str, str],
    *,
    http_put: Callable[[str, dict[str, str], bytes, float], tuple[int, str]] | None = None,
) -> dict[str, Any]:
    base = str(env.get(UPLOAD_URL_ENV, "")).strip().rstrip("/")
    token = str(env.get(UPLOAD_TOKEN_ENV, "")).strip()
    if not base:
        return {"ok": False, "skipped": True, "reason": "missing_upload_url", "uploaded": 0}
    if not token:
        return {"ok": False, "skipped": True, "reason": "missing_upload_token", "uploaded": 0}

    def _put(url: str, headers: dict[str, str], body: bytes, timeout: float) -> tuple[int, str]:
        if http_put:
            return http_put(url, headers, body, timeout)
        import httpx

        response = httpx.put(url, headers=headers, content=body, timeout=timeout)
        return response.status_code, (response.text or "")[:500]

    uploaded = 0
    for path in sorted(output_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(output_dir).as_posix()
        url = f"{base}/{rel}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        try:
            status, text = _put(url, headers, path.read_bytes(), 30.0)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "skipped": False, "reason": str(exc), "uploaded": uploaded, "file": rel}
        if not (200 <= status < 300):
            return {
                "ok": False,
                "skipped": False,
                "reason": f"http_{status}",
                "body": text,
                "uploaded": uploaded,
                "file": rel,
            }
        uploaded += 1
    return {"ok": True, "skipped": False, "uploaded": uploaded}


def paginate(query, page_size: int = 1000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        chunk = query.range(start, start + page_size - 1).execute().data or []
        rows.extend(chunk)
        if len(chunk) < page_size:
            return rows
        start += page_size


def fetch_from_supabase(client: Any) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    slugs = list(CANONICAL_BY_SLUG)
    portfolios: dict[str, dict[str, Any]] = {}
    columns = "id,slug,name,manager,source,country,category,is_active,updated_at"
    fallback = "id,slug,name,manager,source,country,category,updated_at"
    for i in range(0, len(slugs), 50):
        batch = slugs[i : i + 50]
        try:
            rows = paginate(
                client.table("portfolios").select(columns).in_("slug", batch)
            )
        except Exception:
            rows = paginate(
                client.table("portfolios").select(fallback).in_("slug", batch)
            )
        for row in rows:
            portfolios[str(row["slug"])] = row

    ids = [row["id"] for row in portfolios.values() if row.get("id")]
    holdings_by_id: dict[str, list[dict[str, Any]]] = {pid: [] for pid in ids}
    for i in range(0, len(ids), 50):
        batch = ids[i : i + 50]
        rows = paginate(
            client.table("holdings")
            .select("portfolio_id,symbol,name,weight,currency,asset_class,as_of")
            .in_("portfolio_id", batch)
        )
        for row in rows:
            holdings_by_id.setdefault(str(row["portfolio_id"]), []).append(row)

    holdings_by_slug: dict[str, list[dict[str, Any]]] = {}
    for slug, row in portfolios.items():
        holdings_by_slug[slug] = holdings_by_id.get(str(row["id"]), [])
    return portfolios, holdings_by_slug


def export_feed(
    output_dir: Path,
    *,
    holdings_by_slug: dict[str, list[dict[str, Any]]],
    portfolios: dict[str, dict[str, Any]] | None = None,
    env: dict[str, str] | None = None,
    generated_at: str | None = None,
    http_post: HttpPost | None = None,
    http_put: Callable[[str, dict[str, str], bytes, float], tuple[int, str]] | None = None,
    do_ping: bool = True,
    do_upload: bool = True,
) -> dict[str, Any]:
    """Construye index, status y detalles. Pensado para tests (sin DB ni red)."""
    source_env = dict(os.environ if env is None else env)
    when = generated_at or utc_now()
    private_key, key_id = load_private_key_from_env(source_env)
    output_dir = Path(output_dir)
    # Solo se borran artefactos del feed, nunca un árbol arbitrario.
    stale_index = output_dir / "index.json"
    stale_status = output_dir / "status.json"
    if stale_index.exists():
        stale_index.unlink()
    if stale_status.exists():
        stale_status.unlink()
    portfolios_dir = output_dir / "portfolios"
    if portfolios_dir.is_dir():
        for stale in portfolios_dir.glob("*.json"):
            stale.unlink()

    details: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    meta = portfolios or {}

    for entry in FEED_ENTRIES:
        slug = entry["slug"]
        portfolio_row = meta.get(slug) or {}
        if portfolio_row.get("is_active") is False:
            skipped.append({"slug": slug, "reason": "inactive"})
            continue
        rows = holdings_by_slug.get(slug) or []
        detail = build_detail(entry, rows, generated_at=when, portfolio_meta=portfolio_row)
        if not detail:
            skipped.append({"slug": slug, "reason": "no_holdings"})
            continue
        rel = f"portfolios/{slug}.json"
        raw = write_json(output_dir / rel, detail)
        details.append({**detail, "detail_path": rel, "detail_sha256": sha256_hex(raw)})

    index_body: dict[str, Any] = {
        "schema": SCHEMA_INDEX,
        "generated_at": when,
        "key_id": key_id,
        "families": ["13f", "etf"],
        "portfolio_count": len(details),
        "portfolios": [
            {
                "slug": item["slug"],
                "aliases": item["aliases"],
                "name": item["name"],
                "manager": item.get("manager"),
                "family": item["family"],
                "as_of": item["as_of"],
                "filed_at": item["filed_at"],
                "version_id": item["version_id"],
                "coverage": item["coverage"],
                "is_frozen": item["is_frozen"],
                "is_complete": item["is_complete"],
                "copyable_hint": item["copyable_hint"],
                "detail_path": item["detail_path"],
                "detail_sha256": item["detail_sha256"],
            }
            for item in details
        ],
        "aliases": dict(sorted(ALIAS_TO_CANONICAL.items())),
    }
    signed = sign_index(index_body, private_key, key_id)
    index_bytes = write_json(output_dir / "index.json", signed)
    index_sha = sha256_hex(index_bytes)

    if not details:
        pipeline_status = "empty"
    elif skipped:
        pipeline_status = "partial"
    else:
        pipeline_status = "ok"

    status_doc = {
        "schema": SCHEMA_STATUS,
        "generated_at": when,
        "status": pipeline_status,
        "exported": len(details),
        "skipped": skipped,
        "families": ["13f", "etf"],
        "key_id": key_id,
        "index_sha256": index_sha,
        "index_path": "index.json",
    }
    write_json(output_dir / "status.json", status_doc)

    upload_result = {"ok": False, "skipped": True, "reason": "disabled"}
    if do_upload:
        upload_result = upload_tree(output_dir, source_env, http_put=http_put)
        if upload_result.get("skipped"):
            print(f"aviso: subida omitida ({upload_result.get('reason')})")
        elif not upload_result.get("ok"):
            print(f"aviso: falló la subida ({upload_result.get('reason')})")

    ping_result = {"ok": False, "skipped": True, "reason": "disabled"}
    if do_ping:
        # Si la subida estaba configurada y falló, no avisamos a Maverlang:
        # seguirían leyendo la copia anterior.
        upload_failed = (
            do_upload
            and not upload_result.get("skipped")
            and not upload_result.get("ok")
        )
        if upload_failed:
            ping_result = {"ok": False, "skipped": True, "reason": "upload_failed"}
            print("aviso: ping omitido porque falló la subida")
        else:
            ping_body = {
                "tag": PING_TAG,
                "source": PING_SOURCE,
                "generated_at": when,
                "status": pipeline_status,
                "index_sha256": index_sha,
                "key_id": key_id,
            }
            ping_result = ping_maverlang(source_env, ping_body, http_post=http_post)
            if ping_result.get("skipped"):
                print("aviso: ping omitido (faltan MAVERLANG_REVALIDATE_URL o MAVERLANG_REVALIDATE_SECRET)")
            elif not ping_result.get("ok"):
                print(f"aviso: el ping a Maverlang falló ({ping_result.get('reason')})")

    return {
        "ok": True,
        "status": pipeline_status,
        "exported": len(details),
        "skipped": skipped,
        "key_id": key_id,
        "index_sha256": index_sha,
        "generated_at": when,
        "output_dir": str(output_dir),
        "ping": ping_result,
        "upload": upload_result,
        "version_ids": {item["slug"]: item["version_id"] for item in details},
    }


def _connect_client():
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SystemExit(
            "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY; no se puede exportar el feed."
        )
    from supabase import create_client

    return create_client(url, key)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Exporta el feed privado firmado para Maverlang")
    parser.add_argument("--output-dir", default=None, help="Directorio de salida")
    parser.add_argument(
        "--dry-run-flag",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args(argv)

    if not export_enabled():
        print("FRACCION_FEED_EXPORT_ENABLED no es 'true'; no se exporta nada.")
        return 0

    try:
        load_private_key_from_env()
    except ValueError as exc:
        print(f"error: flag encendido pero la firma no está lista ({exc})", file=sys.stderr)
        return 2

    output = Path(args.output_dir or os.environ.get(OUTPUT_DIR_ENV, "") or DEFAULT_OUTPUT)
    try:
        portfolios, holdings = fetch_from_supabase(_connect_client())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"error: no se pudieron leer portafolios/holdings ({exc})", file=sys.stderr)
        return 2

    result = export_feed(output, holdings_by_slug=holdings, portfolios=portfolios)
    print(
        f"feed {result['status']}: {result['exported']} portafolios, "
        f"{len(result['skipped'])} omitidos, index_sha256={result['index_sha256']}"
    )
    return 0


# Reexportados para los tests.
__all__ = [
    "ALIAS_TO_CANONICAL",
    "build_detail",
    "compute_version_id",
    "export_feed",
    "is_exportable_slug",
    "is_pending_row",
    "ping_maverlang",
    "sort_positions",
]

if __name__ == "__main__":
    sys.exit(main())
