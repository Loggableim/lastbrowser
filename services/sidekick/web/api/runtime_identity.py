"""Opaque per-process identity used to scope transient runtime evidence."""
from __future__ import annotations

import os
from uuid import uuid4

RUNTIME_GENERATION = os.environ.get("LASTBROWSER_RUNTIME_GENERATION") or uuid4().hex
_PROVIDER_CONFIG_GENERATIONS: dict[str, str] = {}


def provider_config_generation(provider_id: str) -> str:
    provider = str(provider_id or "").strip().lower()
    if not provider:
        return ""
    return _PROVIDER_CONFIG_GENERATIONS.setdefault(provider, uuid4().hex)


def rotate_provider_config_generation(provider_id: str) -> str:
    provider = str(provider_id or "").strip().lower()
    if not provider:
        return ""
    generation = uuid4().hex
    _PROVIDER_CONFIG_GENERATIONS[provider] = generation
    return generation
