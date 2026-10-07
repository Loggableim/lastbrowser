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


def test_quickchat_start_does_not_create_a_state_db_session(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    db_opens=[]

    class UnexpectedSessionDB:
        def __init__(self, *_args, **_kwargs):
            db_opens.append(True)
            raise AssertionError("Quickchat must not create an ordinary state.db session")

    monkeypatch.setattr("runtime._compat.shim_state.SessionDB", UnexpectedSessionDB)

    result, status = quickchat.start_quickchat(body, handler)

    assert status == 200
    assert result["quick_chat_id"] == QUICK_ID
    assert starts[0][0].session_kind == "quickchat"
    assert starts[0][0].quick_chat_id == QUICK_ID
    assert db_opens == []


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


def test_failed_start_preserves_existing_quickchat_session(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    existing, _ = starts[0]
    prior_messages = [{"role": "assistant", "content": "existing private answer"}]
    existing.messages = prior_messages
    monkeypatch.setattr("web.api.routes._start_chat_stream_for_session",
                        lambda *_args, **_kwargs: {"error": "worker temporarily unavailable", "_status": 503})

    result, status = quickchat.start_quickchat(body, handler)

    assert status == 503 and result["ok"] is False
    assert models.get_session(QUICK_ID) is existing
    assert existing.messages is prior_messages


def test_reset_cancels_only_matching_private_stream_and_rejects_mismatch(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    session = starts[0][0]
    cancelled = []
    monkeypatch.setattr(quickchat, "_stop_and_wait_for_quickchat_worker",
                        lambda session, sid, actor, scope: cancelled.append((session.session_id, sid, actor, scope)) or True)

    wrong = {"quick_chat_id": QUICK_ID, "stream_id": "c" * 32, "space_scope": SCOPE,
             "profile": "default", "workspace": str(tmp_path)}
    with pytest.raises(quickchat.QuickChatError, match="another active response"):
        quickchat.cancel_quickchat(wrong, handler)
    assert cancelled == []

    reset = {**wrong, "stream_id": STREAM_ID}
    result, status = quickchat.cancel_quickchat(reset, handler)
    assert status == 200 and result["reset"] is True and result["cancelled"] is True
    assert cancelled == [(QUICK_ID, STREAM_ID, "default", Scope.model_validate(SCOPE))]
    assert session.session_id not in models.SESSIONS


def test_reset_rejects_wrong_scope_before_cancelling(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    cancelled = []
    monkeypatch.setattr(quickchat, "_stop_and_wait_for_quickchat_worker",
                        lambda _session, sid, _actor, _scope: cancelled.append(sid) or True)
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

    def stop_stream(_session, stream_id, _actor, _scope):
        cancelled.append(stream_id)
        session.active_stream_id = None
        return True

    monkeypatch.setattr(quickchat, "_stop_and_wait_for_quickchat_worker", stop_stream)
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


def test_reset_after_stop_keeps_private_session_when_worker_release_is_unconfirmed(monkeypatch, tmp_path):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    session = starts[0][0]

    def stop_stream(_session, _sid, _actor, _scope):
        session.active_stream_id = None
        return True

    monkeypatch.setattr(quickchat, "_stop_and_wait_for_quickchat_worker", stop_stream)
    stop = {"quick_chat_id": QUICK_ID, "stream_id": STREAM_ID, "space_scope": SCOPE,
            "profile": "default", "workspace": str(tmp_path)}
    stopped, status = quickchat.stop_quickchat(stop, handler)
    assert status == 200 and stopped["cancelled"] is True

    from web.api import native_chats
    settled = SimpleNamespace(scope=Scope.model_validate(SCOPE), profile_name="default", stream_id=STREAM_ID)
    monkeypatch.setattr(native_chats, "get_session_native_context", lambda _sid: settled)
    def fail_unreleased_worker(*_args):
        raise quickchat.QuickChatError("Quickchat writer release was not confirmed", 503,
                                       "quickchat_writer_release_unconfirmed")

    monkeypatch.setattr(quickchat, "_stop_and_wait_for_quickchat_worker", fail_unreleased_worker)
    reset = {"quick_chat_id": QUICK_ID, "stream_id": "", "space_scope": SCOPE,
             "profile": "default", "workspace": str(tmp_path)}

    with pytest.raises(quickchat.QuickChatError) as caught:
        quickchat.cancel_quickchat(reset, handler)

    assert caught.value.code == "quickchat_writer_release_unconfirmed"
    assert models.get_session(QUICK_ID) is session


@pytest.mark.parametrize("change, expected_code", [
    (lambda request: request.update(profile="other"), "quickchat_profile_mismatch"),
    (lambda request: request.update(space_scope={**SCOPE, "spaceId": "33333333-3333-4333-8333-333333333333"}),
     "quickchat_binding_conflict"),
    (lambda request: request.update(stream_id="c" * 32), "quickchat_stream_mismatch"),
])
def test_stop_rejects_foreign_profile_scope_or_stream_before_dispatch(monkeypatch, tmp_path, change, expected_code):
    handler, body, starts = _setup(monkeypatch, tmp_path)
    quickchat.start_quickchat(body, handler)
    session = starts[0][0]
    session.active_stream_id = STREAM_ID
    request = {"quick_chat_id": QUICK_ID, "stream_id": STREAM_ID, "space_scope": SCOPE,
               "profile": "default", "workspace": str(tmp_path)}
    change(request)
    dispatched = []
    monkeypatch.setattr(quickchat, "_stop_and_wait_for_quickchat_worker",
                        lambda *_args: dispatched.append(True) or True)

    with pytest.raises(quickchat.QuickChatError) as caught:
        quickchat.stop_quickchat(request, handler)

    assert caught.value.code == expected_code
    assert dispatched == []


def test_reset_requires_accepted_worker_exit_and_writer_release(monkeypatch, tmp_path):
    from runtime.independent import store as store_module
    from web.api import native_chats

    scope = Scope.model_validate(SCOPE)
    context = SimpleNamespace(session_id=QUICK_ID, stream_id=STREAM_ID, profile_name="default",
        scope=scope, profile_home=str(tmp_path), writer_lease_id="lease-1")
    exited = [False]
    cancelled = []
    lease_active = [True]
    monkeypatch.setattr(native_chats, "get_native_stream_context", lambda sid: context if sid == STREAM_ID else None)
    monkeypatch.setattr(native_chats, "native_chat_exit_confirmed", lambda _context: exited[0])
    monkeypatch.setattr(native_chats, "control_native_chat",
        lambda sid, stream, **kwargs: cancelled.append((sid, stream, kwargs)) or True)

    class FakeStore:
        def __init__(self, *_args, **_kwargs): pass
        def list_leases(self): return ({"leaseId": "lease-1"},) if lease_active[0] else ()
        def close(self): pass

    monkeypatch.setattr(store_module, "IndependentStore", FakeStore)
    def tick(_seconds):
        exited[0] = True
        lease_active[0] = False
    monkeypatch.setattr(quickchat.time, "sleep", tick)

    session = SimpleNamespace(session_id=QUICK_ID)
    assert quickchat._stop_and_wait_for_quickchat_worker(session, STREAM_ID, "default", scope, timeout=1) is True
    assert cancelled == [(QUICK_ID, STREAM_ID, {"actor": "default", "scope": scope, "command": "cancel"})]


def test_reset_fails_closed_when_native_worker_binding_is_missing(monkeypatch, tmp_path):
    from web.api import native_chats
    monkeypatch.setattr(native_chats, "get_native_stream_context", lambda _sid: None)
    monkeypatch.setattr(native_chats, "native_chat_exit_confirmed", lambda _context: False)
    monkeypatch.setattr(native_chats, "control_native_chat", lambda *_args, **_kwargs: pytest.fail("must not dispatch unbound cancellation"))

    with pytest.raises(quickchat.QuickChatError, match="worker binding"):
        quickchat._stop_and_wait_for_quickchat_worker(SimpleNamespace(session_id=QUICK_ID), STREAM_ID,
            "default", Scope.model_validate(SCOPE), timeout=0.01)


def test_stop_fails_closed_when_registry_returns_an_unrelated_stream_context(monkeypatch):
    from web.api import native_chats
    unrelated = SimpleNamespace(session_id=QUICK_ID, stream_id="c" * 32,
        profile_name="default", scope=Scope.model_validate(SCOPE))
    monkeypatch.setattr(native_chats, "get_native_stream_context", lambda _sid: unrelated)
    monkeypatch.setattr(native_chats, "control_native_chat",
        lambda *_args, **_kwargs: pytest.fail("must not cancel an unrelated writer stream"))

    with pytest.raises(quickchat.QuickChatError, match="worker binding"):
        quickchat._stop_and_wait_for_quickchat_worker(
            SimpleNamespace(session_id=QUICK_ID), STREAM_ID, "default", Scope.model_validate(SCOPE), timeout=0.01)


def test_session_native_context_prefers_active_worker_and_falls_back_to_settled(monkeypatch):
    from web.api import native_chats
    scope = Scope.model_validate(SCOPE)
    active_context = SimpleNamespace(session_id=QUICK_ID, stream_id="d" * 32, scope=scope)
    settled_context = SimpleNamespace(session_id=QUICK_ID, stream_id="e" * 32, scope=scope)
    monkeypatch.setattr(native_chats, "_active", {
        "active": SimpleNamespace(context=active_context),
    })
    monkeypatch.setattr(native_chats, "_settled", OrderedDict([("old", settled_context)]))
    assert native_chats.get_session_native_context(QUICK_ID) is active_context
    monkeypatch.setattr(native_chats, "_active", {})
    assert native_chats.get_session_native_context(QUICK_ID) is settled_context


def test_scoped_quickchat_cannot_enter_stream_without_accepted_native_context(monkeypatch, tmp_path):
    from web.api import streaming
    monkeypatch.setenv("LASTBROWSER_NATIVE_CHAT_WORKER", "1")
    session = SimpleNamespace(space_scope=SCOPE)
    with pytest.raises(PermissionError, match="accepted worker binding"):
        streaming._resolve_native_stream_space(session, QUICK_ID, STREAM_ID, str(tmp_path))


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
