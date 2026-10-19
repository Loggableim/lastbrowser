"""Model-id rules shared by the catalog and the keyless free chat route."""
from __future__ import annotations

import re

FREE_MODEL_SUFFIX = "-free"
_FREE_MODEL_ID = re.compile(r"[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?-free")
_RESTRICTED_FREE_SUFFIXES = ("-contributor-free",)


def is_free_model_id(model_id: object) -> bool:
    """Return True only for a bare, generally available ``-free`` model id.

    A trailing ``-free`` is not enough on its own: the id must have a real
    stem, must not be an access-restricted ``-contributor-free`` id, and must
    not carry a path/namespace or whitespace. Callers strip a known
    ``opencode/`` prefix before asking.
    """
    value = str(model_id or "").strip().lower()
    if not value or value.endswith(_RESTRICTED_FREE_SUFFIXES):
        return False
    return bool(_FREE_MODEL_ID.fullmatch(value))
