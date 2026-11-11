"""Firma Ed25519 del índice del feed privado Maverlang.

La clave privada solo se lee de la variable de entorno FRACCION_FEED_SIGNING_KEY.
Este módulo no genera claves.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import load_pem_private_key, load_pem_public_key

ALG = "ed25519"
SIGNING_KEY_ENV = "FRACCION_FEED_SIGNING_KEY"
KEY_ID_ENV = "FRACCION_FEED_KEY_ID"
EXPORT_ENABLED_ENV = "FRACCION_FEED_EXPORT_ENABLED"
HEX32 = re.compile(r"^[0-9a-fA-F]{64}$")


def export_enabled(env: dict[str, str] | None = None) -> bool:
    """Fail closed: solo se activa con el valor exacto 'true' (minúsculas)."""
    source = os.environ if env is None else env
    return str(source.get(EXPORT_ENABLED_ENV, "")).strip() == "true"


def canonical_json_bytes(payload: Any) -> bytes:
    """JSON compacto con claves ordenadas, estable entre reexports."""
    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _normalize_key_material(raw: str) -> bytes:
    text = raw.strip().replace("\r\n", "\n")
    # En secretos de Actions/Vercel los saltos de un PEM suelen venir como \n literales.
    if "\\n" in text and "BEGIN" in text:
        text = text.replace("\\n", "\n")
    return text.encode("utf-8")


def load_private_key(raw: str) -> Ed25519PrivateKey:
    if not raw or not raw.strip():
        raise ValueError("FRACCION_FEED_SIGNING_KEY está vacía")
    text = raw.strip()
    if "BEGIN" in text:
        key = load_pem_private_key(_normalize_key_material(text), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError("FRACCION_FEED_SIGNING_KEY no es una clave Ed25519")
        return key
    if HEX32.fullmatch(text):
        return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(text))
    try:
        seed = base64.b64decode(text, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            "FRACCION_FEED_SIGNING_KEY debe ser PEM PKCS#8, hex de 32 bytes o base64 de 32 bytes"
        ) from exc
    if len(seed) != 32:
        raise ValueError("FRACCION_FEED_SIGNING_KEY en base64 no tiene 32 bytes")
    return Ed25519PrivateKey.from_private_bytes(seed)


def load_public_key(raw: str) -> Ed25519PublicKey:
    text = raw.strip()
    if "BEGIN" in text:
        key = load_pem_public_key(_normalize_key_material(text))
        if not isinstance(key, Ed25519PublicKey):
            raise ValueError("la clave pública no es Ed25519")
        return key
    if HEX32.fullmatch(text):
        return Ed25519PublicKey.from_public_bytes(bytes.fromhex(text))
    raw_bytes = base64.b64decode(text, validate=True)
    if len(raw_bytes) != 32:
        raise ValueError("clave pública en base64 no tiene 32 bytes")
    return Ed25519PublicKey.from_public_bytes(raw_bytes)


def load_private_key_from_env(env: dict[str, str] | None = None) -> tuple[Ed25519PrivateKey, str]:
    source = os.environ if env is None else env
    raw = source.get(SIGNING_KEY_ENV, "")
    key_id = str(source.get(KEY_ID_ENV, "")).strip()
    if not raw or not str(raw).strip():
        raise ValueError(f"{SIGNING_KEY_ENV} no está configurada")
    if not key_id:
        raise ValueError(f"{KEY_ID_ENV} no está configurada")
    return load_private_key(str(raw)), key_id


def unsigned_index(index_doc: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in index_doc.items() if k != "signature"}


def sign_index(index_doc: dict[str, Any], private_key: Ed25519PrivateKey, key_id: str) -> dict[str, Any]:
    """Devuelve una copia del índice con el bloque signature."""
    body = unsigned_index(index_doc)
    signature = base64.b64encode(private_key.sign(canonical_json_bytes(body))).decode("ascii")
    signed = dict(index_doc)
    signed["signature"] = {
        "alg": ALG,
        "key_id": key_id,
        "sig": signature,
    }
    return signed


def verify_index(index_doc: dict[str, Any], public_key: Ed25519PublicKey) -> bool:
    sig_block = index_doc.get("signature")
    if not isinstance(sig_block, dict):
        return False
    if sig_block.get("alg") != ALG or not sig_block.get("sig"):
        return False
    try:
        sig = base64.b64decode(sig_block["sig"], validate=True)
        public_key.verify(sig, canonical_json_bytes(unsigned_index(index_doc)))
    except Exception:  # noqa: BLE001
        return False
    return True
