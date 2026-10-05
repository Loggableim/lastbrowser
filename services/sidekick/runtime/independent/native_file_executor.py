"""One bounded stdlib file effect in a Parent-owned process; no SDK or shell."""
from __future__ import annotations
import fnmatch
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time

from .native_file_contracts import MAX_FILE_PAYLOAD_BYTES, MAX_FILE_RESULT_BYTES, validate_file_payload

MAX_READ_BYTES = 2 * 1024 * 1024
MAX_SEARCH_FILES = 2000
TIMEOUT_SECONDS = 8


def _integer(args, key, default, minimum, maximum):
    value = args.get(key, default)
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError("native_file_argument_out_of_bounds")
    return value


def _checked_path(raw, context, *, mutation=False, recursive=False):
    from .native_chat_policy import _canonical_tool_path, _protected_tool_path
    if not isinstance(raw, str) or not raw:
        raise ValueError("native_file_path_required")
    path = _canonical_tool_path(raw, Path(context.workspace))
    if _protected_tool_path(path, context, mutation=mutation, recursive=recursive):
        raise PermissionError("native_chat_control_path_denied")
    if path.exists() and not (path.is_file() or recursive and path.is_dir()):
        raise PermissionError("native_file_regular_path_required")
    return path


def _text(path):
    with path.open("rb") as handle:
        raw = handle.read(MAX_READ_BYTES + 1)
    if len(raw) > MAX_READ_BYTES or b"\0" in raw:
        raise ValueError("native_file_text_too_large_or_binary")
    return raw.decode("utf-8", errors="strict")


def _replace(path, text, context):
    _checked_path(str(path), context, mutation=True)
    if not path.parent.is_dir():
        raise ValueError("native_file_parent_directory_required")
    data = text.encode("utf-8")
    if len(data) > MAX_FILE_PAYLOAD_BYTES:
        raise ValueError("native_file_write_too_large")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", prefix=".lastbrowser-write-", dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        # A second exact gate checks parents/reparse/hardlinks immediately
        # before the atomic local replacement. This is not an OS sandbox.
        _checked_path(str(path), context, mutation=True)
        os.replace(temporary, path)
        temporary = None
        return {"success": True, "path": str(path), "bytes_written": len(data)}
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def execute(context, request):
    name, args = request.tool_name, request.arguments
    path = _checked_path(args.get("path", context.workspace if name == "search_files" else None), context,
        mutation=name in {"write_file", "patch"}, recursive=name == "search_files")
    if name == "read_file":
        offset = _integer(args, "offset", 1, 1, 1000000)
        limit = _integer(args, "limit", 500, 1, 2000)
        lines = _text(path).splitlines()
        return {"path": str(path), "content": "\n".join(f"{index + 1}: {line}" for index, line in enumerate(lines)
            if offset - 1 <= index < offset - 1 + limit), "total_lines": len(lines),
            "truncated": len(lines) > offset - 1 + limit}
    if name == "write_file":
        if not isinstance(args.get("content"), str):
            raise ValueError("native_file_content_required")
        return _replace(path, args["content"], context)
    if name == "patch":
        old, new = args.get("old_string"), args.get("new_string")
        if args.get("mode", "replace") != "replace" or not isinstance(old, str) or not old or not isinstance(new, str):
            raise ValueError("native_file_replace_arguments_required")
        all_matches = args.get("replace_all", False)
        if type(all_matches) is not bool:
            raise ValueError("native_file_replace_all_invalid")
        text = _text(path)
        count = text.count(old)
        if count == 0 or count > 1 and not all_matches:
            return {"error": "native_file_replace_match_ambiguous", "matches": count}
        return {**_replace(path, text.replace(old, new, -1 if all_matches else 1), context), "replacements": count if all_matches else 1}
    pattern = args.get("pattern")
    if not isinstance(pattern, str) or not pattern or len(pattern) > 1024:
        raise ValueError("native_file_search_pattern_required")
    limit, offset = _integer(args, "limit", 50, 1, 200), _integer(args, "offset", 0, 0, 10000)
    target = {"grep": "content", "find": "files"}.get(args.get("target"), args.get("target", "content"))
    if target not in {"content", "files"}:
        raise ValueError("native_file_search_target_invalid")
    output_mode = args.get("output_mode", "content")
    if output_mode not in {"content", "files_only", "count"}:
        raise ValueError("native_file_search_output_invalid")
    # Regex execution is bounded by process timeout and never occurs in the
    # RPC reader/Parent. The process can be terminated before Stop ACK.
    expression = re.compile(pattern) if target == "content" else None
    deadline, visited, matches = time.monotonic() + TIMEOUT_SECONDS, 0, []
    roots = [(str(path), [], [path.name])] if path.is_file() else os.walk(path, followlinks=False)
    for root, dirs, files in roots:
        dirs[:] = [directory for directory in dirs if not Path(root, directory).is_symlink()]
        for filename in files:
            visited += 1
            if visited > MAX_SEARCH_FILES or time.monotonic() > deadline:
                return {"matches": matches[offset:offset + limit], "truncated": True, "visited_files": visited}
            candidate = path if path.is_file() else Path(root) / filename
            try:
                candidate = _checked_path(str(candidate), context)
                if args.get("file_glob") and not fnmatch.fnmatch(candidate.name, args["file_glob"]):
                    continue
                if target == "files":
                    if fnmatch.fnmatch(candidate.name, pattern): matches.append({"path": str(candidate)})
                    continue
                found = [(number + 1, line) for number, line in enumerate(_text(candidate).splitlines()) if expression.search(line)]
                if found and output_mode == "count": matches.append({"path": str(candidate), "count": len(found)})
                elif found and output_mode == "files_only": matches.append({"path": str(candidate)})
                else: matches.extend({"path": str(candidate), "line": number, "content": line} for number, line in found)
            except (UnicodeError, OSError, ValueError, PermissionError):
                continue
            if len(matches) >= offset + limit:
                return {"matches": matches[offset:offset + limit], "truncated": True}
    return {"matches": matches[offset:offset + limit], "truncated": False}


def main():
    sys.stdin.reconfigure(encoding="utf-8", errors="strict")
    sys.stdout.reconfigure(encoding="utf-8", errors="strict")
    initial = sys.stdin.readline(MAX_FILE_PAYLOAD_BYTES * 2)
    if len(initial.encode("utf-8")) > MAX_FILE_PAYLOAD_BYTES * 2:
        return 2
    from .native_chat_protocol import NativeChatContext, verify_native_context
    from .store import IndependentStore
    from runtime.chat_modes import ChatExecutionPolicy, tool_denial
    from .native_chat_policy import bind_native_policy, native_tool_denial
    raw = json.loads(initial)
    context = NativeChatContext.model_validate(raw["context"])
    request = validate_file_payload(raw["request"])
    policy = ChatExecutionPolicy(**raw["policy"])
    verify_native_context(context)
    bind_native_policy(context)
    store = IndependentStore(context.profile_home, context.scope.backend_profile_id, initialize=False)
    try:
        authority = store.get_permission_state(context.scope)
        if authority["revision"] != raw["permissionRevision"] or authority["controlEpoch"] != raw["controlEpoch"]:
            raise PermissionError("native_file_authority_changed")
        denied = tool_denial(policy, request.tool_name, request.arguments) or native_tool_denial(request.tool_name, request.arguments)
        if denied: raise PermissionError(denied)
        try:
            result = execute(context, request)
        except (OSError, ValueError, UnicodeError, PermissionError) as error:
            # No exception text (which may contain content/host details) in the
            # journal/protocol. Concrete allowlisted executor failures suffice.
            result = {"error": str(error) if str(error).startswith("native_") else "native_file_effect_failed"}
        wire = json.dumps(result, ensure_ascii=False)
        if len(wire.encode("utf-8")) > MAX_FILE_RESULT_BYTES:
            result = {"error": "native_file_result_too_large", "truncated": True}
        print(json.dumps({"acknowledged": True, "operationId": request.operation_id, "result": result}, ensure_ascii=False), flush=True)
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
