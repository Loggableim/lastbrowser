"""Version-2 agent browser contracts.

Operations stay out of the model registry until Main execution and tests exist.
Digest bytes match the desktop canonical JSON helper.
"""
from __future__ import annotations

import re
from typing import Any

from .contracts import digest_json

SCHEMA_VERSION = 2
SNAPSHOT_TTL_MS = 30_000
MAX_ELEMENTS = 300
MAX_FRAMES = 100
MAX_TEXT_BYTES = 256 * 1024
MAX_NAME_CHARS = 256
EXPECTATIONS = {"navigation", "element_visible", "element_hidden", "dialog_open", "text_changed"}
OPAQUE_ID = re.compile(r"^[A-Za-z0-9_-]{8,80}$")


class AgentContractError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def capabilities() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "enabled": False,
        "operations": [],
        "frames": {
            "sameOrigin": False,
            "crossOrigin": False,
            "openShadow": False,
            "closedShadow": "closed_shadow_unsupported",
        },
        "limits": {
            "snapshotTtlMs": SNAPSHOT_TTL_MS,
            "maxElements": MAX_ELEMENTS,
            "maxFrames": MAX_FRAMES,
            "maxTextBytes": MAX_TEXT_BYTES,
            "maxNameChars": MAX_NAME_CHARS,
        },
    }


def agent_action_digest(action: dict[str, Any]) -> str:
    return digest_json(validate_action(action))


def redact_action_for_trace(action: dict[str, Any]) -> dict[str, Any]:
    validated = validate_action(action)
    if validated["kind"] != "agent_browser_fill":
        return validated
    redacted = dict(validated)
    redacted["text"] = ""
    return redacted


def validate_action(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AgentContractError("invalid_action")
    if value.get("schemaVersion") != SCHEMA_VERSION or isinstance(value.get("schemaVersion"), bool):
        raise AgentContractError("unsupported_version")
    kind = value.get("kind")
    if kind == "agent_browser_observe":
        _exact(value, {"schemaVersion", "kind", "includeElements", "includeFrames", "includeScreenshot"})
        for key in ("includeElements", "includeFrames", "includeScreenshot"):
            if type(value[key]) is not bool:
                raise AgentContractError("invalid_flag")
        return value
    if kind == "agent_browser_click":
        _exact(value, {"schemaVersion", "kind", "snapshotId", "elementRef", "expectation"})
        _opaque(value.get("snapshotId"), "invalid_snapshot")
        _opaque(value.get("elementRef"), "invalid_element")
        if "expectation" in value:
            _expectation(value["expectation"])
        return value
    if kind == "agent_browser_fill":
        _exact(value, {"schemaVersion", "kind", "snapshotId", "elementRef", "text", "clear"})
        _opaque(value.get("snapshotId"), "invalid_snapshot")
        _opaque(value.get("elementRef"), "invalid_element")
        text = value.get("text")
        if not isinstance(text, str) or isinstance(text, bool) or len(text) > 8192:
            raise AgentContractError("invalid_text")
        if type(value.get("clear")) is not bool:
            raise AgentContractError("invalid_flag")
        return value
    raise AgentContractError("unknown_operation")


def _exact(value: dict[str, Any], allowed: set[str]) -> None:
    unknown = set(value) - allowed
    if unknown:
        raise AgentContractError("unknown_field")


def _opaque(value: Any, code: str) -> None:
    if not isinstance(value, str) or OPAQUE_ID.fullmatch(value) is None:
        raise AgentContractError(code)


def _expectation(value: Any) -> None:
    if not isinstance(value, dict) or set(value) != {"kind"} or value.get("kind") not in EXPECTATIONS:
        raise AgentContractError("invalid_expectation")

