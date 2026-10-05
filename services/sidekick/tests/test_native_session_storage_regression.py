import io
import json
import asyncio
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest

from test_native_chat_process import fixture_context
from runtime.independent.contracts import new_id


class _PostHandler:
    def __init__(self, body, token):
        raw = json.dumps(body).encode("utf-8")
        self.rfile = io.BytesIO(raw)
        self.wfile = io.BytesIO()
        self.headers = {"Content-Length": str(len(raw)), "Host": "localhost",
                        "Origin": "http://localhost", "X-Lastbrowser-Bridge-Token": token}
        self.status = None

    def send_response(self, status): self.status = status
    def send_header(self, *_args): pass
    def end_headers(self): pass


@pytest.fixture
def native_post(tmp_path, monkeypatch):
    from runtime.independent.scope_binding import ProfileHub
    from web.api import independent, profiles, routes
    from web.api.config import set_session_dir, clear_session_dir

    context, store = fixture_context(tmp_path, "a")
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    token = "bridge-" + new_id()
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", token)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "a")
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: context.workspace)
    foreign_session_dir = tmp_path / "ambient-foreign" / "sessions"
    foreign_session_dir.mkdir(parents=True)
    set_session_dir(foreign_session_dir)
    store.release_lease(context.writer_lease_id, owner_generation=context.writer_generation)
    yield routes, context, store, token, hub, foreign_session_dir
    clear_session_dir()
    hub.close(); store.close()


def _post(routes, context, token, body):
    handler = _PostHandler(body, token)
    routes.handle_post(handler, SimpleNamespace(path="/api/session/new"))
    payload = json.loads(handler.wfile.getvalue().decode("utf-8"))
    return handler.status, payload


def test_delegated_workspace_read_selects_actual_own_transcript_with_duplicate_locator(native_post, monkeypatch):
    from cli.web_server import _bound_workspace_session
    from web.api import independent
    from web.api.space_engine import Space
    from runtime.independent.contracts import Scope, SpaceBinding
    _, context, store, _, hub, _ = native_post
    monkeypatch.setattr(independent, "_hub", hub)
    binding = store.get_binding(context.scope)
    store.bind_space(binding.model_copy(update={"workspace_locator": context.workspace, "revision": 2}), expected_revision=1)
    other = Space("other", custom_root=Path(context.profile_home) / "spaces")
    other.save_config({"name": "Other"}, mint_space_id=True)
    other_scope = Scope(backend_profile_id=context.scope.backend_profile_id,
        space_id=other.load_config()["space_id"], browser_profile_id="default")
    store.bind_space(SpaceBinding(scope=other_scope, native_slug="other", partition_key="persist:other",
        workspace_locator=context.workspace))
    path = Path(context.sessions_dir) / (context.session_id + ".json")
    raw = json.loads(path.read_text("utf-8"))
    raw["independent"] = {"scope": context.scope.model_dump(mode="json", by_alias=True)}
    path.write_text(json.dumps(raw), "utf-8")
    selected = _bound_workspace_session(Path(context.workspace), context.session_id)
    assert selected and selected[0] == path and selected[2] == raw["independent"]["scope"]
    raw["profile"] = "foreign"
    path.write_text(json.dumps(raw), "utf-8")
    assert _bound_workspace_session(Path(context.workspace), context.session_id) is None
    assert _bound_workspace_session(Path(context.workspace), "../foreign") is None


def test_old_delegated_chat_is_listed_and_read_with_scope_without_rewriting(native_post, monkeypatch):
    from cli import web_server
    from web.api import independent, workspace, goals
    from starlette.requests import Request
    _, context, store, _, hub, _ = native_post
    monkeypatch.setattr(independent, "_hub", hub)
    monkeypatch.setattr(workspace, "resolve_trusted_workspace_read_only", lambda value: context.workspace)
    monkeypatch.setattr(goals, "goal_state_for_session", lambda *args, **kwargs: None)
    binding = store.get_binding(context.scope)
    store.bind_space(binding.model_copy(update={"workspace_locator": context.workspace, "revision": 2}), expected_revision=1)
    path = Path(context.sessions_dir) / (context.session_id + ".json")
    raw = json.loads(path.read_text("utf-8"))
    raw.pop("space_scope")
    raw.update(independent={"scope": context.scope.model_dump(mode="json", by_alias=True)},
        active_stream_id=None, pending_user_message=None, messages=[{"role": "assistant", "content": "old saved response"}])
    path.write_text(json.dumps(raw), "utf-8")
    before = path.read_bytes()
    rows = web_server._bound_workspace_sessions(Path(context.workspace))
    assert len(rows) == 1 and rows[0]["session_id"] == context.session_id
    assert rows[0]["space_scope"] == raw["independent"]["scope"]
    assert "messages" not in rows[0] and "pending_user_message" not in rows[0]
    query = urlencode({"session_id": context.session_id, "workspace_path": context.workspace})
    request = Request({"type": "http", "method": "GET", "path": "/api/session", "query_string": query.encode(), "headers": []})
    result = asyncio.run(web_server.get_space_session_detail(request))
    assert result["session"]["space_scope"] == raw["independent"]["scope"]
    assert result["session"]["messages"] == raw["messages"]
    assert path.read_bytes() == before
    raw["space_scope"] = {**raw["independent"]["scope"], "spaceId": new_id()}
    path.write_text(json.dumps(raw), "utf-8")
    assert web_server._bound_workspace_sessions(Path(context.workspace)) == []


def test_normal_native_chat_is_read_and_listed_only_through_its_original_binding(native_post, monkeypatch):
    from cli import web_server
    from web.api import independent, workspace, goals
    from starlette.requests import Request
    _, context, store, _, hub, _ = native_post
    monkeypatch.setattr(independent, "_hub", hub)
    monkeypatch.setattr(workspace, "resolve_trusted_workspace_read_only", lambda value: context.workspace)
    monkeypatch.setattr(goals, "goal_state_for_session", lambda *args, **kwargs: None)
    binding = store.get_binding(context.scope)
    store.bind_space(binding.model_copy(update={"workspace_locator": context.workspace, "revision": 2}), expected_revision=1)
    path = Path(context.sessions_dir) / (context.session_id + ".json")
    raw = json.loads(path.read_text("utf-8"))
    raw.pop("independent", None)
    raw["active_stream_id"] = None
    raw["pending_user_message"] = None
    raw["space_scope"] = context.scope.model_dump(mode="json", by_alias=True)
    raw["messages"] = [{"role": "assistant", "content": "normal native response"}]
    path.write_text(json.dumps(raw), "utf-8")
    before = path.read_bytes()
    query = urlencode({"session_id": context.session_id, "workspace_path": context.workspace})
    request = Request({"type": "http", "method": "GET", "path": "/api/session", "query_string": query.encode(), "headers": []})
    result = asyncio.run(web_server.get_space_session_detail(request))
    assert result["session"]["space_scope"] == raw["space_scope"]
    assert result["session"]["messages"] == raw["messages"]
    assert len(web_server._bound_workspace_sessions(Path(context.workspace))) == 1
    assert path.read_bytes() == before
    for changes in ({"profile": "foreign"}, {"space_scope": {**raw["space_scope"], "spaceId": new_id()}},
                    {"space_scope": None}, {"workspace": str(Path(context.workspace) / "foreign")},
                    {"independent": "malformed"}):
        path.write_text(json.dumps({**raw, **changes}), "utf-8")
        assert web_server._bound_workspace_session(Path(context.workspace), context.session_id) is None
        assert web_server._bound_workspace_sessions(Path(context.workspace)) == []


def test_native_session_new_uses_canonical_space_storage_and_reloads(native_post):
    routes, context, store, token, hub, foreign_session_dir = native_post
    from web.api.models import Session
    from web.api.config import set_session_dir
    scope = context.scope.model_dump(mode="json", by_alias=True)
    before_foreign = {p.relative_to(foreign_session_dir): p.read_bytes()
                      for p in foreign_session_dir.rglob("*") if p.is_file()}
    status, payload = _post(routes, context, token, {"title": "native-probe", "profile": "a",
        "workspace": context.workspace, "space_scope": scope})
    assert status == 200, payload
    set_session_dir(context.sessions_dir)
    row = payload["session"]
    sid = row["session_id"]
    path = Path(context.sessions_dir) / f"{sid}.json"
    assert path.is_file()
    saved = json.loads(path.read_text("utf-8"))
    assert saved["space_scope"] == scope and saved["profile"] == "a"
    assert not (Path(context.workspace) / "nova" / "sessions" / path.name).exists()
    assert {p.relative_to(foreign_session_dir): p.read_bytes()
            for p in foreign_session_dir.rglob("*") if p.is_file()} == before_foreign
    reloaded = Session.load(sid)
    assert reloaded is not None and Path(reloaded.path) == path
    assert store.list_leases() == ()


def test_native_session_metadata_remains_verifiable_when_large_fields_are_saved(native_post):
    routes, context, store, token, hub, _foreign_session_dir = native_post
    from web.api.config import set_session_dir
    set_session_dir(context.sessions_dir)
    from web.api.models import Session
    from runtime.independent.model_policy_session import validate_native_session
    scope = context.scope.model_dump(mode="json", by_alias=True)
    status, payload = _post(routes, context, token, {"title": "native-large", "profile": "a",
        "workspace": context.workspace, "space_scope": scope})
    assert status == 200
    session = Session.load(payload["session"]["session_id"])
    session.pending_user_message = "p" * 70000
    session.grill_state = {"objective": "g" * 70000, "scope": scope,
                           "sessionId": session.session_id, "modeRevision": 1,
                           "revision": 1, "status": "asking", "topics": [], "questions": [], "requests": []}
    session.save()
    reloaded = Session.load(session.session_id)
    assert reloaded is not None and reloaded.space_scope == scope
    resolved = hub.by_scope(context.scope, "a")[1].resolve(context.scope, authenticated_profile_name="a")
    assert validate_native_session(resolved, session.session_id, actor="a") is not None
    assert not (Path(context.workspace) / "nova" / "sessions" / f"{session.session_id}.json").exists()
    assert store.list_leases() == ()
