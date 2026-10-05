"""Fail-closed tool boundary for isolated independent workers.

Every effect is dispatched by the parent broker. Workers and models receive no
global CDP endpoint, bridge secret, provider environment from another profile,
or authority to select a target. A missing ContextVar is a denial, not fallback.
"""
from __future__ import annotations

import contextlib
import contextvars
import ctypes
import ipaddress
import json
import os
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator
from urllib.parse import urlsplit

from .contracts import Effect, PermissionScope, RunContext, canonical_json


class PolicyDenied(PermissionError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class ToolSpec:
    effect: Effect
    resource_kind: str


TOOL_SPECS = {
    "independent_browser_navigate": ToolSpec("read", "browser"),
    "independent_browser_read": ToolSpec("read", "browser"),
    "independent_browser_screenshot": ToolSpec("read", "browser"),
    "independent_browser_click": ToolSpec("write", "browser"),
    "independent_browser_type": ToolSpec("write", "browser"),
    "independent_file_read": ToolSpec("read", "file"),
    "independent_browser_extract": ToolSpec("read", "browser"),
    "independent_browser_vision": ToolSpec("read", "browser"),
    "independent_memory_recall": ToolSpec("read", "local_memory"),
}


@dataclass(frozen=True)
class ExecutionGuard:
    context: RunContext
    call_broker: Callable[[dict[str, Any]], dict[str, Any]]

    def invoke(self, name: str, args: dict[str, Any]) -> str:
        validate_tool(name, args)
        # A mutable active profile or a model argument cannot alter these IDs.
        reply = self.call_broker({
            "kind": "tool", "runId": self.context.run_id,
            "runnerGeneration": self.context.runner_generation,
            "scope": self.context.scope.model_dump(mode="json", by_alias=True),
            "controlEpoch": self.context.control_epoch, "tool": name, "args": args,
        })
        if not isinstance(reply, dict):
            raise PolicyDenied("invalid_broker_reply")
        return canonical_json(reply)


_guard: contextvars.ContextVar[ExecutionGuard | None] = contextvars.ContextVar("independent_execution_guard", default=None)


def independent_worker() -> bool:
    if os.environ.get("LASTBROWSER_NATIVE_CHAT_WORKER") == "1":
        try:
            from .native_chat_policy import has_bound_native_policy
            return not has_bound_native_policy()
        except ImportError:
            return True
    return os.environ.get("LASTBROWSER_INDEPENDENT_WORKER") == "1" or _guard.get() is not None


def native_tool_block_reason(name: str, args: dict[str, Any]) -> str | None:
    """A private ordinary worker needs its own immutable tool boundary first."""
    if os.environ.get("LASTBROWSER_NATIVE_CHAT_WORKER") != "1":
        return None
    try:
        from .native_chat_policy import native_tool_denial
        return native_tool_denial(name, args)
    except ImportError:
        return "native_chat_context_missing"


@contextlib.contextmanager
def execution_guard(guard: ExecutionGuard) -> Iterator[None]:
    token = _guard.set(guard)
    try:
        yield
    finally:
        _guard.reset(token)


def current_guard() -> ExecutionGuard:
    guard = _guard.get()
    if guard is None:
        raise PolicyDenied("independent_context_missing")
    return guard


def tool_block_reason(name: str, args: dict[str, Any]) -> str | None:
    if not independent_worker():
        return None
    try:
        current_guard()
        validate_tool(name, args)
    except PolicyDenied as exc:
        return exc.code
    return None


def dispatch_independent(name: str, args: dict[str, Any]) -> str | None:
    """Called at the REAL registry boundary; None means a legacy normal turn."""
    if not independent_worker():
        return None
    try:
        return current_guard().invoke(name, args)
    except PolicyDenied as exc:
        return canonical_json({"error": exc.code, "denied": True})


def validate_tool(name: str, args: dict[str, Any]) -> ToolSpec:
    spec = TOOL_SPECS.get(name)
    if spec is None:
        raise PolicyDenied("tool_not_authorized_for_independent_run")
    if not isinstance(args, dict) or len(canonical_json(args).encode("utf-8")) > 32768:
        raise PolicyDenied("invalid_tool_arguments")
    allowed = {
        "independent_browser_navigate": {"url"},
        "independent_browser_read": {"selector"},
        "independent_browser_screenshot": set(),
        "independent_browser_click": {"selector"},
        "independent_browser_type": {"selector", "text"},
        "independent_file_read": {"path", "maxBytes"},
        "independent_browser_extract": {"selector", "prompt"},
        "independent_browser_vision": {"prompt"},
        "independent_memory_recall": {"query", "target"},
    }[name]
    if set(args) - allowed:
        raise PolicyDenied("model_cannot_select_scope_or_target")
    required = {
        "independent_browser_navigate": ("url",),
        "independent_browser_click": ("selector",),
        "independent_browser_type": ("selector", "text"),
        "independent_file_read": ("path",),
    }.get(name, ())
    if any(not isinstance(args.get(key), str) or not args[key].strip() for key in required):
        raise PolicyDenied("missing_tool_arguments")
    if "selector" in args and (not isinstance(args["selector"], str) or len(args["selector"]) > 2048):
        raise PolicyDenied("invalid_selector")
    if "maxBytes" in args and (type(args["maxBytes"]) is not int or not 1 <= args["maxBytes"] <= 1048576):
        raise PolicyDenied("invalid_read_limit")
    if name in {"independent_browser_extract", "independent_browser_vision", "independent_memory_recall"}:
        field="query" if name=="independent_memory_recall" else "prompt"
        if not isinstance(args.get(field),str) or not 1<=len(args[field].strip())<=2048:
            raise PolicyDenied("invalid_local_role_instruction")
        if "target" in args and args["target"] not in {"memory","user"}:
            raise PolicyDenied("invalid_local_memory_target")
    return spec


def origin(url: str) -> str:
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError
        host = parsed.hostname.encode("idna").decode("ascii").lower()
        port = parsed.port
        host = f"[{host}]" if ":" in host else host
        suffix = f":{port}" if port is not None and port != (443 if parsed.scheme == "https" else 80) else ""
        return f"{parsed.scheme.lower()}://{host}{suffix}"
    except (ValueError, UnicodeError):
        raise PolicyDenied("invalid_http_origin") from None


def require_origin(url: str, allowed: tuple[str, ...]) -> str:
    value = origin(url)
    if value not in {origin(item) for item in allowed}:
        raise PolicyDenied("origin_outside_scope")
    return value


def require_public_network(url: str, allowed: tuple[str, ...], resolved_addresses: tuple[str, ...]) -> None:
    require_origin(url, allowed)
    if not resolved_addresses or any(not ipaddress.ip_address(address).is_global for address in resolved_addresses):
        raise PolicyDenied("private_or_unknown_network_destination")


def intersect_permissions(*scopes: PermissionScope) -> PermissionScope:
    if not scopes:
        return PermissionScope(allowed_effects=())
    def common(field: str) -> tuple[str, ...]:
        values = set(getattr(scopes[0], field))
        for scope in scopes[1:]:
            values.intersection_update(getattr(scope, field))
        return tuple(sorted(values))
    return PermissionScope(**{field: common(field) for field in (
        "browser_origins", "connector_bindings", "network_origins", "allowed_workspace_roots", "allowed_effects",
    )})


def require_effect(spec: ToolSpec, permission: PermissionScope) -> None:
    if spec.effect not in permission.allowed_effects:
        raise PolicyDenied("effect_requires_authorization")


def _within(path: Path, roots: tuple[str, ...]) -> bool:
    for root in roots:
        try:
            path.relative_to(Path(root).resolve(strict=True))
            return True
        except (ValueError, OSError):
            continue
    return False


def checked_file(path: str, roots: tuple[str, ...]) -> Path:
    if "\x00" in path or re.search(r"(^|[\\/])\.\.([\\/]|$)", path):
        raise PolicyDenied("invalid_file_path")
    try:
        resolved = Path(path).expanduser().resolve(strict=True)
    except OSError:
        raise PolicyDenied("file_unavailable") from None
    if not _within(resolved, roots) or not resolved.is_file():
        raise PolicyDenied("file_outside_authorized_root")
    return resolved


def _opened_path(file: Any, fallback: Path) -> Path:
    if os.name == "nt":
        import msvcrt
        get_path = ctypes.windll.kernel32.GetFinalPathNameByHandleW
        get_path.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32]
        get_path.restype = ctypes.c_uint32
        buffer = ctypes.create_unicode_buffer(32768)
        count = get_path(ctypes.c_void_p(msvcrt.get_osfhandle(file.fileno())), buffer, len(buffer), 0)
        if not count or count >= len(buffer):
            raise PolicyDenied("file_handle_identity_unavailable")
        final = buffer.value
        if final.startswith("\\\\?\\UNC\\"):
            final = "\\\\" + final[8:]
        elif final.startswith("\\\\?\\"):
            final = final[4:]
        return Path(final).resolve(strict=True)
    fd = Path(f"/proc/self/fd/{file.fileno()}")
    if fd.exists():
        return fd.resolve(strict=True)
    # Platforms without a handle-path facility cannot prove an external root.
    raise PolicyDenied("file_handle_identity_unavailable")


def read_authorized_file(path: str, roots: tuple[str, ...], max_bytes: int = 262144) -> dict[str, Any]:
    resolved = checked_file(path, roots)
    with resolved.open("rb") as file:
        final = _opened_path(file, resolved)
        if not _within(final, roots):
            raise PolicyDenied("file_changed_outside_authorized_root")
        data = file.read(max_bytes + 1)
    return {"path": str(final), "text": data[:max_bytes].decode("utf-8", errors="replace"), "truncated": len(data) > max_bytes}
