"""Private file-tool transport, separate from credential-free SDK metadata."""
from typing import Any, Literal
from pydantic import Field
from .contracts import Contract, Ref, canonical_json

FILE_TOOLS = frozenset({"read_file", "search_files", "write_file", "patch"})
MAX_FILE_PAYLOAD_BYTES = 768 * 1024
MAX_FILE_RESULT_BYTES = 128 * 1024


class NativeFileRequest(Contract):
    operation_id: Ref
    tool_name: Literal["read_file", "search_files", "write_file", "patch"]
    arguments: dict[str, Any]
    execution_mode: Literal["action", "plan", "boost", "grill_me"]
    execution_policy_revision: int = Field(ge=0)


def validate_file_payload(payload):
    request = NativeFileRequest.model_validate(payload)
    if len(canonical_json(request).encode("utf-8")) > MAX_FILE_PAYLOAD_BYTES:
        raise ValueError("native_file_payload_too_large")
    fields = {
        "read_file": {"path", "offset", "limit"},
        "write_file": {"path", "content"},
        "patch": {"mode", "path", "old_string", "new_string", "replace_all"},
        "search_files": {"path", "pattern", "target", "file_glob", "limit", "offset", "output_mode", "context"},
    }[request.tool_name]
    if set(request.arguments) - fields or any(not isinstance(value, (str, int, bool, type(None))) for value in request.arguments.values()):
        raise ValueError("native_file_arguments_invalid")
    return request
