from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from types import SimpleNamespace
import threading

import pytest

from web.api import models, quickchat
from runtime.independent.contracts import Scope


SCOPE = {"backendProfileId": "11111111-1111-4111-8111-111111111111",
         "spaceId": "22222222-2222-4222-8222-222222222222", "browserProfileId": "browser-a"}
QUICK_ID = "a" * 32
STREAM_ID = "b" * 32


class _Session:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.messages = []
        self.active_stream_id = None
        self.path = Path(self.workspace) / f"{self.session_id}.json"

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("private", encoding="utf-8")

    def compact(self, **_kwargs):
        return {"session_id": self.session_id, "title": self.title, "profile": self.profile}


class _Resolver:
    def __init__(self, workspace):
        self.workspace = workspace
        self.binding = SimpleNamespace(workspace_locator=str(workspace))
        self.space_root = workspace

    def resolve(self, *_args, **_kwargs):
        return SimpleNamespace(binding=self.binding, space_root=self.space_root)


def _setup(monkeypatch, tmp_path):
    monkeypatch.setattr(models, "Session", _Session)
    monkeypatch.setattr(models, "SESSIONS", OrderedDict())
    monkeypatch.setattr(models, "LOCK", threading.RLock())
    monkeypatch.setattr(models, "get_session", lambda sid: models.SESSIONS[sid])
    monkeypatch.setattr(models, "_mark_session_deleted", lambda _sid: None)
    monkeypatch.setattr(models, "_SESSION_LIST_CACHE", {})
    monkeypatch.setattr(models, "_SESSION_LIST_CACHE_AT", {})
    monkeypatch.setattr("web.api.profiles.get_active_profile_name", lambda: "default")
    monkeypatch.setattr("runtime.independent.chat_binding.require_native_scope_header", lambda *_: None)
    monkeypatch.setattr("runtime.independent.chat_binding.capture_chat_profile",
                        lambda **kwargs: SimpleNamespace(scope=Scope.model_validate(SCOPE), prompt="bound space profile"))
    resolver = _Resolver(tmp_path)
    monkeypatch.setattr("web.api.independent.hub", lambda: SimpleNamespace(by_scope=lambda *_: (None, resolver)))
    monkeypatch.setattr("web.api.workspace.resolve_trusted_workspace", lambda value: str(Path(value).resolve()))
    monkeypatch.setattr("web.api.routes.get_effective_default_model", lambda: "model-a")
    monkeypatch.setattr("web.api.routes._resolve_compatible_session_model_state",
                        lambda model, provider: (model, provider or "openai", model))
    monkeypatch.setattr("web.api.routes.resolve_active_provider_context", lambda: {"provider": "openai"})
    monkeypatch.setattr("web.api.routes._game_mode_guard_payload_for_model", lambda *_: None)
    starts = []

    def start_stream(session, **kwargs):
        starts.append((session, kwargs))
        session.active_stream_id = STREAM_ID
        return {"stream_id": STREAM_ID}

    monkeypatch.setattr("web.api.routes._start_chat_stream_for_session", start_stream)
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "valid"})
    body = {"quick_chat_id": QUICK_ID, "space_scope": SCOPE, "profile": "default",
            "workspace": str(tmp_path), "prompt": "Summarize", "context": {"pageText": "untrusted"}}
    return handler, body, starts


def test_start_creates_private_scoped_stream_with_no_goal_or_tool_authority(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)

    result, status = quickchat.start_quickchat(body, handler)

    assert status == 200
    assert result["stream_id"] == STREAM_ID
    session, request = starts[0]
    assert session.session_kind == "quickchat"
    assert session.quick_chat_id == QUICK_ID
    assert session.space_scope == Scope.model_validate(SCOPE).model_dump(mode="json", by_alias=True)
    assert session.enabled_toolsets == []
    assert request["goal_related"] is False and request["mode"] == ""
    assert request["confirmed_chat_profile"].scope == Scope.model_validate(SCOPE)
    assert request["confirmed_chat_profile"].prompt == "bound space profile"
    assert "untrusted" in request["msg"]


def test_start_normalizes_resolved_windows_path_before_stream_persistence(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    monkeypatch.setattr("web.api.workspace.resolve_trusted_workspace",
                        lambda _value: Path(tmp_path))

    result, status = quickchat.start_quickchat(body, handler)

    assert status == 200
    assert result["stream_id"] == STREAM_ID
    _session, request = starts[0]
    assert request["workspace"] == str(tmp_path)
    assert type(request["workspace"]) is str


def test_reset_cancels_only_matching_private_stream_and_rejects_mismatch(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    session = starts[0][0]
    cancelled = []
    monkeypatch.setattr("web.api.streaming.cancel_stream", lambda sid: cancelled.append(sid) or True)

    wrong = {"quick_chat_id": QUICK_ID, "stream_id": "c" * 32, "space_scope": SCOPE,
             "profile": "default", "workspace": str(tmp_path)}
    with pytest.raises(quickchat.QuickChatError, match="another active response"):
        quickchat.cancel_quickchat(wrong, handler)
    assert cancelled == []

    reset = {**wrong, "stream_id": STREAM_ID}
    result, status = quickchat.cancel_quickchat(reset, handler)
    assert status == 200 and result["reset"] is True and result["cancelled"] is True
    assert cancelled == [STREAM_ID]
    assert session.session_id not in models.SESSIONS


def test_reset_rejects_wrong_scope_before_cancelling(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    cancelled = []
    monkeypatch.setattr("web.api.streaming.cancel_stream", lambda sid: cancelled.append(sid) or True)
    reset = {"quick_chat_id": QUICK_ID, "stream_id": STREAM_ID,
             "space_scope": {**SCOPE, "spaceId": "33333333-3333-4333-8333-333333333333"}, "profile": "default",
             "workspace": str(tmp_path)}
    with pytest.raises(quickchat.QuickChatError):
        quickchat.cancel_quickchat(reset, handler)
    assert cancelled == []


def test_stop_cancels_stream_but_preserves_private_transcript(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    session = starts[0][0]
    session.messages = [{"role": "user", "content": "keep this transcript"}]
    cancelled = []

    def stop_stream(stream_id):
        cancelled.append(stream_id)
        session.active_stream_id = None
        return True

    monkeypatch.setattr("web.api.streaming.cancel_stream", stop_stream)
    request = {"quick_chat_id": QUICK_ID, "stream_id": STREAM_ID, "space_scope": SCOPE,
               "profile": "default", "workspace": str(tmp_path)}
    result, status = quickchat.stop_quickchat(request, handler)

    assert status == 200 and result["cancelled"] is True and result["reset"] is False
    assert cancelled == [STREAM_ID]
    assert models.get_session(QUICK_ID) is session
    assert session.messages == [{"role": "user", "content": "keep this transcript"}]
    reset = {**request, "stream_id": ""}
    reset_result, reset_status = quickchat.cancel_quickchat(reset, handler)
    assert reset_status == 200 and reset_result["reset"] is True
    assert QUICK_ID not in models.SESSIONS


def test_quickchat_is_filtered_from_both_session_list_paths(monkeypatch, tmp_path):
    quick = _Session(session_id=QUICK_ID, title="Quickchat", workspace=str(tmp_path), profile="default",
                     session_kind="quickchat", quick_chat_id=QUICK_ID)
    ordinary = _Session(session_id="c" * 32, title="Saved chat", workspace=str(tmp_path), profile="default")
    monkeypatch.setattr(models, "get_session_dir", lambda: tmp_path)
    monkeypatch.setattr(models, "_session_index_file", lambda: tmp_path / "index.json")
    monkeypatch.setattr(models, "_active_stream_ids", lambda: set())
    monkeypatch.setattr(models, "_hide_from_default_sidebar", lambda _row: False)
    monkeypatch.setattr(models, "_enrich_sidebar_lineage_metadata", lambda _rows: None)
    monkeypatch.setattr(models, "_index_entry_exists", lambda *_: True)
    monkeypatch.setattr(models, "_SESSION_LIST_CACHE", {})
    monkeypatch.setattr(models, "_SESSION_LIST_CACHE_AT", {})
    monkeypatch.setattr(models, "SESSIONS", OrderedDict([(quick.session_id, quick), (ordinary.session_id, ordinary)]))
    monkeypatch.setattr(models, "LOCK", threading.RLock())
    monkeypatch.setattr(models, "Session", _Session)

    assert [row["session_id"] for row in models.all_sessions()] == [ordinary.session_id]

    quick.path.write_text("private", encoding="utf-8")
    ordinary.path.write_text("ordinary", encoding="utf-8")
    (tmp_path / "index.json").write_text("[]", encoding="utf-8")
    models._SESSION_LIST_CACHE.clear()
    models._SESSION_LIST_CACHE_AT.clear()
    assert [row["session_id"] for row in models.all_sessions()] == [ordinary.session_id]
