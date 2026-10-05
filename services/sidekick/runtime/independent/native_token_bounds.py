"""Private text-request reservation, never a measured provider token count.

The bundled runtime has no offline model tokenizer. UTF-8 JSON bytes give a
deliberately conservative text envelope for byte/character tokenization and
include the complete message/tool schema framing. Opaque media and remotely
stored context need a real count adapter and are rejected rather than guessed.
Only the integer reservation and its source cross the Parent RPC boundary.
"""
from __future__ import annotations

import json
from .policy import PolicyDenied

_INPUT_KEYS = frozenset({"messages", "input", "instructions", "system", "tools", "functions",
    "tool_choice", "function_call", "response_format", "text", "extra_body"})
_OPAQUE_TYPES = frozenset({"image", "image_url", "input_image", "document", "input_file",
    "input_audio", "audio", "video", "file"})


def serialized_text_bound(request: dict, path=()) -> int:
    if any(request.get(key) for key in ("previous_response_id", "conversation", "file_ids")):
        raise PolicyDenied("native_auto_remote_context_count_required")
    body = {key: value for key, value in request.items() if key in _INPUT_KEYS}
    if not any(key in body for key in ("messages", "input")):
        raise PolicyDenied("native_auto_input_count_required")
    def check(value, depth=0):
        if depth > 32:
            raise PolicyDenied("native_auto_input_count_too_deep")
        if isinstance(value, dict):
            if value.get("type") in _OPAQUE_TYPES or "file_id" in value:
                raise PolicyDenied("native_auto_media_token_count_required")
            for key, item in value.items():
                if not isinstance(key, str):
                    raise PolicyDenied("native_auto_input_count_invalid")
                check(item, depth + 1)
        elif isinstance(value, (list, tuple)):
            for item in value: check(item, depth + 1)
        elif value is not None and type(value) not in {str, bool, int, float}:
            raise PolicyDenied("native_auto_input_count_invalid")
    check(body)
    encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > 16000000:
        raise PolicyDenied("native_auto_input_count_too_large")
    return len(encoded)
