import json
from types import SimpleNamespace

import pytest

from runtime.independent.contracts import Scope, new_id
from runtime.independent.model_selection import ModelPair
from runtime.independent.native_model_resolution import NativeModelResolution, publish_native_model_resolution
from web.api import config


class Channel:
    def __init__(self, journal_path=None):
        self.events = []
        self.journal_path = journal_path

    def put_nowait(self, value):
        if self.journal_path is not None:
            saved = [json.loads(row) for row in self.journal_path.read_text("utf-8").splitlines()]
            assert saved and saved[-1]["event"] == "nativeModelResolution"
            assert saved[-1]["data"] == value[1]
        self.events.append(value)


def test_native_route_is_persisted_and_published_on_exact_stream(tmp_path):
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="default")
    journal_path = tmp_path / "_turn_journal" / "chat-one.jsonl"
    channel = Channel(journal_path)
    context = SimpleNamespace(scope=scope, stream_id="turn-one", session_id="chat-one", sessions_dir=str(tmp_path))
    with config.STREAMS_LOCK:
        config.STREAMS[context.stream_id] = channel
    try:
        selected = ModelPair(provider="ollama-cloud", model="gpt-oss:120b")
        receipt = publish_native_model_resolution(context, selected, selected)
        assert receipt.fallback_applied is False
        assert channel.events == [("nativeModelResolution", receipt.model_dump(mode="json", by_alias=True))]
        lines = (tmp_path / "_turn_journal" / "chat-one.jsonl").read_text("utf-8").splitlines()
        event = json.loads(lines[-1])
        assert event["event"] == "nativeModelResolution" and event["stream_id"] == "turn-one"
        assert event["data"]["effective"]["model"] == "gpt-oss:120b"
    finally:
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id, None)


@pytest.mark.parametrize("requested,effective,extra", [
    (ModelPair(provider="custom:p", model="a"), ModelPair(provider="custom:p", model="b"), {}),
    (ModelPair(provider="ollama-cloud", model="a"), ModelPair(provider="ollama-cloud", model="not-approved"),
     {"fallback_applied": True, "fallback_reason_code": "ollama_subscription_required", "fallback_attempts": 1}),
    (ModelPair(provider="ollama-cloud", model="a"), ModelPair(provider="other", model="gpt-oss:20b"),
     {"fallback_applied": True, "fallback_reason_code": "ollama_subscription_required", "fallback_attempts": 1}),
])
def test_native_route_contract_rejects_unapproved_fallbacks(requested, effective, extra):
    with pytest.raises(ValueError):
        NativeModelResolution(scope=Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="default"),
            stream_id="turn-one", requested=requested, effective=effective, **extra)
