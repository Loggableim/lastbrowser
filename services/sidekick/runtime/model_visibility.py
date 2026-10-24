"""Shared per-model visibility state for Lastbrowser (GitHub issue #172, F3).

The Settings panel stores the user's per-model switches in localStorage so the
renderer reacts instantly. The same set is mirrored to the backend through
``/api/models/visibility``; automatic orchestration (Smart Track, Teamwork,
fallback chains) must only route to models that are switched on.

The renderer keys are ``provider:model`` while chat and orchestration often
work with the bare model id (some catalog entries carry an ``@provider:``
prefix, and provider API calls strip it). Matching therefore accepts the raw
id, the provider-prefixed id, and the stripped call id, mirroring
``apps/desktop/src/renderer/model-visibility.ts``.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

logger = logging.getLogger("sidekick.model_visibility")

STATE_FILENAME = "model-visibility.json"

_STATE_LOCK = threading.RLock()
_CACHED_STAMP: Optional[Tuple[int, int]] = None
_CACHED_DISABLED: Set[str] = set()


def get_model_visibility_path() -> Path:
    """Return the backend state file that mirrors the renderer switches."""
    from web.api.config import STATE_DIR

    return Path(STATE_DIR) / STATE_FILENAME


def visibility_key(provider_id: Any, model_id: Any) -> str:
    """Provider-qualified switch key: ``provider:model``, or the bare model id."""
    model = str(model_id or "").strip()
    if not model:
        return ""
    provider = str(provider_id or "").strip().lower()
    return f"{provider}:{model}" if provider else model


def _model_variants(model_id: Any) -> Set[str]:
    """All identities a single catalog model can be checked under.

    ``@provider:model`` is a picker-qualified id; provider calls use the part
    after the prefix. ``provider/model`` appears in some aggregated catalogs.
    """
    raw = str(model_id or "").strip()
    if not raw:
        return set()
    variants = {raw}
    if raw.startswith("@") and ":" in raw:
        stripped = raw.split(":", 1)[1].strip()
        if stripped:
            variants.add(stripped)
    if "/" in raw:
        stripped = raw.rsplit("/", 1)[-1].strip()
        if stripped:
            variants.add(stripped)
    return variants


def _normalise_disabled(entries: Iterable[Any]) -> Set[str]:
    keys: Set[str] = set()
    for entry in entries:
        key = str(entry or "").strip()
        if key:
            keys.add(key)
    return keys


def _read_state(path: Path) -> Set[str]:
    try:
        if not path.exists():
            return set()
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Failed to read %s, treating all models as enabled", path, exc_info=True)
        return set()
    if isinstance(data, list):
        return _normalise_disabled(data)
    if isinstance(data, dict):
        return _normalise_disabled(data.get("disabled_models") or [])
    return set()


def load_disabled_models(reload: bool = False) -> Set[str]:
    """Read the mirrored disabled-model set, tolerating a missing state file."""
    global _CACHED_STAMP, _CACHED_DISABLED
    path = get_model_visibility_path()
    try:
        stat = path.stat()
        stamp: Optional[Tuple[int, int]] = (stat.st_mtime_ns, stat.st_size)
    except OSError:
        stamp = None
    with _STATE_LOCK:
        if not reload and stamp is not None and stamp == _CACHED_STAMP:
            return set(_CACHED_DISABLED)
        disabled = _read_state(path)
        _CACHED_STAMP = stamp
        _CACHED_DISABLED = set(disabled)
        return set(disabled)


def save_disabled_models(models: Iterable[Any]) -> Set[str]:
    """Persist the disabled-model set atomically and return the stored copy."""
    global _CACHED_STAMP, _CACHED_DISABLED
    disabled = _normalise_disabled(models)
    path = get_model_visibility_path()
    with _STATE_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(f".tmp.{os.getpid()}.{threading.current_thread().ident}")
        tmp_path.write_text(
            json.dumps({"disabled_models": sorted(disabled)}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        os.replace(str(tmp_path), str(path))
        try:
            stat = path.stat()
            _CACHED_STAMP = (stat.st_mtime_ns, stat.st_size)
        except OSError:
            _CACHED_STAMP = None
        _CACHED_DISABLED = set(disabled)
    return set(disabled)


def is_model_disabled(
    disabled: Iterable[str],
    provider_id: Any,
    model_id: Any,
) -> bool:
    """True when the model is switched off for this provider (or any provider)."""
    variants = _model_variants(model_id)
    if not variants:
        return False
    provider = str(provider_id or "").strip().lower()
    disabled_set = {str(entry or "").strip() for entry in disabled}
    disabled_set.discard("")

    if provider:
        prefix = f"{provider}:"
        for key in disabled_set:
            if key.startswith(prefix) and key[len(prefix):] in variants:
                return True
        return bool(variants & disabled_set)
    if variants & disabled_set:
        return True
    for key in disabled_set:
        if ":" in key and key.split(":", 1)[1] in variants:
            return True
    return False


def filter_model_groups(
    groups: Iterable[Dict[str, Any]],
    disabled: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    """Drop disabled models from a provider-grouped catalog, pruning empty groups."""
    disabled_set = set(disabled if disabled is not None else load_disabled_models())
    filtered: List[Dict[str, Any]] = []
    for group in groups or []:
        provider_id = group.get("provider_id") or group.get("provider") or ""
        models = [
            model for model in (group.get("models") or [])
            if isinstance(model, dict)
            and not is_model_disabled(disabled_set, provider_id, model.get("id"))
        ]
        if models:
            filtered.append({**group, "models": models})
    return filtered


def filter_fallback_chain(
    chain: Any,
    disabled: Optional[Iterable[str]] = None,
) -> Any:
    """Drop disabled entries from a fallback chain, preserving its input shape.

    ``chain`` may be the legacy single dict or the current list format. A single
    dict resolves to ``None`` when switched off; a list resolves to an empty
    list. Entries without a model are kept untouched so callers still validate
    their own configuration.
    """
    if not chain:
        return chain
    disabled_set = set(disabled if disabled is not None else load_disabled_models())
    entries = chain if isinstance(chain, list) else [chain]
    kept = [
        entry for entry in entries
        if not (
            isinstance(entry, dict)
            and str(entry.get("model") or "").strip()
            and is_model_disabled(disabled_set, entry.get("provider"), entry.get("model"))
        )
    ]
    if isinstance(chain, list):
        return kept
    return kept[0] if kept else None
