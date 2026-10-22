"""Compatibilidad con supabase-py / postgrest.

`.maybe_single().execute()` devuelve `None` (no un objeto con `.data`)
cuando la consulta no trae filas. Muchos scrapers hacen `result.data` y
caían con "'NoneType' object has no attribute 'data'". `patch_maybe_single`
hace que devuelva un resultado vacío con `data=None` y `count=None`, así
el `if not result.data` existente funciona. `data_of` sirve para código
nuevo.
"""
from __future__ import annotations

from typing import Any


class EmptyResult:
    """Resultado sin filas: imita la forma de SingleAPIResponse."""

    data: Any = None
    count: int | None = None

    def __bool__(self) -> bool:  # un resultado vacío es falsy
        return False


def data_of(result: Any) -> Any:
    """`.data` de una respuesta de supabase, o None si la respuesta es None."""
    if result is None:
        return None
    return getattr(result, "data", None)


def patch_maybe_single(builder_cls: Any = None) -> bool:
    """Envuelve `execute` del builder de maybe_single (idempotente)."""
    if builder_cls is None:
        try:
            from postgrest._sync.request_builder import SyncMaybeSingleRequestBuilder
        except Exception:  # noqa: BLE001 - versión distinta: no se parchea
            return False
        builder_cls = SyncMaybeSingleRequestBuilder
    original = builder_cls.execute
    if getattr(original, "_reclu_safe", False):
        return True

    def execute(self, *args: Any, **kwargs: Any) -> Any:
        result = original(self, *args, **kwargs)
        return EmptyResult() if result is None else result

    execute._reclu_safe = True  # type: ignore[attr-defined]
    builder_cls.execute = execute
    return True
