"""Official OpenRouter routers for the Chat and Quickchat pickers.

Only ``openrouter/free`` and ``openrouter/auto`` are added. Individual
``:free`` model ids stay on their existing curated path. The routers are
appended, so a paid model already first in a configured catalog remains
first. An unconfigured OpenRouter group exposes the two routers and does
not gain the rest of that catalog.
"""
from __future__ import annotations

# Context lengths published by OpenRouter for these router ids.
ROUTERS = (
    ("openrouter/free", "OpenRouter free router", 200_000),
    ("openrouter/auto", "OpenRouter auto router", 2_000_000),
)
ROUTER_IDS = {model_id for model_id, _label, _context in ROUTERS}


def _router_fields(model_id: str, label: str, context: int) -> dict:
    return {
        "id": model_id,
        "label": label,
        "context_length": context,
        "context_length_source": "official_model_docs",
        "contextLength": context,
        "contextLengthSource": "official_model_docs",
        "modelSource": "explicit_config",
        "supportsIndependent": True,
    }


def ensure_openrouter_routers(catalog: dict) -> dict:
    """Make both official routers selectable without reordering other models."""
    if not isinstance(catalog, dict):
        return catalog
    groups = catalog.get("groups")
    if not isinstance(groups, list):
        return catalog
    group = next((row for row in groups if isinstance(row, dict) and row.get("provider_id") == "openrouter"), None)
    if group is None:
        group = {"provider_id": "openrouter", "provider": "OpenRouter", "configured": True, "models": []}
        groups.append(group)
    models = group.get("models")
    if not isinstance(models, list):
        models = []
        group["models"] = models
    # configured is False only after the scoped catalog decides the provider
    # has no key. Those sibling rows were not selectable; do not enable them
    # by turning the group on for the routers.
    if group.get("configured") is False:
        models[:] = [row for row in models if isinstance(row, dict) and row.get("id") in ROUTER_IDS]
    group["configured"] = True
    for model_id, label, context in ROUTERS:
        fields = _router_fields(model_id, label, context)
        existing = next((row for row in models if isinstance(row, dict) and row.get("id") == model_id), None)
        if existing is None:
            models.append(fields)
            continue
        existing.update(fields)
    return catalog
