"""Plain OpenCode text turns stream a direct completion without the agent worker."""

from __future__ import annotations

import json
import threading

import pytest


class _Session:
    def __init__(self):
        self.session_id = "session-fast"
        self.model = "deepseek-v4.1-flash"
        self.model_provider = "opencode-go"
        self.profile = "default"
        self.messages = []
        self.context_messages = []
        self.active_stream_id = None
        self.space_scope = None
        self.pending_user_message = None
        self.pending_started_at = None
        self.last_prompt_tokens = 0
        self.saved = False

    def save(self, touch_updated_at=True):
        self.saved = True

    def compact(self):
        return {"session_id": self.session_id}


class _Response:
    def __init__(self, lines):
        self._lines = lines

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def __iter__(self):
        yield from self._lines


def _body(message="Reply with the single word pong."):
    return {"message": message, "model": "deepseek-v4.1-flash", "model_provider": "opencode-go"}


def test_attachments_and_plan_mode_stay_on_the_agent_path():
    from web.api.fast_opencode_chat import try_start_fast_opencode_chat

    session = _Session()
    assert try_start_fast_opencode_chat(None, session, "pong", [{"name": "a"}], _body()) is None
    assert try_start_fast_opencode_chat(None, session, "pong", [], {**_body(), "mode": "plan"}) is None
    assert try_start_fast_opencode_chat(None, session, "pong", [], {**_body(), "model_provider": "openai"}) is None


def test_direct_completion_emits_the_answer_and_persists_it(monkeypatch):
    from web.api import config
    from web.api.fast_opencode_chat import try_start_fast_opencode_chat

    captured = {}

    def resolve_connection(provider, model=None, session_id=None):
        captured["provider"] = provider
        captured["model"] = model
        return {
            "api_mode": "chat_completions",
            "api_key": "test-key",
            "base_url": "https://opencode.ai/inference/go/openai/v1",
            "headers": {"x-opencode-session": "abc"},
            "model": model,
        }

    def urlopen(request, timeout=0):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        body = json.loads(request.data.decode())
        captured["wire_model"] = body["model"]
        captured["roles"] = [item["role"] for item in body["messages"]]
        assert request.get_header("Authorization") == "Bearer test-key"
        line = json.dumps({"choices": [{"delta": {"content": "pong"}}]})
        usage = json.dumps({"choices": [], "usage": {"prompt_tokens": 40, "completion_tokens": 1}})
        return _Response([f"data: {line}\n".encode(), f"data: {usage}\n".encode(), b"data: [DONE]\n"])

    monkeypatch.setattr("cli.opencode_device.resolve_connection", resolve_connection)
    monkeypatch.setattr("web.api.fast_opencode_chat.urllib.request.urlopen", urlopen)
    monkeypatch.setattr("web.api.fast_opencode_chat._goal_blocks_fast_path", lambda *_args: False)

    session = _Session()
    started = try_start_fast_opencode_chat(None, session, "Reply with the single word pong.", [], _body())
    assert started["fast_path"] == "opencode_direct"
    assert started["space_scope"] is None
    assert started["effective_model"] == "deepseek-v4.1-flash"
    stream_id = started["stream_id"]
    deadline = threading.Event()

    def wait_until_quiet():
        for _ in range(50):
            if session.saved and session.active_stream_id is None:
                deadline.set()
                return
            threading.Event().wait(0.02)

    threading.Thread(target=wait_until_quiet, daemon=True).start()
    assert deadline.wait(2)
    channel = config.get_chat_stream_channel(stream_id)
    events = []
    subscriber = channel.subscribe()
    while True:
        try:
            events.append(subscriber.get_nowait())
        except Exception:
            break
    kinds = [event for event, _payload in events]
    assert "token" in kinds
    assert events[kinds.index("token")][1] == {"text": "pong"}
    assert "done" in kinds
    assert "stream_end" in kinds
    assert session.messages[-1]["content"] == "pong"
    assert session.last_prompt_tokens == 40
    assert captured["url"].endswith("/chat/completions")
    assert captured["roles"] == ["system", "user"]
    with config.STREAMS_LOCK:
        config.STREAMS.pop(stream_id, None)
        config.RECENT_CHAT_STREAMS.pop(stream_id, None)
        config.CANCEL_FLAGS.pop(stream_id, None)
