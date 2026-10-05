"""Actual dispatcher gate for fixed-profile ordinary chat processes.

Until an exact-scope broker exists, browser, terminal, code execution, network
and unknown tools are unavailable. Prompt instructions cannot add authority.
This gate is not an OS sandbox; the dedicated process owns its profile files.
"""
from __future__ import annotations
import os
import stat
from pathlib import Path
from typing import Mapping
from .native_chat_protocol import NativeChatContext, verify_native_context

_context: NativeChatContext | None = None
_SAFE_TOOLS = frozenset({"read_file", "search_files", "write_file", "patch", "clarify", "delegate_task"})


def bind_native_policy(context: NativeChatContext) -> None:
    global _context
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1" or os.getenv("SIDEKICK_HOME") != context.profile_home:
        raise PermissionError("Native policy may only bind its private worker")
    verify_native_context(context)
    if _context is not None and _context != context:
        raise PermissionError("A native worker cannot change its binding")
    _context = context


def has_bound_native_policy() -> bool:
    context=_context
    if context is None or os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1":
        return False
    fixed={"SIDEKICK_HOME":context.profile_home,
        "LASTBROWSER_NATIVE_GENERATION":context.writer_generation,
        "LASTBROWSER_BACKEND_PROFILE_ID":context.scope.backend_profile_id,
        "LASTBROWSER_BROWSER_PROFILE_ID":context.scope.browser_profile_id,
        "LASTBROWSER_SPACE_ID":context.scope.space_id,
        "LASTBROWSER_PARTITION_KEY":context.partition_key}
    return all(os.getenv(key)==value for key,value in fixed.items())


def get_bound_native_context() -> NativeChatContext | None:
    return _context if has_bound_native_policy() else None


def _canonical_tool_path(raw: str, workspace: Path) -> Path:
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = workspace / candidate
    candidate = Path(os.path.abspath(candidate))
    if not candidate.is_relative_to(workspace.resolve()):
        raise PermissionError("Path is outside the accepted workspace")
    # Reject junctions/symlinks before resolving: they can replace a checked parent.
    for node in (candidate, *candidate.parents):
        try:
            info = node.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise PermissionError("Linked tool paths are unavailable")
    actual = candidate.resolve()
    if not actual.is_relative_to(workspace.resolve()):
        raise PermissionError("Path is outside the accepted workspace")
    # Windows alternate streams/device paths are not ordinary project files.
    if any(":" in part for part in actual.parts[1:]):
        raise ValueError("Alternate data streams are unavailable")
    return actual


def _protected_tool_path(path: Path, context: NativeChatContext, *, mutation: bool, recursive: bool) -> bool:
    home = Path(context.profile_home).resolve()
    space = Path(context.space_root).resolve()
    if path.is_file() and path.stat().st_nlink > 1:
        return True
    # An externally registered ancestor workspace must not expose the profile tree.
    if path.is_relative_to(home) and not path.is_relative_to(space):
        return True
    trees = [Path(context.sessions_dir).resolve(), space / "agents"]
    if mutation:
        trees.append(space / "memory")
    secret_files = [space / name for name in (".env", "auth.json", "config.yaml", ".anthropic_oauth.json")]
    control_files = [space / name for name in ("space.yaml", "workspace.yaml", "nova-management-audit.jsonl")]
    for db in (space / name for name in ("state.db", "kanban.db", "goals.db", "subagents.db")):
        secret_files.extend(Path(str(db) + suffix) for suffix in ("", "-wal", "-shm", "-journal"))
    files = secret_files + (control_files if mutation else [])
    for protected in [*trees, *files]:
        if path == protected or protected in trees and path.is_relative_to(protected):
            return True
        # Recursive search cannot leak descendants; a single read remains separate.
        if recursive and protected.is_relative_to(path):
            return True
        # A hard link may have a different name but still overwrite/read control data.
        if path.is_file() and protected.is_file() and path.samefile(protected):
            return True
    if recursive and home.is_relative_to(path):
        return True
    return False


def native_tool_denial(name: str, arguments: Mapping | None, *, context=None) -> str | None:
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1":
        return None
    bound = _context
    if not has_bound_native_policy() or context is not None and context != bound:
        return "native_chat_context_missing"
    try:
        verify_native_context(bound)
    except Exception:
        return "native_chat_binding_unavailable"
    if name not in _SAFE_TOOLS:
        from .native_browser_contracts import NATIVE_BROWSER_TOOLS
        if name in NATIVE_BROWSER_TOOLS:
            from .native_browser_bridge import has_bound_native_browser_bridge
            if has_bound_native_browser_bridge(bound):
                return None
        return "native_chat_tool_requires_bound_broker"
    if name in {"read_file", "write_file", "patch", "search_files"}:
        args = arguments if isinstance(arguments, Mapping) else {}
        if name == "patch" and (args.get("mode") == "patch" or args.get("patch")):
            return "native_chat_multifile_patch_requires_broker"
        paths = []
        for key in ("path", "file_path", "directory", "root", "cwd"):
            raw = args.get(key)
            if raw is None:
                continue
            if not isinstance(raw, str) or not raw:
                return "native_chat_file_path_invalid"
            try:
                paths.append(_canonical_tool_path(raw, Path(bound.workspace)))
            except PermissionError:
                return "native_chat_file_scope_denied"
            except (OSError, RuntimeError, ValueError):
                return "native_chat_file_path_invalid"
        if not paths:
            if name != "search_files":
                return "native_chat_file_path_invalid"
            paths = [Path(bound.workspace).resolve()]
        try:
            if any(_protected_tool_path(path, bound, mutation=name in {"write_file", "patch"},
                    recursive=name == "search_files") for path in paths):
                return "native_chat_control_path_denied"
        except (OSError, RuntimeError, ValueError):
            return "native_chat_file_path_invalid"
    return None
