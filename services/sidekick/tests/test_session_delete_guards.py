"""Chat deletion: what blocks an idle chat, and what a failed removal leaves behind.

Writers and runs whose owner is gone must not block; a live owner must.
Failed file removal must surface as an error and keep the chat loadable.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime.independent.chat_binding import assert_session_writer_available
from runtime.independent.contracts import Scope, new_id
from runtime.independent.scope import ScopeError
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.store import ResourceBusy

TestClient = pytest.importorskip("fastapi.testclient").TestClient


def _session_id() -> str:
    return "chat" + uuid.uuid4().hex[:20]


@pytest.fixture
def scoped(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    state = home / "webui"
    state.mkdir()
    space = tmp_path / "A"
    space.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path": str(space), "name": space.name}]), encoding="utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    scope = Scope.model_validate(hub.bind("default", {"workspacePath": str(space), "browserProfileId": "browser",
                                                       "partitionKey": "persist:chat-delete"})["scope"])
    store, resolver = hub.by_scope(scope, "default")
    try:
        yield SimpleNamespace(hub=hub, scope=scope, store=store, resolver=resolver)
    finally:
        hub.close()


def _space_session(scope, sid: str, run_id: str | None = None):
    marker = {"scope": scope.model_dump(by_alias=True), "runId": run_id} if run_id else None
    return SimpleNamespace(session_id=sid, profile="default", space_scope=scope.model_dump(by_alias=True),
                           independent=marker)


def _pin_store(ctx, monkeypatch) -> None:
    monkeypatch.setattr(ctx.hub, "by_scope", lambda scope, actor: (ctx.store, ctx.resolver))


def _run_state(ctx, monkeypatch, *, state: str, runner_generation: str | None, run_id: str) -> None:
    from web.api import independent
    record = SimpleNamespace(run_id=run_id, scope=ctx.scope, state=state)
    context = SimpleNamespace(runner_generation=runner_generation or independent._GENERATION)
    monkeypatch.setattr(ctx.store, "get_run", lambda rid: record if rid == run_id else None)
    monkeypatch.setattr(ctx.store, "get_run_context", lambda rid: context)


# --- What blocks an idle chat: writer leases -------------------------------------------------

def test_writer_lease_of_an_exited_process_does_not_block_delete(scoped, monkeypatch):
    _pin_store(scoped, monkeypatch)
    sid = _session_id()
    exited = subprocess.Popen([sys.executable, "-c", "pass"])
    exited.wait()
    scoped.store.acquire_chat_writer(scoped.scope, sid, "turn-of-exited-backend", "earlier-backend",
                                     owner_identity={"hostPid": exited.pid, "hostCreationIdentity": "1"})

    assert_session_writer_available(_space_session(scoped.scope, sid), actor="default", profile_hub=scoped.hub, deleting=True)

    assert scoped.store.list_leases() == ()


def test_writer_lease_of_a_live_process_still_blocks_delete(scoped, monkeypatch):
    from web.api.local_ai_setup import process_identity
    _pin_store(scoped, monkeypatch)
    sid = _session_id()
    state, creation = process_identity(os.getpid())
    assert state == "alive" and creation
    scoped.store.acquire_chat_writer(scoped.scope, sid, "turn-of-live-backend", "other-live-backend",
                                     owner_identity={"hostPid": os.getpid(), "hostCreationIdentity": creation})

    with pytest.raises(ResourceBusy, match="still being written"):
        assert_session_writer_available(_space_session(scoped.scope, sid), actor="default", profile_hub=scoped.hub,
                                        deleting=True)
    assert len(scoped.store.list_leases()) == 1


def test_writer_lease_without_recorded_identity_is_never_presumed_dead(scoped, monkeypatch):
    _pin_store(scoped, monkeypatch)
    sid = _session_id()
    scoped.store.acquire_chat_writer(scoped.scope, sid, "competing-turn", "other-backend")

    with pytest.raises(ResourceBusy):
        assert_session_writer_available(_space_session(scoped.scope, sid), actor="default", profile_hub=scoped.hub,
                                        deleting=True)


# --- What blocks an idle chat: run markers ---------------------------------------------------

def test_run_marker_without_run_record_does_not_block_delete_but_still_fails_closed_for_turns(scoped, monkeypatch):
    _pin_store(scoped, monkeypatch)
    session = _space_session(scoped.scope, _session_id(), run_id=new_id())

    assert_session_writer_available(session, actor="default", profile_hub=scoped.hub, deleting=True)

    with pytest.raises(ScopeError, match="cannot be verified"):
        assert_session_writer_available(session, actor="default", profile_hub=scoped.hub)


def test_active_run_still_blocks_delete_with_a_clear_message(scoped, monkeypatch):
    _pin_store(scoped, monkeypatch)
    run_id = new_id()
    _run_state(scoped, monkeypatch, state="running", runner_generation=None, run_id=run_id)

    with pytest.raises(ResourceBusy, match="pause or stop that run first"):
        assert_session_writer_available(_space_session(scoped.scope, _session_id(), run_id=run_id),
                                        actor="default", profile_hub=scoped.hub, deleting=True)


def test_run_left_by_an_earlier_backend_process_does_not_block_delete(scoped, monkeypatch):
    _pin_store(scoped, monkeypatch)
    run_id = new_id()
    _run_state(scoped, monkeypatch, state="running", runner_generation="earlier-backend", run_id=run_id)

    assert_session_writer_available(_space_session(scoped.scope, _session_id(), run_id=run_id),
                                    actor="default", profile_hub=scoped.hub, deleting=True)


# --- Route: idle deletion, refusal, and failed file removal ----------------------------------

def _request_space_sessions_dir() -> Path:
    """The Space folder that requests for the default profile resolve to."""
    from web.api.profiles import clear_request_profile, set_request_profile
    from web.api.space_engine import DEFAULT_SPACE_SLUG, get_or_create_workspace
    token = set_request_profile("default")
    try:
        owner = get_or_create_workspace(DEFAULT_SPACE_SLUG)
        owner.sessions_dir.mkdir(parents=True, exist_ok=True)
        return Path(owner.sessions_dir)
    finally:
        clear_request_profile(token)


@pytest.fixture
def delete_route(monkeypatch, tmp_path, scoped):
    from web.api import config, independent, models, profiles
    from cli import web_server

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "route-home"))
    profiles.refresh_profile_base_home_from_env()
    config.refresh_runtime_paths_from_env()
    monkeypatch.setattr(independent, "hub", lambda: scoped.hub)
    _pin_store(scoped, monkeypatch)
    headers = {web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN, "Cookie": "sidekick_profile=default"}
    sessions = _request_space_sessions_dir()
    yield SimpleNamespace(client=TestClient(web_server.app), headers=headers, sessions=sessions, models=models,
                          config=config)
    config.clear_session_dir()


def _write_space_session_file(sessions: Path, scope, sid: str, run_id: str | None = None) -> Path:
    marker = {"scope": scope.model_dump(by_alias=True), "runId": run_id} if run_id else None
    row = {"session_id": sid, "title": "Idle Space chat", "profile": "default", "workspace": str(scope),
           "messages": [{"role": "user", "content": "saved user turn"}], "message_count": 1,
           "space_scope": scope.model_dump(by_alias=True), "independent": marker,
           "created_at": 1_800_000_000.0, "updated_at": 1_800_000_000.0}
    path = sessions / f"{sid}.json"
    path.write_text(json.dumps(row), encoding="utf-8")
    return path


def test_idle_space_session_deletes_and_leaves_the_list(delete_route, scoped):
    sid = _session_id()
    path = _write_space_session_file(delete_route.sessions, scoped.scope, sid)

    response = delete_route.client.post("/api/session/delete", json={"session_id": sid}, headers=delete_route.headers)

    assert response.status_code == 200, response.text
    assert response.json()["ok"] is True
    assert not path.exists()
    delete_route.config.set_session_dir(delete_route.sessions)
    with pytest.raises(KeyError):
        delete_route.models.get_session(sid)
    assert sid not in [row["session_id"] for row in delete_route.models.all_sessions()]


def test_active_run_refuses_delete_with_409_and_keeps_the_file(delete_route, scoped, monkeypatch):
    sid = _session_id()
    run_id = new_id()
    path = _write_space_session_file(delete_route.sessions, scoped.scope, sid, run_id=run_id)
    _run_state(scoped, monkeypatch, state="running", runner_generation=None, run_id=run_id)

    response = delete_route.client.post("/api/session/delete", json={"session_id": sid}, headers=delete_route.headers)

    assert response.status_code == 409, response.text
    body = response.json()
    assert body["ok"] is False and body["deleted"] is False
    assert "pause or stop that run first" in body["error"]
    assert path.exists()


def test_failed_file_removal_returns_500_and_keeps_the_chat_loadable(delete_route, scoped, monkeypatch):
    sid = _session_id()
    path = _write_space_session_file(delete_route.sessions, scoped.scope, sid)
    original_unlink = Path.unlink

    def refuse_session_file(self, missing_ok=False):
        if self.name == f"{sid}.json":
            raise PermissionError("file is locked")
        return original_unlink(self, missing_ok=missing_ok)

    monkeypatch.setattr(Path, "unlink", refuse_session_file)

    response = delete_route.client.post("/api/session/delete", json={"session_id": sid}, headers=delete_route.headers)

    assert response.status_code == 500
    body = response.json()
    assert body["error_code"] == "session_file_remains"
    assert body["ok"] is False and body["deleted"] is False
    assert "could not be removed" in body["error"]
    assert path.exists()
    assert not delete_route.models._is_session_deleted(sid)
    delete_route.config.set_session_dir(delete_route.sessions)
    assert delete_route.models.get_session(sid).session_id == sid
