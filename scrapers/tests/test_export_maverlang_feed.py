"""Feed privado firmado para Maverlang (vía B). Sin red ni Supabase reales.

Correr (desde la raíz del repo, con cryptography instalada):
    python -m pytest scrapers/tests/test_export_maverlang_feed.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from export_maverlang_feed import (  # noqa: E402
    build_detail,
    compute_version_id,
    export_feed,
    is_pending_row,
    ping_maverlang,
)
from feed_canonical_slugs import (  # noqa: E402
    ALIAS_TO_CANONICAL,
    CANONICAL_BY_SLUG,
    EXCLUDED_FAMILIES,
    FEED_ENTRIES,
    is_exportable_slug,
    resolve_canonical,
)
from feed_sign import (  # noqa: E402
    export_enabled,
    load_private_key,
    load_public_key,
    sign_index,
    verify_index,
)


def _keypair() -> tuple[str, object, str]:
    private = Ed25519PrivateKey.generate()
    pem = private.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
    public = private.public_key()
    return pem, public, "test-key-d76"


def _env(tmp_path: Path, pem: str, key_id: str = "test-key-d76", **extra: str) -> dict[str, str]:
    env = {
        "FRACCION_FEED_EXPORT_ENABLED": "true",
        "FRACCION_FEED_SIGNING_KEY": pem,
        "FRACCION_FEED_KEY_ID": key_id,
        "FRACCION_FEED_OUTPUT_DIR": str(tmp_path),
    }
    env.update(extra)
    return env


def _holding(symbol: str, name: str, weight: float, as_of: str, **extra: object) -> dict:
    row = {
        "symbol": symbol,
        "name": name,
        "weight": weight,
        "as_of": as_of,
        "currency": "USD",
        "asset_class": "equity",
    }
    row.update(extra)
    return row


# Fixtures deliberadamente sintéticos: no son holdings reales.
BRK_ROWS = [
    _holding("AAA", "Fixture Alpha", 60.0, "2020-01-15"),
    _holding("BBB", "Fixture Beta", 40.0, "2020-01-15"),
]
ARKK_ROWS = [
    _holding("CCC", "Fixture Gamma", 100.0, "2020-02-01"),
]
NORGES_ROWS = [
    _holding(f"N{i:02d}", f"Fixture Norges {i}", 1.0, "2020-03-01")
    for i in range(1, 6)
]
SCION_ROWS = [
    _holding("DDD", "Fixture Frozen", 100.0, "2020-04-01"),
]


def test_flag_off_is_exact_true_only():
    assert export_enabled({}) is False
    assert export_enabled({"FRACCION_FEED_EXPORT_ENABLED": ""}) is False
    assert export_enabled({"FRACCION_FEED_EXPORT_ENABLED": "false"}) is False
    assert export_enabled({"FRACCION_FEED_EXPORT_ENABLED": "TRUE"}) is False
    assert export_enabled({"FRACCION_FEED_EXPORT_ENABLED": "True"}) is False
    assert export_enabled({"FRACCION_FEED_EXPORT_ENABLED": "true"}) is True


def test_catalog_is_only_13f_and_etf():
    families = {entry["family"] for entry in FEED_ENTRIES}
    assert families == {"13f", "etf"}
    assert len([e for e in FEED_ENTRIES if e["family"] == "13f"]) == 29
    assert len([e for e in FEED_ENTRIES if e["family"] == "etf"]) == 14
    for slug in (
        "nancy-pelosi",
        "pelosi-tracker",
        "oge-officials",
        "house-ptr",
        "renta4",
        "btg-pactual",
        "afp-modelo",
        "inverse-cramer",
    ):
        assert is_exportable_slug(slug) is False
        assert resolve_canonical(slug) is None
    for family in EXCLUDED_FAMILIES:
        assert family not in families


def test_aliases_resolve_but_are_not_canonical_files():
    assert resolve_canonical("berkshire-hathaway") == "berkshire-hathaway-13f"
    assert resolve_canonical("pershing-square") == "pershing-square-13f"
    assert "berkshire-hathaway" not in CANONICAL_BY_SLUG
    assert "berkshire-hathaway-13f" in CANONICAL_BY_SLUG
    for alias in ALIAS_TO_CANONICAL:
        assert alias not in CANONICAL_BY_SLUG


def test_version_id_stable_if_generated_at_changes():
    positions = [
        {"symbol": "BBB", "name": "Fixture Beta", "weight": 40.0},
        {"symbol": "AAA", "name": "Fixture Alpha", "weight": 60.0},
    ]
    first = compute_version_id(
        "berkshire-hathaway-13f", "2020-01-15", "2020-01-15", "full_13f", False, positions
    )
    shuffled = list(reversed(positions))
    second = compute_version_id(
        "berkshire-hathaway-13f", "2020-01-15", "2020-01-15", "full_13f", False, shuffled
    )
    assert first == second
    assert first.startswith("v1:")
    assert len(first) == 3 + 64
    third = compute_version_id(
        "berkshire-hathaway-13f", "2020-01-16", "2020-01-15", "full_13f", False, positions
    )
    assert third != first


def test_norges_weights_need_not_sum_100():
    entry = CANONICAL_BY_SLUG["norges-bank-13f"]
    detail = build_detail(entry, NORGES_ROWS, generated_at="2020-05-01T00:00:00Z")
    assert detail is not None
    assert detail["coverage"] == "top50_of_full_book"
    assert detail["is_complete"] is False
    assert detail["copyable_hint"] == "informational"
    total = sum(p["weight"] for p in detail["positions"])
    assert total < 100
    # El validador del feed no exige suma 100 cuando coverage es top50.


def test_scion_is_frozen_and_informational():
    entry = CANONICAL_BY_SLUG["scion-13f"]
    detail = build_detail(entry, SCION_ROWS, generated_at="2020-05-01T00:00:00Z")
    assert detail is not None
    assert detail["is_frozen"] is True
    assert detail["copyable_hint"] == "informational"


def test_pending_rows_and_old_as_of_are_dropped():
    rows = [
        _holding("AAA", "Fixture Alpha", 60.0, "2020-01-15"),
        _holding("OLD", "Fixture Old", 99.0, "2019-01-15"),
        _holding("", "Sin ticker", 5.0, "2020-01-15"),
        _holding("PEN", "Pending", 5.0, "2020-01-15", status="pendiente"),
    ]
    entry = CANONICAL_BY_SLUG["berkshire-hathaway-13f"]
    detail = build_detail(entry, rows, generated_at="2020-05-01T00:00:00Z")
    assert detail is not None
    symbols = [p["symbol"] for p in detail["positions"]]
    assert symbols == ["AAA"]
    assert "performance" not in detail
    assert "series" not in detail
    assert detail["skipped_pending"] == 2


def test_is_pending_row():
    assert is_pending_row({"symbol": ""}) is True
    assert is_pending_row({"symbol": "AAA", "status": "pendiente"}) is True
    assert is_pending_row({"symbol": "AAA", "pending": True}) is True
    assert is_pending_row({"symbol": "AAA"}) is False


def test_export_writes_only_canonical_slugs_and_no_performance(tmp_path: Path):
    pem, public, key_id = _keypair()
    env = _env(tmp_path, pem, key_id)
    holdings = {
        "berkshire-hathaway-13f": BRK_ROWS,
        "arkk": ARKK_ROWS,
        "norges-bank-13f": NORGES_ROWS,
        "scion-13f": SCION_ROWS,
        "berkshire-hathaway": BRK_ROWS,  # alias: no debe salir como archivo
        "nancy-pelosi": [_holding("ZZZ", "No debe salir", 100.0, "2020-01-01")],
    }
    result = export_feed(
        tmp_path,
        holdings_by_slug=holdings,
        env=env,
        generated_at="2020-05-01T00:00:00Z",
        do_ping=False,
        do_upload=False,
    )
    assert result["exported"] == 4
    written = {p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*.json")}
    assert "index.json" in written
    assert "status.json" in written
    assert "portfolios/berkshire-hathaway-13f.json" in written
    assert "portfolios/arkk.json" in written
    assert "portfolios/berkshire-hathaway.json" not in written
    assert "portfolios/nancy-pelosi.json" not in written

    index = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert verify_index(index, public) is True
    slugs = [item["slug"] for item in index["portfolios"]]
    assert slugs == sorted(slugs) or set(slugs) == {
        "arkk",
        "berkshire-hathaway-13f",
        "norges-bank-13f",
        "scion-13f",
    }
    assert "berkshire-hathaway" not in slugs
    assert index["aliases"]["berkshire-hathaway"] == "berkshire-hathaway-13f"
    assert "performance" not in index
    for item in index["portfolios"]:
        assert "performance" not in item

    brk = json.loads((tmp_path / "portfolios/berkshire-hathaway-13f.json").read_text(encoding="utf-8"))
    assert "performance" not in brk
    assert brk["version_id"] == result["version_ids"]["berkshire-hathaway-13f"]
    assert brk["generated_at"] == "2020-05-01T00:00:00Z"


def test_index_carries_manager_same_as_detail(tmp_path: Path):
    """d94: el índice expone `manager` con el mismo valor que el detalle."""
    pem, public, key_id = _keypair()
    holdings = {
        "berkshire-hathaway-13f": BRK_ROWS,
        "arkk": ARKK_ROWS,
    }
    export_feed(
        tmp_path,
        holdings_by_slug=holdings,
        env=_env(tmp_path, pem, key_id),
        generated_at="2020-05-01T00:00:00Z",
        do_ping=False,
        do_upload=False,
    )
    index = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert verify_index(index, public) is True
    assert index["portfolios"], "el índice debe traer al menos un portafolio"
    for item in index["portfolios"]:
        assert "manager" in item
        expected = CANONICAL_BY_SLUG[item["slug"]].get("manager")
        assert item["manager"] == expected
        detail = json.loads(
            (tmp_path / item["detail_path"]).read_text(encoding="utf-8")
        )
        assert detail["manager"] == item["manager"]
    manager_by_slug = {item["slug"]: item["manager"] for item in index["portfolios"]}
    assert manager_by_slug["berkshire-hathaway-13f"] == "Warren Buffett"
    assert manager_by_slug["arkk"] == "Cathie Wood"


def test_version_id_stable_across_reexport_with_new_generated_at(tmp_path: Path):
    pem, public, key_id = _keypair()
    env = _env(tmp_path / "a", pem, key_id)
    holdings = {"berkshire-hathaway-13f": BRK_ROWS}
    first = export_feed(
        tmp_path / "a",
        holdings_by_slug=holdings,
        env=env,
        generated_at="2020-05-01T00:00:00Z",
        do_ping=False,
        do_upload=False,
    )
    second = export_feed(
        tmp_path / "b",
        holdings_by_slug=holdings,
        env=_env(tmp_path / "b", pem, key_id),
        generated_at="2020-05-02T00:00:00Z",
        do_ping=False,
        do_upload=False,
    )
    assert first["version_ids"]["berkshire-hathaway-13f"] == second["version_ids"]["berkshire-hathaway-13f"]
    first_index = json.loads((tmp_path / "a/index.json").read_text(encoding="utf-8"))
    second_index = json.loads((tmp_path / "b/index.json").read_text(encoding="utf-8"))
    assert first_index["generated_at"] != second_index["generated_at"]
    assert first_index["signature"]["sig"] != second_index["signature"]["sig"]
    assert verify_index(first_index, public) is True
    assert verify_index(second_index, public) is True


def test_unsigned_or_tampered_index_is_rejected(tmp_path: Path):
    pem, public, key_id = _keypair()
    export_feed(
        tmp_path,
        holdings_by_slug={"arkk": ARKK_ROWS},
        env=_env(tmp_path, pem, key_id),
        generated_at="2020-05-01T00:00:00Z",
        do_ping=False,
        do_upload=False,
    )
    index = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert verify_index(index, public) is True
    unsigned = {k: v for k, v in index.items() if k != "signature"}
    assert verify_index(unsigned, public) is False
    tampered = json.loads(json.dumps(index))
    tampered["portfolios"][0]["as_of"] = "1999-01-01"
    assert verify_index(tampered, public) is False
    other_pub = Ed25519PrivateKey.generate().public_key()
    assert verify_index(index, other_pub) is False


def test_enabled_without_key_fails_closed(tmp_path: Path):
    with pytest.raises(ValueError, match="FRACCION_FEED_SIGNING_KEY"):
        export_feed(
            tmp_path,
            holdings_by_slug={"arkk": ARKK_ROWS},
            env={"FRACCION_FEED_EXPORT_ENABLED": "true", "FRACCION_FEED_KEY_ID": "x"},
            do_ping=False,
            do_upload=False,
        )


def test_ping_body_shape_and_single_attempt():
    calls: list[dict] = []

    def poster(url, headers, body, timeout):
        calls.append({"url": url, "headers": headers, "body": body, "timeout": timeout})
        return 200, "ok"

    body = {
        "tag": "fraccion-feed",
        "source": "fraccion.si",
        "generated_at": "2020-05-01T00:00:00Z",
        "status": "ok",
        "index_sha256": "abc",
        "key_id": "test-key-d76",
    }
    result = ping_maverlang(
        {
            "MAVERLANG_REVALIDATE_URL": "https://example.test/revalidate",
            "MAVERLANG_REVALIDATE_SECRET": "s3cret",
        },
        body,
        http_post=poster,
    )
    assert result["ok"] is True
    assert len(calls) == 1
    sent = json.loads(calls[0]["body"].decode("utf-8"))
    assert sent == body
    assert calls[0]["headers"]["Authorization"] == "Bearer s3cret"
    assert calls[0]["url"] == "https://example.test/revalidate"


def test_ping_skipped_if_url_or_secret_missing():
    assert ping_maverlang({}, {"tag": "fraccion-feed"})["skipped"] is True
    assert ping_maverlang({"MAVERLANG_REVALIDATE_URL": "https://x"}, {"tag": "t"})["skipped"] is True


def test_export_pings_after_write(tmp_path: Path):
    pem, _, key_id = _keypair()
    calls: list[bytes] = []

    def poster(url, headers, body, timeout):
        calls.append(body)
        return 204, ""

    result = export_feed(
        tmp_path,
        holdings_by_slug={"arkk": ARKK_ROWS},
        env=_env(
            tmp_path,
            pem,
            key_id,
            MAVERLANG_REVALIDATE_URL="https://example.test/revalidate",
            MAVERLANG_REVALIDATE_SECRET="s3cret",
        ),
        generated_at="2020-05-01T00:00:00Z",
        http_post=poster,
        do_upload=False,
    )
    assert len(calls) == 1
    sent = json.loads(calls[0].decode("utf-8"))
    assert sent["tag"] == "fraccion-feed"
    assert sent["source"] == "fraccion.si"
    assert sent["index_sha256"] == result["index_sha256"]
    assert sent["key_id"] == key_id
    assert sent["status"] == "partial"  # el resto del catálogo no tenía holdings
    assert result["ping"]["ok"] is True


def test_inactive_portfolio_is_skipped(tmp_path: Path):
    pem, _, key_id = _keypair()
    result = export_feed(
        tmp_path,
        holdings_by_slug={"arkk": ARKK_ROWS},
        portfolios={"arkk": {"is_active": False}},
        env=_env(tmp_path, pem, key_id),
        generated_at="2020-05-01T00:00:00Z",
        do_ping=False,
        do_upload=False,
    )
    assert result["exported"] == 0
    assert {"slug": "arkk", "reason": "inactive"} in result["skipped"]
    assert not (tmp_path / "portfolios/arkk.json").exists()


def test_load_private_key_accepts_hex_and_escaped_pem():
    private = Ed25519PrivateKey.generate()
    seed = private.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    loaded = load_private_key(seed.hex())
    assert loaded.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw) == private.public_key().public_bytes(
        Encoding.Raw, PublicFormat.Raw
    )
    pem = private.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
    escaped = pem.replace("\n", "\\n")
    loaded_pem = load_private_key(escaped)
    msg = b'{"ok":true}'
    public = load_public_key(
        private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    )
    public.verify(loaded_pem.sign(msg), msg)
