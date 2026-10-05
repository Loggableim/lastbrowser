"""Finite private input reservations must not guess media/remote context."""
import pytest
from runtime.independent.native_token_bounds import serialized_text_bound
from runtime.independent.policy import PolicyDenied


def test_unicode_and_tool_framing_are_in_private_text_reservation():
    text = "Grüße 日本語"
    request = {"messages": [{"role": "user", "content": text}],
        "tools": [{"type": "function", "function": {"name": "read_file", "description": "Öffnen"}}]}
    bound = serialized_text_bound(request)
    assert bound > len(text.encode("utf-8"))
    assert bound < 64000  # Context eligibility is a separate model requirement.
    assert serialized_text_bound({**request, "max_tokens": 999, "stream": True}) == bound


@pytest.mark.parametrize("payload", [
    {"messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "https://example.test/private.png"}}]}]},
    {"input": [{"type": "input_file", "file_id": "opaque-owned-file"}]},
    {"messages": [], "previous_response_id": "opaque-owned-response"},
])
def test_opaque_media_or_remote_history_needs_actual_count_adapter(payload):
    with pytest.raises(PolicyDenied, match="count_required"):
        serialized_text_bound(payload)
