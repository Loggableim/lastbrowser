"""Bind actual native file-handler arguments before their authorization gate."""
from __future__ import annotations

import os
from pathlib import Path

from .policy import PolicyDenied

_FILE_TOOLS = frozenset({"read_file", "write_file", "patch", "search_files"})
_PATH_FIELDS = ("path", "file_path", "directory", "root", "cwd")


def bind_native_file_arguments(name: str, arguments):
    """No process cwd/env mutation; legacy dispatch keeps its original object.

    Existing file handlers also consult task-local terminal cwd. Absolute
    arguments make their actual target identical to the Native policy target.
    This helper grants no tool, workspace, file or writer permission.
    """
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1" or name not in _FILE_TOOLS:
        return arguments
    from .native_chat_policy import get_bound_native_context, _canonical_tool_path
    from .native_chat_protocol import verify_native_context
    context = get_bound_native_context()
    if context is None:
        raise PolicyDenied("native_chat_context_missing")
    if os.getenv("TERMINAL_ENV", "local") != "local":
        raise PolicyDenied("native_chat_local_file_adapter_required")
    try:
        verify_native_context(context)
    except (OSError, RuntimeError, ValueError, PermissionError) as error:
        raise PolicyDenied("native_chat_binding_unavailable") from error
    try:
        if not isinstance(arguments, dict):
            raise PolicyDenied("native_chat_file_arguments_invalid")
        bound = dict(arguments)
        if name == "search_files" and bound.get("path") is None:
            bound["path"] = context.workspace
        for key in _PATH_FIELDS:
            raw = bound.get(key)
            if raw is None:
                continue
            if not isinstance(raw, str) or not raw:
                raise PolicyDenied("native_chat_file_path_invalid")
            try:
                bound[key] = str(_canonical_tool_path(raw, Path(context.workspace)))
            except PermissionError as error:
                raise PolicyDenied("native_chat_file_scope_denied") from error
            except (OSError, RuntimeError, ValueError) as error:
                raise PolicyDenied("native_chat_file_path_invalid") from error
        return bound
    except PolicyDenied:
        raise
    except (OSError, RuntimeError, ValueError, PermissionError) as error:
        raise PolicyDenied("native_chat_file_binding_unavailable") from error
