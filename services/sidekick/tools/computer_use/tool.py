"""Entry point for the `computer_use` tool.

Universal (any-model) macOS desktop control via cua-driver's background
computer-use primitive. Replaces #4562's Anthropic-native `computer_20251124`
approach — the schema here is standard OpenAI function-calling so every
tool-capable model can drive it.

Return contract
---------------
For text-only results (wait, key, list_apps, focus_app, failures, etc.):
  JSON string.

For captures / actions with `capture_after=True`:
  A dict wrapped as the OpenAI-style multi-part tool-message content:

      {
        "_multimodal": True,
        "content": [
            {"type": "text", "text": "<human-readable summary + SOM index>"},
            {"type": "image_url",
             "image_url": {"url": "data:image/png;base64,<b64>"}},
        ],
        "text_summary": "<text used for fallback string content>",
      }

  run_agent.py's tool-message builder inspects `_multimodal` and emits a
  list-shaped `content` for OpenAI-compatible providers. The Anthropic
  adapter splices the base64 image into a `tool_result` block (see
  `agent/anthropic_adapter.py`). Every provider that supports multi-part
  tool content gets the image; text-only providers see the summary only.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import threading
from typing import Any, Dict, List, Optional, Tuple

from tools.computer_use.backend import (
    ActionResult,
    CaptureResult,
    ComputerUseBackend,
    UIElement,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Approval & safety
# ---------------------------------------------------------------------------

_approval_callback = None


def set_approval_callback(cb) -> None:
    """Register a callback for computer_use approval prompts (used by CLI).

    Matches the terminal_tool._approval_callback pattern. The callback
    receives (action, args, summary) and returns one of:
      "approve_once" | "approve_session" | "always_approve" | "deny".
    """
    global _approval_callback
    _approval_callback = cb


from tools.computer_use.approval import (
    action_parameters_fingerprint,
    classify_computer_use_escape,
    compute_action_target_fingerprint,
    default_approval_registry,
)

# Actions that read or control safely, not mutate.
_SAFE_ACTIONS = frozenset({"capture", "wait", "list_apps", "emergency_stop"})

# Actions that mutate user-visible state. Go through approval.
_DESTRUCTIVE_ACTIONS = frozenset({
    "click", "double_click", "right_click", "middle_click",
    "drag", "scroll", "type", "key", "set_value", "focus_app",
    "invoke", "physical_input",
})

# Hard-blocked key combinations. Mirrored from #4562 — these are destructive
# regardless of approval level (e.g. logout kills the session Sidekick runs in).
_BLOCKED_KEY_COMBOS = {
    frozenset({"cmd", "shift", "backspace"}),   # empty trash
    frozenset({"cmd", "option", "backspace"}),   # force delete
    frozenset({"cmd", "ctrl", "q"}),             # lock screen
    frozenset({"cmd", "shift", "q"}),            # log out
    frozenset({"cmd", "option", "shift", "q"}),  # force log out
}

_KEY_ALIASES = {"command": "cmd", "control": "ctrl", "alt": "option", "⌘": "cmd", "⌥": "option"}


def _canon_key_combo(keys: str) -> frozenset:
    parts = [p.strip().lower() for p in re.split(r"\s*\+\s*", keys) if p.strip()]
    parts = [_KEY_ALIASES.get(p, p) for p in parts]
    return frozenset(parts)


# Dangerous text patterns for the `type` action.
_BLOCKED_TYPE_PATTERNS = [
    re.compile(r"curl\s+[^|]*\|\s*bash", re.IGNORECASE),
    re.compile(r"curl\s+[^|]*\|\s*sh", re.IGNORECASE),
    re.compile(r"wget\s+[^|]*\|\s*bash", re.IGNORECASE),
    re.compile(r"\bsudo\s+rm\s+-[rf]", re.IGNORECASE),
    re.compile(r"\brm\s+-rf\s+/\s*$", re.IGNORECASE),
    re.compile(r":\s*\(\)\s*\{\s*:\|:\s*&\s*\}", re.IGNORECASE),  # fork bomb
    # Windows evasion and destructive command bypass patterns:
    re.compile(r"powershell(\.exe)?\s+.*-(enc|encodedcommand)\b", re.IGNORECASE),
    re.compile(r"cmd(\.exe)?\s+/c\s+.*format\s+[a-z]:", re.IGNORECASE),
    re.compile(r"del\s+/[sfq]\s+c:\\windows", re.IGNORECASE),
    re.compile(r"rd\s+/[sq]\s+c:\\", re.IGNORECASE),
    re.compile(r"reg\s+delete\s+hklm", re.IGNORECASE),
]


def _is_blocked_type(text: str) -> Optional[str]:
    for pat in _BLOCKED_TYPE_PATTERNS:
        if pat.search(text):
            return pat.pattern
    return None


# ---------------------------------------------------------------------------
# Backend selection — env-swappable for tests
# ---------------------------------------------------------------------------

# Per-process cached backend; lazily instantiated on first call.
_backend_lock = threading.Lock()
_backend: Optional[ComputerUseBackend] = None
# Session-scoped approval state.
_session_auto_approve = False
_always_allow: set = set()  # action names the user unlocked for the session


def _get_backend() -> ComputerUseBackend:
    global _backend
    with _backend_lock:
        if _backend is None:
            backend_name = (os.environ.get("SIDEKICK_COMPUTER_USE_BACKEND", "")).lower()
            if backend_name in {"windows", "uia", "win32"} or (backend_name == "" and sys.platform == "win32"):
                from tools.computer_use.windows_backend import WindowsUiaBackend
                _backend = WindowsUiaBackend()
            elif backend_name in {"cua", "cua-driver"} or (backend_name == "" and sys.platform == "darwin"):
                from tools.computer_use.cua_backend import CuaDriverBackend
                _backend = CuaDriverBackend()
            elif backend_name == "noop":  # pragma: no cover
                _backend = _NoopBackend()
            else:
                raise RuntimeError(f"Unknown or unsupported SIDEKICK_COMPUTER_USE_BACKEND={backend_name!r} on {sys.platform}")
            _backend.start()
        return _backend


def reset_backend_for_tests() -> None:  # pragma: no cover
    """Test helper — tear down the cached backend."""
    global _backend, _session_auto_approve, _always_allow
    with _backend_lock:
        if _backend is not None:
            try:
                _backend.stop()
            except Exception:
                pass
        _backend = None
    _session_auto_approve = False
    _always_allow = set()


class _NoopBackend(ComputerUseBackend):  # pragma: no cover
    """Test/CI stub. Records calls; returns trivial results."""

    def __init__(self) -> None:
        self.calls: List[Tuple[str, Dict[str, Any]]] = []
        self._started = False

    def start(self) -> None: self._started = True
    def stop(self) -> None: self._started = False
    def is_available(self) -> bool: return True

    def capture(self, mode: str = "som", app: Optional[str] = None) -> CaptureResult:
        self.calls.append(("capture", {"mode": mode, "app": app}))
        return CaptureResult(mode=mode, width=1024, height=768, png_b64=None,
                             elements=[], app=app or "", window_title="")

    def click(self, **kw) -> ActionResult:
        self.calls.append(("click", kw))
        return ActionResult(ok=True, action="click")

    def drag(self, **kw) -> ActionResult:
        self.calls.append(("drag", kw))
        return ActionResult(ok=True, action="drag")

    def scroll(self, **kw) -> ActionResult:
        self.calls.append(("scroll", kw))
        return ActionResult(ok=True, action="scroll")

    def type_text(self, text: str) -> ActionResult:
        self.calls.append(("type", {"text": text}))
        return ActionResult(ok=True, action="type")

    def key(self, keys: str) -> ActionResult:
        self.calls.append(("key", {"keys": keys}))
        return ActionResult(ok=True, action="key")

    def list_apps(self) -> List[Dict[str, Any]]:
        self.calls.append(("list_apps", {}))
        return []

    def focus_app(self, app: str, raise_window: bool = False) -> ActionResult:
        self.calls.append(("focus_app", {"app": app, "raise": raise_window}))
        return ActionResult(ok=True, action="focus_app")


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def handle_computer_use(args: Dict[str, Any], **kwargs) -> Any:
    """Main entry point — dispatched by tools.registry.

    Returns either a JSON string (text-only) or a dict marked `_multimodal`
    (image + summary) which run_agent.py wraps into the tool message.
    """
    args = dict(args)
    args.pop("approval_id", None)
    args.pop("run_id", None)
    action = (args.get("action") or "").strip().lower()
    if not action:
        return json.dumps({"error": "missing `action`"})
    escape = classify_computer_use_escape(action, args)
    if escape:
        return json.dumps({"error": f"blocked: {escape}"})

    # Safety: validate actions before approval prompt.
    text_inputs = [args.get("text", "")] if action == "type" else [args.get("value", "")] if action == "set_value" else []
    if action == "physical_input":
        steps = args.get("actions", [])
        if not isinstance(steps, list) or any(not isinstance(step, dict) for step in steps):
            return json.dumps({"error": "physical_input actions must be objects"})
        text_inputs.extend(step.get("text", "") for step in steps if step.get("type") == "type")
    for text in text_inputs:
        if not isinstance(text, str):
            return json.dumps({"error": "input text must be a string"})
        pat = _is_blocked_type(text)
        if pat:
            return json.dumps({
                "error": f"blocked pattern in type text: {pat!r}",
                "hint": "Dangerous shell patterns cannot be typed via computer_use.",
            })

    key_inputs = [args.get("keys", "")] if action == "key" else []
    if action == "physical_input":
        key_inputs.extend(step.get("keys", "") for step in steps if step.get("type") == "key")
    for keys in key_inputs:
        combo = _canon_key_combo(keys)
        for blocked in _BLOCKED_KEY_COMBOS:
            if blocked.issubset(combo) and len(blocked) <= len(combo):
                return json.dumps({
                    "error": f"blocked key combo: {sorted(blocked)}",
                    "hint": "Destructive system shortcuts are hard-blocked.",
                })

    # Approval gate (destructive actions only).
    if action in _DESTRUCTIVE_ACTIONS:
        run_id = str(kwargs.get("task_id") or "")
        if not run_id:
            return json.dumps({"error": "trusted host task context required", "action": action})
        try:
            err = _request_approval(action, args, run_id)
        except (TypeError, ValueError) as exc:
            return json.dumps({"error": f"approval binding rejected: {exc}"})
        if err is not None:
            return err

    # Dispatch to backend.
    try:
        backend = _get_backend()
    except Exception as e:
        return json.dumps({
            "error": f"computer_use backend unavailable: {e}",
            "hint": "Run `sidekick tools` and enable Computer Use to install cua-driver.",
        })

    try:
        return _dispatch(backend, action, args, run_id=str(kwargs.get("task_id") or ""))
    except Exception as e:
        logger.exception("computer_use %s failed", action)
        return json.dumps({"error": f"{action} failed: {e}"})


def _issue_approval_token_if_needed(action: str, args: Dict[str, Any], run_id: str) -> None:
    if action == "physical_input" or not args.get("approval_id"):
        parameters = _approval_parameters(action, args)
        target_fp = compute_action_target_fingerprint(action, parameters) or action_parameters_fingerprint(action, parameters)
        token = default_approval_registry.issue_token(
            action=action,
            target=target_fp,
            snapshot_id=str(args.get("snapshot_id") or ("" if sys.platform == "win32" else "legacy-host-context")),
            run_id=run_id,
            parameters_fingerprint=action_parameters_fingerprint(action, parameters),
            ttl_seconds=60.0,
        )
        args["approval_id"] = token


def _approval_parameters(action: str, args: Dict[str, Any]) -> Dict[str, Any]:
    element = args.get("element") if args.get("element") is not None else args.get("element_ref")
    if isinstance(element, str):
        element = element.strip()
        if element.startswith("@e"):
            element = element[2:]
        elif element.startswith("#"):
            element = element[1:]
        element = int(element)
    snapshot = args.get("snapshot_id")
    if action == "invoke":
        return {"element_ref": element, "snapshot_id": snapshot}
    if action == "set_value":
        return {"element_ref": element, "value": str(args.get("value", "")), "snapshot_id": snapshot}
    if action == "physical_input":
        return {"actions": args.get("actions", []), "snapshot_id": snapshot}
    if action == "scroll":
        return {"element_ref": element, "direction": args.get("direction", "down"), "amount": int(args.get("amount", 3)), "snapshot_id": snapshot}
    return {key: value for key, value in args.items() if key not in {"approval_id", "run_id"}}


def _request_approval(action: str, args: Dict[str, Any], run_id: str) -> Optional[str]:
    """Return None if approved, or a JSON error string if denied."""
    cb = _approval_callback
    if cb is None:
        return json.dumps({"error": "host approval callback unavailable; action denied", "action": action})
    summary = (
        f"{_summarize_action(action, args)}; host task={run_id}; "
        f"parameters={json.dumps(_approval_parameters(action, args), ensure_ascii=False, sort_keys=True)}"
    )
    try:
        verdict = cb(action, dict(args), summary)
    except Exception as e:
        logger.warning("approval callback failed: %s", e)
        verdict = "deny"
    if verdict in {"approve_once", "approve_session", "always_approve"}:
        # Broader verdicts authorize this concrete request only, never other runs.
        _issue_approval_token_if_needed(action, args, run_id)
        return None
    return json.dumps({"error": "denied by user", "action": action})


def _summarize_action(action: str, args: Dict[str, Any]) -> str:
    if action == "invoke":
        elem = args.get("element") if args.get("element") is not None else args.get("element_ref")
        return f"invoke element #{elem}"
    if action == "physical_input":
        step_count = len(args.get("actions", []))
        return f"physical input ({step_count} step(s))"
    if action == "emergency_stop":
        return "emergency stop (halt all agent inputs)"
    if action in {"click", "double_click", "right_click", "middle_click"}:
        if args.get("element") is not None:
            return f"{action} element #{args['element']}"
        coord = args.get("coordinate")
        if coord:
            return f"{action} at {tuple(coord)}"
        return action
    if action == "drag":
        src = args.get("from_element") or args.get("from_coordinate")
        dst = args.get("to_element") or args.get("to_coordinate")
        return f"drag {src} → {dst}"
    if action == "scroll":
        return f"scroll {args.get('direction', '?')} x{args.get('amount', 3)}"
    if action == "type":
        text = args.get("text", "")
        return f"type {text[:60]!r}" + ("..." if len(text) > 60 else "")
    if action == "key":
        return f"key {args.get('keys', '')!r}"
    if action == "focus_app":
        return f"focus {args.get('app', '')!r}" + (" (raise)" if args.get("raise_window") else "")
    return action


def _dispatch(backend: ComputerUseBackend, action: str, args: Dict[str, Any], run_id: str = "") -> Any:
    capture_after = bool(args.get("capture_after"))
    windows = bool(getattr(backend, "requires_snapshot_approval", False))
    if action in _DESTRUCTIVE_ACTIONS and not (windows and action in {"invoke", "set_value", "physical_input", "scroll"}):
        parameters = _approval_parameters(action, args)
        ok, reason = default_approval_registry.validate_and_consume(
            token=args.get("approval_id"), action=action,
            target=compute_action_target_fingerprint(action, parameters) or action_parameters_fingerprint(action, parameters),
            snapshot_id=str(args.get("snapshot_id") or "legacy-host-context"), run_id=run_id,
            parameters_fingerprint=action_parameters_fingerprint(action, parameters),
        )
        if not ok:
            return json.dumps({"error": reason, "action": action})

    if action == "capture":
        mode = str(args.get("mode", "som"))
        if mode not in {"som", "vision", "ax"}:
            return json.dumps({"error": f"bad mode {mode!r}; use som|vision|ax"})
        cap = backend.capture(mode=mode, app=args.get("app"))
        return _capture_response(cap)

    if action == "wait":
        seconds = float(args.get("seconds", 1.0))
        res = backend.wait(seconds)
        return _text_response(res)

    if action == "list_apps":
        apps = backend.list_apps()
        return json.dumps({"apps": apps, "count": len(apps)})

    if action == "focus_app":
        app = args.get("app")
        if not app:
            return json.dumps({"error": "focus_app requires `app`"})
        res = backend.focus_app(app, raise_window=bool(args.get("raise_window")))
        return _maybe_follow_capture(backend, res, capture_after)

    if action in {"click", "double_click", "right_click", "middle_click"}:
        if windows:
            return json.dumps({"error": "Windows clicks require explicit invoke with snapshot_id or approved physical_input"})
        button = args.get("button")
        click_count = 1
        if action == "double_click":
            click_count = 2
        elif action == "right_click":
            button = "right"
        elif action == "middle_click":
            button = "middle"
        else:
            button = button or "left"
        element = args.get("element")
        coord = args.get("coordinate") or (None, None)
        x, y = (coord[0], coord[1]) if coord and coord[0] is not None else (None, None)
        res = backend.click(
            element=element if element is not None else None,
            x=x, y=y, button=button or "left", click_count=click_count,
            modifiers=args.get("modifiers"),
        )
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "drag":
        res = backend.drag(
            from_element=args.get("from_element"),
            to_element=args.get("to_element"),
            from_xy=tuple(args["from_coordinate"]) if args.get("from_coordinate") else None,
            to_xy=tuple(args["to_coordinate"]) if args.get("to_coordinate") else None,
            button=args.get("button", "left"),
            modifiers=args.get("modifiers"),
        )
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "scroll":
        coord = args.get("coordinate") or (None, None)
        extra = {"snapshot_id": args.get("snapshot_id"), "approval_id": args.get("approval_id", ""), "run_id": run_id} if windows else {}
        res = backend.scroll(
            direction=args.get("direction", "down"),
            amount=int(args.get("amount", 3)),
            element=args.get("element") if args.get("element") is not None else args.get("element_ref"),
            x=coord[0] if coord and coord[0] is not None else None,
            y=coord[1] if coord and coord[1] is not None else None,
            modifiers=args.get("modifiers"),
            **extra,
        )
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "type":
        res = backend.type_text(args.get("text", ""))
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "key":
        res = backend.key(args.get("keys", ""))
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "set_value":
        value = args.get("value")
        if value is None:
            return json.dumps({"error": "set_value requires `value`"})
        element = args.get("element") if args.get("element") is not None else args.get("element_ref")
        if windows:
            res = backend.set_value(element=element, value=str(value), snapshot_id=args.get("snapshot_id"), approval_id=args.get("approval_id", ""), run_id=run_id)
        else:
            res = backend.set_value(value=str(value), element=element)
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "invoke":
        element = args.get("element") if args.get("element") is not None else args.get("element_ref")
        if windows:
            res = backend.invoke(element, snapshot_id=args.get("snapshot_id"), approval_id=args.get("approval_id", ""), run_id=run_id)
        else:
            res = backend.click(element=element)
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "physical_input":
        if windows:
            res = backend.physical_input(
                actions=args.get("actions", []),
                snapshot_id=args.get("snapshot_id"),
                approval_id=args.get("approval_id", ""),
                run_id=run_id,
            )
        else:
            res = ActionResult(ok=False, action="physical_input", message="Backend does not support physical_input.")
        return _maybe_follow_capture(backend, res, capture_after)

    if action == "emergency_stop":
        if hasattr(backend, "emergency_stop"):
            res = backend.emergency_stop()
        else:
            res = ActionResult(ok=False, action="emergency_stop", message="Backend does not support emergency_stop.")
        return _text_response(res)

    return json.dumps({"error": f"unknown action {action!r}"})


# ---------------------------------------------------------------------------
# Response shaping
# ---------------------------------------------------------------------------

def _text_response(res: ActionResult) -> str:
    payload: Dict[str, Any] = {"ok": res.ok, "action": res.action}
    if res.message:
        payload["message"] = res.message
    if res.meta:
        payload["meta"] = res.meta
    return json.dumps(payload)


def _capture_response(cap: CaptureResult) -> Any:
    element_index = _format_elements(cap.elements)
    summary_lines = [
        f"snapshot_id={cap.snapshot_id} metadata={json.dumps(cap.meta, sort_keys=True)}",
        f"capture mode={cap.mode} {cap.width}x{cap.height}"
        + (f" app={cap.app}" if cap.app else "")
        + (f" window={cap.window_title!r}" if cap.window_title else ""),
        f"{len(cap.elements)} interactable element(s):",
    ]
    if element_index:
        summary_lines.extend(element_index)
    summary = "\n".join(summary_lines)

    if cap.png_b64 and cap.mode != "ax":
        # Detect actual image format from base64 magic bytes so the MIME type
        # matches what the data contains (cua-driver may return JPEG or PNG).
        # JPEG: base64 starts with /9j/   PNG: starts with iVBOR
        _b64_prefix = cap.png_b64[:8]
        _mime = "image/jpeg" if _b64_prefix.startswith("/9j/") else "image/png"
        return {
            "_multimodal": True,
            "content": [
                {"type": "text", "text": summary},
                {"type": "image_url",
                 "image_url": {"url": f"data:{_mime};base64,{cap.png_b64}"}},
            ],
            "text_summary": summary,
            "snapshot_id": cap.snapshot_id,
            "meta": {"mode": cap.mode, "width": cap.width, "height": cap.height,
                     "elements": len(cap.elements), "png_bytes": cap.png_bytes_len, **cap.meta},
        }
    # AX-only (or image missing): text path.
    return json.dumps({
        "mode": cap.mode,
        "snapshot_id": cap.snapshot_id,
        "meta": cap.meta,
        "width": cap.width,
        "height": cap.height,
        "app": cap.app,
        "window_title": cap.window_title,
        "elements": [_element_to_dict(e) for e in cap.elements],
        "summary": summary,
    })


def _maybe_follow_capture(
    backend: ComputerUseBackend, res: ActionResult, do_capture: bool,
) -> Any:
    if not do_capture:
        return _text_response(res)
    if not res.ok:
        return _text_response(res)
    try:
        cap = backend.capture(mode="som")
    except Exception as e:
        logger.warning("follow-up capture failed: %s", e)
        return _text_response(res)
    # Combine action summary with the capture.
    resp = _capture_response(cap)
    if isinstance(resp, dict) and resp.get("_multimodal"):
        prefix = f"[{res.action}] ok={res.ok}" + (f" — {res.message}" if res.message else "")
        resp["content"][0]["text"] = prefix + "\n\n" + resp["content"][0]["text"]
        resp["text_summary"] = prefix + "\n\n" + resp["text_summary"]
        return resp
    # Fallback: action + text capture merged.
    try:
        data = json.loads(resp)
    except (TypeError, json.JSONDecodeError):
        data = {"capture": resp}
    data["action"] = res.action
    data["ok"] = res.ok
    if res.message:
        data["message"] = res.message
    return json.dumps(data)


def _format_elements(elements: List[UIElement], max_lines: int = 40) -> List[str]:
    out: List[str] = []
    for e in elements[:max_lines]:
        label = e.label.replace("\n", " ")[:60]
        out.append(f"  #{e.index} {e.role} {label!r} @ {e.bounds}"
                   + (f" [{e.app}]" if e.app else "")
                   + (f" patterns={e.attributes['patterns']}" if "patterns" in e.attributes else ""))
    if len(elements) > max_lines:
        out.append(f"  ... +{len(elements) - max_lines} more (call capture with app= to narrow)")
    return out


def _element_to_dict(e: UIElement) -> Dict[str, Any]:
    return {
        "index": e.index,
        "role": e.role,
        "label": e.label,
        "bounds": list(e.bounds),
        "app": e.app,
        "pid": e.pid,
        "window_id": e.window_id,
        "attributes": e.attributes,
    }


# ---------------------------------------------------------------------------
# Availability check (used by the tool registry check_fn)
# ---------------------------------------------------------------------------

def check_computer_use_requirements() -> bool:
    """Return True iff computer_use can run on this host.

    Conditions:
      - Windows: Windows worker process launches, COM MTA initializes, and ping succeeds.
      - macOS: cua-driver binary installed (or override via env).
    """
    if sys.platform == "win32":
        try:
            from tools.computer_use.windows_backend import WindowsUiaBackend
            backend = WindowsUiaBackend()
            ok, msg = backend.check_availability_diagnostics()
            if not ok:
                logger.warning("Windows computer_use check failed: %s", msg)
            return ok
        except Exception as e:
            logger.warning("Windows computer_use check failed with exception: %s", e)
            return False
    elif sys.platform == "darwin":
        from tools.computer_use.cua_backend import cua_driver_binary_available
        return cua_driver_binary_available()
    return False


def get_computer_use_schema() -> Dict[str, Any]:
    from tools.computer_use.schema import COMPUTER_USE_SCHEMA
    return COMPUTER_USE_SCHEMA
