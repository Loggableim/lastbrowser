"""Host-issued, single-use approvals for Computer Use mutations.

Approval records bind one mutation to its action, target, captured UI snapshot,
host run, and complete normalized parameters. Tokens are opaque capabilities;
model-provided identifiers never create or broaden an approval.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import logging
import math
import re
import secrets
import threading
import time
from collections.abc import Mapping
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

_EXCLUDED_APPROVAL_FIELDS = frozenset({"approval_id", "approval_token", "run_id", "host_run_id"})


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def action_parameters_fingerprint(action: str, parameters: Mapping[str, Any]) -> str:
    """Hash all effectful normalized parameters, excluding capability/run fields.

    Callers must normalize aliases and defaults before computing the digest and
    must use the same normalized mapping when issuing and consuming approval.
    """
    if not isinstance(parameters, Mapping):
        raise TypeError("approval parameters must be a mapping")
    clean_action = _required_text(action, "action").lower()
    clean_parameters = {
        str(key): value
        for key, value in parameters.items()
        if str(key).lower() not in _EXCLUDED_APPROVAL_FIELDS
    }
    payload = {"action": clean_action, "parameters": clean_parameters}
    return hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()


def compute_action_target_fingerprint(action: str, args: Dict[str, Any]) -> str:
    """Build a stable target string for legacy call sites.

    The complete parameter digest is separately mandatory; this target narrows
    the approval to the UI element or physical-input target being mutated.
    """
    normalized_action = str(action or "").strip().lower()
    if normalized_action == "physical_input":
        actions = args.get("actions")
        return hashlib.sha256(_canonical(actions).encode("utf-8")).hexdigest()
    if normalized_action in {"invoke", "set_value"}:
        element = args.get("element_ref", args.get("element"))
        return _canonical({"element": element}) if element is not None else ""
    if normalized_action in {"click", "double_click", "right_click", "middle_click"}:
        element = args.get("element")
        coordinate = args.get("coordinate")
        return _canonical({"element": element, "coordinate": coordinate}) if element is not None or coordinate is not None else ""
    return ""


def classify_computer_use_escape(action: str, args: Mapping[str, Any]) -> str | None:
    """Reject obvious shell/DevTools escape payloads in computer-use mutations.

    This is a conservative tripwire for known escape routes, not a universal
    content-safety proof. Exact per-action approval and OS-level isolation are
    still required; arbitrary UI text cannot be classified perfectly.
    """
    action_name = str(action or "").strip().lower()
    if action_name in {"navigate", "open_url", "browser_navigate"}:
        url = str(args.get("url") or args.get("target") or "").lstrip().lower()
        if url.startswith(("javascript:", "data:text/html")):
            return "script-capable URL schemes are blocked"

    texts: list[str] = []
    keys: list[str] = []
    if isinstance(args.get("text"), str):
        texts.append(args["text"])
    if isinstance(args.get("value"), str):
        texts.append(args["value"])
    if isinstance(args.get("key"), str):
        keys.append(args["key"].strip().lower())
    if isinstance(args.get("keys"), str):
        keys.append(args["keys"].strip().lower())
    actions = args.get("actions")
    if isinstance(actions, (list, tuple)):
        for step in actions:
            if not isinstance(step, Mapping):
                continue
            if isinstance(step.get("text"), str):
                texts.append(step["text"])
            if isinstance(step.get("key"), str):
                keys.append(step["key"].strip().lower())
            if isinstance(step.get("keys"), str):
                keys.append(step["keys"].strip().lower())
            if isinstance(step.get("keys"), str):
                keys.append(step["keys"].strip().lower())
            if isinstance(step.get("keys"), (list, tuple)):
                keys.extend(str(key).strip().lower() for key in step["keys"])

    devtools_chords = {
        "f12", "ctrl+shift+i", "control+shift+i", "ctrl+shift+j", "control+shift+j",
        "ctrl+shift+c", "control+shift+c", "cmd+option+i", "command+option+i",
        "cmd+option+j", "command+option+j",
    }
    shell_chords = {"win+r", "windows+r", "meta+r", "ctrl+alt+t", "control+alt+t", "alt+f2"}
    normalized_keys = {key.replace(" ", "") for key in keys}
    if normalized_keys & devtools_chords:
        return "developer-tools keyboard shortcuts are blocked"
    if normalized_keys & shell_chords:
        return "operating-system command-launch shortcuts are blocked"

    # Catch command-launch sequences and common direct shell invocations while
    # leaving ordinary UI typing available. This intentionally is not a general
    # shell parser and should not be described as one.
    shell_patterns = (
        r"(?:^|[\s;&|])(?:powershell(?:\.exe)?|pwsh|cmd(?:\.exe)?|wscript|cscript)(?:\s|$)",
        r"(?:^|[\s;&|])(?:bash|sh|zsh|fish)(?:\s+-[a-z]+)?\s+-c(?:\s|$)",
        r"(?:^|[\s;&|])(?:curl|wget)\b[^\r\n]{0,300}\|\s*(?:sh|bash|zsh)\b",
        r"(?:^|[\s;&|])(?:rundll32|regsvr32|mshta|certutil)(?:\.exe)?\b",
    )
    for text in texts:
        normalized = text.strip().lower()
        if any(re.search(pattern, normalized, flags=re.IGNORECASE) for pattern in shell_patterns):
            return "obvious shell-launch text is blocked"
    return None


def classify_desktop_automation_bypass(tool_name: str, args: Mapping[str, Any]) -> str | None:
    """Tripwire for direct desktop input through alternative tool transports.

    This does not sandbox arbitrary programs. It catches explicit known native
    input/UIA and CDP input commands so they cannot silently bypass the approval
    path by changing the tool name.
    """
    if tool_name == "browser_cdp":
        method = str(args.get("method") or "")
        if method.startswith("Input."):
            return "raw CDP input requires the approved computer-use path"
        if method in {"Runtime.evaluate", "Runtime.callFunctionOn"}:
            return "raw CDP script execution cannot bypass desktop approval"
    if tool_name not in {"terminal", "execute_code", "browser_cdp"}:
        return None
    payload = _canonical(args)
    patterns = (
        r"\b(?:SendInput|mouse_event|keybd_event|PostMessage[AW]?|SendMessage[AW]?)\s*\(",
        r"\b(?:pyautogui|pywinauto)\s*\.",
        r"\buiautomation\s*\.",
        r"\bAutomationElement\s*\.\s*From(?:Handle|Point)",
        r"\bInput\.(?:dispatchMouseEvent|dispatchKeyEvent|insertText|synthesize\w+)",
    )
    if any(re.search(pattern, payload, re.IGNORECASE) for pattern in patterns):
        return "direct desktop automation through an alternative tool is blocked"
    return None


def _required_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"approval {label} binding is required")
    return value.strip()


@dataclasses.dataclass
class ApprovalToken:
    token_digest: str
    action: str
    target: str
    snapshot_id: str
    run_id: str
    parameters_fingerprint: str
    created_at: float
    expires_at: float
    consumed: bool = False
    consumed_at: Optional[float] = None


class ApprovalRegistry:
    """Thread-safe token registry with required exact bindings and one use."""

    def __init__(self, default_ttl_seconds: float = 60.0, max_entries: int = 200) -> None:
        self._lock = threading.Lock()
        self._tokens: Dict[str, ApprovalToken] = {}
        self._default_ttl = default_ttl_seconds
        self._max_entries = max_entries

    @staticmethod
    def _token_digest(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _purge_expired_locked(self, now: float) -> None:
        expired_keys = [
            key for key, record in self._tokens.items()
            if now > record.expires_at or (record.consumed and now - (record.consumed_at or now) > 300)
        ]
        for key in expired_keys:
            del self._tokens[key]
        if len(self._tokens) > self._max_entries:
            ordered = sorted(self._tokens.items(), key=lambda item: item[1].created_at)
            for key, _ in ordered[: len(self._tokens) - self._max_entries]:
                del self._tokens[key]

    def issue_token(
        self,
        action: str,
        target: str = "",
        snapshot_id: str = "",
        run_id: str = "",
        ttl_seconds: Optional[float] = None,
        parameters_fingerprint: str = "",
    ) -> str:
        """Issue a token only when every binding is explicitly supplied."""
        clean_action = _required_text(action, "action").lower()
        clean_target = _required_text(target, "target")
        clean_snapshot = _required_text(snapshot_id, "snapshot_id")
        clean_run = _required_text(run_id, "run_id")
        clean_fingerprint = _required_text(parameters_fingerprint, "parameters_fingerprint")
        ttl = self._default_ttl if ttl_seconds is None else float(ttl_seconds)
        if not math.isfinite(ttl) or ttl <= 0 or ttl > 300:
            raise ValueError("approval ttl must be finite, positive, and at most 300 seconds")
        now = time.monotonic()
        token = f"appr_{secrets.token_urlsafe(24)}"
        digest = self._token_digest(token)
        record = ApprovalToken(
            token_digest=digest,
            action=clean_action,
            target=clean_target,
            snapshot_id=clean_snapshot,
            run_id=clean_run,
            parameters_fingerprint=clean_fingerprint,
            created_at=now,
            expires_at=now + ttl,
        )
        with self._lock:
            self._purge_expired_locked(now)
            self._tokens[digest] = record
        return token

    def validate_and_consume(
        self,
        token: Optional[str],
        action: str,
        target: str = "",
        snapshot_id: str = "",
        run_id: str = "",
        parameters_fingerprint: str = "",
    ) -> Tuple[bool, str]:
        """Validate exact bindings and consume atomically on success."""
        if not isinstance(token, str) or not token.strip():
            return False, "Approval token is required."
        try:
            bindings = (
                _required_text(action, "action").lower(),
                _required_text(target, "target"),
                _required_text(snapshot_id, "snapshot_id"),
                _required_text(run_id, "run_id"),
                _required_text(parameters_fingerprint, "parameters_fingerprint"),
            )
        except ValueError as exc:
            return False, str(exc)

        now = time.monotonic()
        digest = self._token_digest(token.strip())
        with self._lock:
            self._purge_expired_locked(now)
            record = self._tokens.get(digest)
            if record is None:
                return False, "Invalid, expired, or unissued approval token."
            if record.consumed:
                return False, "Approval token has already been consumed."
            if now > record.expires_at:
                return False, "Approval token expired."
            issued = (record.action, record.target, record.snapshot_id, record.run_id, record.parameters_fingerprint)
            if issued != bindings:
                return False, "Approval binding mismatch."
            record.consumed = True
            record.consumed_at = now
            return True, "Approval verified."

    def revoke(self, token: str) -> bool:
        if not isinstance(token, str) or not token:
            return False
        with self._lock:
            return self._tokens.pop(self._token_digest(token), None) is not None

    def clear(self) -> None:
        with self._lock:
            self._tokens.clear()


default_approval_registry = ApprovalRegistry()
